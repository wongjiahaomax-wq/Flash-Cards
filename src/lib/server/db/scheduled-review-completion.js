import { and, eq, sql } from 'drizzle-orm';

import { activeReviews } from './active-review-schema.js';
import {
  learnerAggregates,
  learnerCaseEncounters,
  learnerCaseFsrs,
  learnerFsrsProfiles,
  learnerOptimizerEvidence,
  learnerSystemAggregates,
  scheduledReviewEvents
} from './fsrs-schema.js';
import { buildDetailedHistoryCleanupStatements } from './fsrs-retention.js';
import {
  createInitialFsrsCard,
  deserializeFsrsParameters,
  scheduleFsrsReview
} from '../learning/fsrs-scheduler.js';
import {
  issueScheduledRepeatOriginProof,
  verifyScheduledRunBoundaryToken
} from '../learning/study-run-proof.js';

const DATABASE_NOW_MS = sql`cast((julianday('now') - 2440587.5) * 86400000 as integer)`;
const SCHEDULED_RATINGS = new Set(['again', 'hard', 'good', 'easy']);
const SHORT_TERM_FSRS_STATES = new Set([1, 3]);

export class ScheduledReviewCompletionError extends Error {
  /**
   * @param {'invalid-input'|'unavailable'|'unrevealed'|'stale-run'|'stale-case-state'|'expired'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'ScheduledReviewCompletionError';
    this.code = code;
  }
}

/** @param {unknown} value @param {string} label */
function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new ScheduledReviewCompletionError('invalid-input', `${label} is required.`);
  }
  return normalized;
}

/** @param {unknown} value */
function assertRating(value) {
  if (typeof value !== 'string' || !SCHEDULED_RATINGS.has(value)) {
    throw new ScheduledReviewCompletionError(
      'invalid-input',
      'Scheduled Review rating must be Again, Hard, Good, or Easy.'
    );
  }
  return /** @type {'again'|'hard'|'good'|'easy'} */ (value);
}

/** @param {Date|number|string|null|undefined} value */
function timestampMs(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/** @param {unknown} cause */
function databaseErrorMessage(cause) {
  return cause instanceof Error ? cause.message : String(cause ?? '');
}

/** @param {any} profile @param {any} review */
function profileMatchesReview(profile, review) {
  return Boolean(profile)
    && Number(profile.generation) === Number(review.generation)
    && Number(profile.reviewSequenceEpoch) === Number(review.reviewSequenceEpoch)
    && Number(profile.parameterRevision) === Number(review.parameterRevision)
    && Number(profile.schedulerRevision) === Number(review.schedulerRevision)
    && String(profile.schedulerLibraryVersion) === String(review.schedulerLibraryVersion);
}

/** @param {any} state @param {any} review */
function stateMatchesReview(state, review) {
  return Boolean(state)
    && Number(state.generation) === Number(review.generation)
    && Number(state.reviewSequenceEpoch) === Number(review.reviewSequenceEpoch)
    && Number(state.parameterRevision) === Number(review.parameterRevision)
    && Number(state.schedulerRevision) === Number(review.schedulerRevision)
    && String(state.schedulerLibraryVersion) === String(review.schedulerLibraryVersion)
    && Number(state.stateRevision) === Number(review.expectedStateRevision)
    && timestampMs(state.dueAt) === timestampMs(review.expectedDueAt);
}

/** @param {any} state */
function persistedCard(state) {
  const dueAt = timestampMs(state.dueAt);
  if (dueAt == null) {
    throw new ScheduledReviewCompletionError('stale-case-state', 'Current FSRS state has an invalid due time.');
  }
  return {
    dueAt,
    stability: Number(state.stability),
    difficulty: Number(state.difficulty),
    state: Number(state.state),
    elapsedDays: Number(state.elapsedDays),
    scheduledDays: Number(state.scheduledDays),
    learningSteps: Number(state.learningSteps),
    reps: Number(state.reps),
    lapses: Number(state.lapses),
    lastReviewAt: timestampMs(state.lastReviewAt)
  };
}

/** @param {number} state */
export function isFsrsInRunRepeatState(state) {
  return SHORT_TERM_FSRS_STATES.has(Number(state));
}

/**
 * Pure preparation step. Pre-reads improve errors and provide scheduler input;
 * database triggers remain the write-time authority for the eventual commit.
 *
 * @param {{activeReview:any,profile:any,state:any|null,rating:'again'|'hard'|'good'|'easy',completedAt:number}} input
 */
export function prepareScheduledReviewCompletion(input) {
  const review = input.activeReview;
  if (review.studyMode !== 'scheduled') {
    throw new ScheduledReviewCompletionError('unavailable', 'This active Review is not a Scheduled Review.');
  }
  if (!review.revealedAt) {
    throw new ScheduledReviewCompletionError('unrevealed', 'Reveal the answers before rating this Review.');
  }
  if (!profileMatchesReview(input.profile, review)) {
    throw new ScheduledReviewCompletionError('stale-run', 'This Scheduled Review no longer matches the learner FSRS profile.');
  }

  let sourceCard;
  let resultingStateRevision;
  if (review.queueClass === 'new') {
    if (input.state) {
      throw new ScheduledReviewCompletionError('stale-case-state', 'This Case is no longer New in the current learner state.');
    }
    sourceCard = createInitialFsrsCard(input.completedAt);
    resultingStateRevision = 1;
  } else if (review.queueClass === 'due' || review.queueClass === 'repeat') {
    if (!stateMatchesReview(input.state, review)) {
      throw new ScheduledReviewCompletionError(
        'stale-case-state',
        'This Case changed scheduling state before the Review could complete.'
      );
    }
    sourceCard = persistedCard(input.state);
    resultingStateRevision = Number(review.expectedStateRevision) + 1;
  } else {
    throw new ScheduledReviewCompletionError('unavailable', 'Scheduled Review queue class is invalid.');
  }

  const transition = scheduleFsrsReview({
    card: sourceCard,
    rating: input.rating,
    now: input.completedAt,
    parameters: deserializeFsrsParameters(input.profile.parametersJson)
  });
  if (
    Number(transition.schedulerRevision) !== Number(review.schedulerRevision)
    || String(transition.schedulerLibraryVersion) !== String(review.schedulerLibraryVersion)
  ) {
    throw new ScheduledReviewCompletionError('stale-run', 'The scheduler revision changed before completion.');
  }

  return {
    completedAt: input.completedAt,
    resultingStateRevision,
    resultingState: Number(transition.card.state),
    nextDueAt: Number(transition.nextDueAt),
    state: {
      ...transition.card,
      generation: Number(review.generation),
      reviewSequenceEpoch: Number(review.reviewSequenceEpoch),
      parameterRevision: Number(review.parameterRevision),
      schedulerRevision: Number(review.schedulerRevision),
      schedulerLibraryVersion: String(review.schedulerLibraryVersion),
      stateRevision: resultingStateRevision
    }
  };
}

/** @param {import('./index.js').LearningDb} db @param {string} userId @param {string} reviewId */
async function readReceipt(db, userId, reviewId) {
  const rows = await db
    .select()
    .from(scheduledReviewEvents)
    .where(and(eq(scheduledReviewEvents.id, reviewId), eq(scheduledReviewEvents.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

/** @param {import('./index.js').LearningDb} db @param {string} userId @param {string} reviewId */
async function readCompletableActiveReview(db, userId, reviewId) {
  const rows = await db
    .select()
    .from(activeReviews)
    .where(and(
      eq(activeReviews.id, reviewId),
      eq(activeReviews.userId, userId),
      eq(activeReviews.studyMode, 'scheduled'),
      sql`${activeReviews.expiresAt} > ${DATABASE_NOW_MS}`
    ))
    .limit(1);
  return rows[0] ?? null;
}

/** @param {any} receipt @param {any} boundary */
function receiptMatchesBoundary(receipt, boundary) {
  return receipt.runId === boundary.runId
    && receipt.scopeFingerprint === boundary.scopeFingerprint
    && timestampMs(receipt.runStartedAt) === Number(boundary.runStartedAt)
    && Number(receipt.generation) === Number(boundary.generation)
    && Number(receipt.reviewSequenceEpoch) === Number(boundary.reviewSequenceEpoch)
    && Number(receipt.parameterRevision) === Number(boundary.parameterRevision)
    && Number(receipt.schedulerRevision) === Number(boundary.schedulerRevision)
    && String(receipt.schedulerLibraryVersion) === String(boundary.schedulerLibraryVersion);
}

/**
 * @param {{receipt:any,userId:string,requestedRating:'again'|'hard'|'good'|'easy',runBoundaryToken:string,proofSecret:string,serverNow:number}} input
 */
async function completionResponse(input) {
  const boundary = await verifyScheduledRunBoundaryToken(input.runBoundaryToken, {
    secret: input.proofSecret,
    userId: input.userId
  });
  if (!receiptMatchesBoundary(input.receipt, boundary)) {
    throw new ScheduledReviewCompletionError('stale-run', 'Completion receipt belongs to another Scheduled run boundary.');
  }

  const payloadMismatch = input.receipt.rating !== input.requestedRating;
  let repeatEntry = null;
  if (isFsrsInRunRepeatState(input.receipt.resultingState)) {
    repeatEntry = {
      caseId: input.receipt.caseId,
      stateRevision: Number(input.receipt.resultingStateRevision),
      dueAt: /** @type {Date} */ (input.receipt.nextDueAt).getTime(),
      workProof: await issueScheduledRepeatOriginProof({
        secret: input.proofSecret,
        runToken: input.runBoundaryToken,
        boundary,
        caseId: input.receipt.caseId,
        stateRevision: Number(input.receipt.resultingStateRevision),
        dueAt: /** @type {Date} */ (input.receipt.nextDueAt).getTime()
      })
    };
  }

  return {
    eventId: input.receipt.id,
    caseId: input.receipt.caseId,
    queueClass: input.receipt.queueClass,
    rating: input.receipt.rating,
    requestedRating: input.requestedRating,
    payloadMismatch,
    completedAt: /** @type {Date} */ (input.receipt.completedAt).getTime(),
    resultingStateRevision: Number(input.receipt.resultingStateRevision),
    resultingState: Number(input.receipt.resultingState),
    nextDueAt: /** @type {Date} */ (input.receipt.nextDueAt).getTime(),
    repeatEntry,
    serverNow: input.serverNow
  };
}

/** @param {unknown} cause */
function mappedWriteError(cause) {
  if (cause instanceof ScheduledReviewCompletionError) return cause;
  const message = databaseErrorMessage(cause);
  if (message.includes('scheduled_completion_unrevealed')) {
    return new ScheduledReviewCompletionError('unrevealed', 'Reveal the answers before rating this Review.');
  }
  if (message.includes('scheduled_completion_expired')) {
    return new ScheduledReviewCompletionError('expired', 'This active Review expired before completion could commit.');
  }
  if (message.includes('scheduled_completion_stale_boundary')) {
    return new ScheduledReviewCompletionError('stale-run', 'This Scheduled Review no longer matches the learner FSRS profile.');
  }
  if (message.includes('scheduled_completion_stale_case_state')) {
    return new ScheduledReviewCompletionError('stale-case-state', 'This Case changed scheduling state before completion could commit.');
  }
  if (message.includes('scheduled_completion_active_review_changed') || message.includes('scheduled_completion_missing_context')) {
    return new ScheduledReviewCompletionError('unavailable', 'This active Scheduled Review is no longer available for completion.');
  }
  return cause;
}

/** @param {'again'|'hard'|'good'|'easy'} rating */
function ratingCounts(rating) {
  return {
    again: rating === 'again' ? 1 : 0,
    hard: rating === 'hard' ? 1 : 0,
    good: rating === 'good' ? 1 : 0,
    easy: rating === 'easy' ? 1 : 0
  };
}

/**
 * Complete one frozen Scheduled Review exactly once. The durable event is both
 * human-readable history and the completion idempotency receipt.
 *
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   reviewId:string,
 *   rating:'again'|'hard'|'good'|'easy',
 *   runBoundaryToken:string,
 *   proofSecret:string,
 *   now?:Date|number|string
 * }} input
 */
export async function completeScheduledReview(input) {
  const userId = requiredString(input.userId, 'Learner');
  const reviewId = requiredString(input.reviewId, 'Active Review');
  const rating = assertRating(input.rating);
  const serverNow = timestampMs(input.now ?? new Date());
  if (serverNow == null) {
    throw new ScheduledReviewCompletionError('invalid-input', 'Scheduled completion time is invalid.');
  }

  const existingReceipt = await readReceipt(input.db, userId, reviewId);
  if (existingReceipt) {
    return {
      status: 'replayed',
      ...(await completionResponse({
        receipt: existingReceipt,
        userId,
        requestedRating: rating,
        runBoundaryToken: input.runBoundaryToken,
        proofSecret: input.proofSecret,
        serverNow
      }))
    };
  }

  const activeReview = await readCompletableActiveReview(input.db, userId, reviewId);
  if (!activeReview) {
    const racedReceipt = await readReceipt(input.db, userId, reviewId);
    if (racedReceipt) {
      return {
        status: 'replayed',
        ...(await completionResponse({
          receipt: racedReceipt,
          userId,
          requestedRating: rating,
          runBoundaryToken: input.runBoundaryToken,
          proofSecret: input.proofSecret,
          serverNow
        }))
      };
    }
    throw new ScheduledReviewCompletionError('unavailable', 'No unexpired active Scheduled Review is available to complete.');
  }

  const boundary = await verifyScheduledRunBoundaryToken(input.runBoundaryToken, {
    secret: input.proofSecret,
    userId
  });
  if (
    activeReview.runId !== boundary.runId
    || activeReview.scopeFingerprint !== boundary.scopeFingerprint
    || timestampMs(activeReview.runStartedAt) !== boundary.runStartedAt
    || Number(activeReview.generation) !== boundary.generation
    || Number(activeReview.reviewSequenceEpoch) !== boundary.reviewSequenceEpoch
    || Number(activeReview.parameterRevision) !== boundary.parameterRevision
    || Number(activeReview.schedulerRevision) !== boundary.schedulerRevision
    || String(activeReview.schedulerLibraryVersion) !== boundary.schedulerLibraryVersion
  ) {
    throw new ScheduledReviewCompletionError('stale-run', 'Active Review belongs to another Scheduled run boundary.');
  }

  const [profileRows, stateRows] = await Promise.all([
    input.db
      .select()
      .from(learnerFsrsProfiles)
      .where(eq(learnerFsrsProfiles.userId, userId))
      .limit(1),
    input.db
      .select()
      .from(learnerCaseFsrs)
      .where(and(eq(learnerCaseFsrs.userId, userId), eq(learnerCaseFsrs.caseId, activeReview.caseId)))
      .limit(1)
  ]);
  const profile = profileRows[0] ?? null;
  const currentState = stateRows[0] ?? null;
  const prepared = prepareScheduledReviewCompletion({
    activeReview,
    profile,
    state: currentState,
    rating,
    completedAt: serverNow
  });

  const sequenceRows = await input.db
    .select({
      maxSequenceNo: sql`coalesce(max(${learnerOptimizerEvidence.sequenceNo}), 0)`
    })
    .from(learnerOptimizerEvidence)
    .where(and(
      eq(learnerOptimizerEvidence.userId, userId),
      eq(learnerOptimizerEvidence.caseId, activeReview.caseId),
      eq(learnerOptimizerEvidence.generation, Number(activeReview.generation)),
      eq(learnerOptimizerEvidence.reviewSequenceEpoch, Number(activeReview.reviewSequenceEpoch))
    ));
  const sequenceNo = Number(sequenceRows[0]?.maxSequenceNo ?? 0) + 1;
  if (!Number.isInteger(sequenceNo) || sequenceNo < 1) {
    throw new ScheduledReviewCompletionError('stale-case-state', 'Optimizer sequence state is invalid.');
  }

  const client = input.db.$client;
  if (!client || typeof client.prepare !== 'function' || typeof client.batch !== 'function') {
    throw new Error('Scheduled Review completion requires a Cloudflare D1 client with atomic batch support.');
  }

  const counts = ratingCounts(rating);
  const state = prepared.state;
  const writes = [
    ...buildDetailedHistoryCleanupStatements(client, userId),
    client.prepare(`
      INSERT INTO scheduled_review_events (
        id, user_id, case_id, case_title_snapshot, system_id, completed_at, rating,
        content_mode, generation, review_sequence_epoch, sequence_no, parameter_revision,
        scheduler_revision, scheduler_library_version, resulting_state_revision,
        next_due_at, queue_class, run_id, scope_fingerprint, run_started_at, resulting_state
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reviewId,
      userId,
      activeReview.caseId,
      activeReview.caseTitleSnapshot,
      activeReview.systemId,
      prepared.completedAt,
      rating,
      activeReview.contentMode,
      Number(activeReview.generation),
      Number(activeReview.reviewSequenceEpoch),
      sequenceNo,
      Number(activeReview.parameterRevision),
      Number(activeReview.schedulerRevision),
      String(activeReview.schedulerLibraryVersion),
      prepared.resultingStateRevision,
      prepared.nextDueAt,
      activeReview.queueClass,
      activeReview.runId,
      activeReview.scopeFingerprint,
      timestampMs(activeReview.runStartedAt),
      prepared.resultingState
    ),
    client.prepare(`
      INSERT INTO learner_optimizer_evidence (
        event_id, user_id, case_id, completed_at, rating, generation,
        review_sequence_epoch, sequence_no
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      reviewId,
      userId,
      activeReview.caseId,
      prepared.completedAt,
      rating,
      Number(activeReview.generation),
      Number(activeReview.reviewSequenceEpoch),
      sequenceNo
    ),
    client.prepare(`
      INSERT INTO learner_case_fsrs (
        user_id, case_id, due_at, stability, difficulty, state, elapsed_days,
        scheduled_days, learning_steps, reps, lapses, last_review_at,
        generation, review_sequence_epoch, parameter_revision, scheduler_revision,
        scheduler_library_version, state_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, case_id) DO UPDATE SET
        due_at = excluded.due_at,
        stability = excluded.stability,
        difficulty = excluded.difficulty,
        state = excluded.state,
        elapsed_days = excluded.elapsed_days,
        scheduled_days = excluded.scheduled_days,
        learning_steps = excluded.learning_steps,
        reps = excluded.reps,
        lapses = excluded.lapses,
        last_review_at = excluded.last_review_at,
        generation = excluded.generation,
        review_sequence_epoch = excluded.review_sequence_epoch,
        parameter_revision = excluded.parameter_revision,
        scheduler_revision = excluded.scheduler_revision,
        scheduler_library_version = excluded.scheduler_library_version,
        state_revision = excluded.state_revision,
        updated_at = cast((julianday('now') - 2440587.5) * 86400000 as integer)
    `).bind(
      userId,
      activeReview.caseId,
      state.dueAt,
      state.stability,
      state.difficulty,
      state.state,
      state.elapsedDays,
      state.scheduledDays,
      state.learningSteps,
      state.reps,
      state.lapses,
      state.lastReviewAt,
      state.generation,
      state.reviewSequenceEpoch,
      state.parameterRevision,
      state.schedulerRevision,
      state.schedulerLibraryVersion,
      state.stateRevision
    ),
    client.prepare(`
      INSERT INTO learner_case_encounters (user_id, case_id, first_scheduled_completed_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, case_id) DO UPDATE SET
        first_scheduled_completed_at = coalesce(
          learner_case_encounters.first_scheduled_completed_at,
          excluded.first_scheduled_completed_at
        ),
        updated_at = cast((julianday('now') - 2440587.5) * 86400000 as integer)
    `).bind(userId, activeReview.caseId, prepared.completedAt),
    client.prepare(`
      INSERT INTO learner_aggregates (
        user_id, scheduled_completed, scheduled_again, scheduled_hard,
        scheduled_good, scheduled_easy, first_activity_at, last_activity_at
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        scheduled_completed = learner_aggregates.scheduled_completed + 1,
        scheduled_again = learner_aggregates.scheduled_again + excluded.scheduled_again,
        scheduled_hard = learner_aggregates.scheduled_hard + excluded.scheduled_hard,
        scheduled_good = learner_aggregates.scheduled_good + excluded.scheduled_good,
        scheduled_easy = learner_aggregates.scheduled_easy + excluded.scheduled_easy,
        first_activity_at = coalesce(learner_aggregates.first_activity_at, excluded.first_activity_at),
        last_activity_at = excluded.last_activity_at,
        updated_at = cast((julianday('now') - 2440587.5) * 86400000 as integer)
    `).bind(userId, counts.again, counts.hard, counts.good, counts.easy, prepared.completedAt, prepared.completedAt),
    client.prepare(`
      INSERT INTO learner_system_aggregates (
        user_id, system_id, scheduled_completed, scheduled_again, scheduled_hard,
        scheduled_good, scheduled_easy, first_completed_at, last_completed_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, system_id) DO UPDATE SET
        scheduled_completed = learner_system_aggregates.scheduled_completed + 1,
        scheduled_again = learner_system_aggregates.scheduled_again + excluded.scheduled_again,
        scheduled_hard = learner_system_aggregates.scheduled_hard + excluded.scheduled_hard,
        scheduled_good = learner_system_aggregates.scheduled_good + excluded.scheduled_good,
        scheduled_easy = learner_system_aggregates.scheduled_easy + excluded.scheduled_easy,
        first_completed_at = coalesce(learner_system_aggregates.first_completed_at, excluded.first_completed_at),
        last_completed_at = excluded.last_completed_at,
        updated_at = cast((julianday('now') - 2440587.5) * 86400000 as integer)
    `).bind(
      userId,
      activeReview.systemId,
      counts.again,
      counts.hard,
      counts.good,
      counts.easy,
      prepared.completedAt,
      prepared.completedAt
    ),
    client.prepare(`
      DELETE FROM active_reviews
      WHERE id = ? AND user_id = ? AND study_mode = 'scheduled'
    `).bind(reviewId, userId)
  ];

  try {
    await client.batch(writes);
  } catch (cause) {
    const committed = await readReceipt(input.db, userId, reviewId);
    if (committed) {
      return {
        status: 'replayed',
        ...(await completionResponse({
          receipt: committed,
          userId,
          requestedRating: rating,
          runBoundaryToken: input.runBoundaryToken,
          proofSecret: input.proofSecret,
          serverNow
        }))
      };
    }
    throw mappedWriteError(cause);
  }

  const receipt = await readReceipt(input.db, userId, reviewId);
  if (!receipt) {
    throw new Error('Scheduled Review completion committed without a durable event receipt.');
  }
  return {
    status: 'completed',
    ...(await completionResponse({
      receipt,
      userId,
      requestedRating: rating,
      runBoundaryToken: input.runBoundaryToken,
      proofSecret: input.proofSecret,
      serverNow
    }))
  };
}
