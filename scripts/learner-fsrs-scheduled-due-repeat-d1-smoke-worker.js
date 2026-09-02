import { createDb } from '../src/lib/server/db/index.js';
import { ensureLearnerFsrsProfile } from '../src/lib/server/db/fsrs-bootstrap.js';
import { completeScheduledReview } from '../src/lib/server/db/scheduled-review-completion.js';
import {
  createInitialFsrsCard,
  deserializeFsrsParameters,
  scheduleFsrsReview
} from '../src/lib/server/learning/fsrs-scheduler.js';
import {
  fingerprintStudyScope,
  issueScheduledRunBoundaryToken
} from '../src/lib/server/learning/study-run-proof.js';

const proofSecret = 'scheduled-due-repeat-d1-smoke-secret-0123456789abcdefghijklmnopqrstuvwxyz';
const systemId = 'scheduled-completion-d1-smoke-system';
const topicId = 'scheduled-completion-d1-smoke-topic';
const caseId = 'scheduled-completion-d1-smoke-case';
const DAY_MS = 86_400_000;

const fixtures = {
  due: {
    userId: 'scheduled-completion-d1-smoke-due-user',
    reviewId: 'scheduled-completion-d1-smoke-due-review',
    runId: 'scheduled-completion-d1-smoke-due-run',
    queueClass: 'due',
    priorRating: 'easy',
    priorReviewOffsetMs: -90 * DAY_MS,
    completionRating: 'good'
  },
  repeat: {
    userId: 'scheduled-completion-d1-smoke-repeat-user',
    reviewId: 'scheduled-completion-d1-smoke-repeat-review',
    runId: 'scheduled-completion-d1-smoke-repeat-run',
    queueClass: 'repeat',
    priorRating: 'again',
    priorReviewOffsetMs: -15 * 60_000,
    completionRating: 'again'
  }
};

/** @param {unknown} value */
function json(value) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' }
  });
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

/** @param {D1Database} binding @param {string} userId */
async function ensureSmokeUser(binding, userId) {
  const current = Date.now();
  await binding.prepare(`
    INSERT OR IGNORE INTO \`user\` (
      \`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`
    ) VALUES (?, ?, ?, 1, ?, ?)
  `).bind(
    userId,
    userId,
    `${userId}@example.test`,
    current,
    current
  ).run();
}

/**
 * Seed the compact durable footprint of one earlier Scheduled completion while
 * intentionally omitting the human-readable Scheduled event, which may already
 * have aged out of its retention window. This makes sequence 2 and the existing
 * learner x Case upsert path observable in the correction smoke.
 *
 * @param {D1Database} binding
 * @param {{userId:string,reviewId:string}} fixture
 * @param {any} boundary
 * @param {ReturnType<typeof createInitialFsrsCard>} card
 * @param {'again'|'hard'|'good'|'easy'} rating
 * @param {number} completedAt
 */
async function seedPriorScheduledFootprint(binding, fixture, boundary, card, rating, completedAt) {
  const counts = ratingCounts(rating);
  await binding.batch([
    binding.prepare(`
      INSERT INTO learner_case_fsrs (
        user_id, case_id, due_at, stability, difficulty, state, elapsed_days,
        scheduled_days, learning_steps, reps, lapses, last_review_at,
        generation, review_sequence_epoch, parameter_revision, scheduler_revision,
        scheduler_library_version, state_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      fixture.userId,
      caseId,
      card.dueAt,
      card.stability,
      card.difficulty,
      card.state,
      card.elapsedDays,
      card.scheduledDays,
      card.learningSteps,
      card.reps,
      card.lapses,
      card.lastReviewAt,
      boundary.generation,
      boundary.reviewSequenceEpoch,
      boundary.parameterRevision,
      boundary.schedulerRevision,
      boundary.schedulerLibraryVersion
    ),
    binding.prepare(`
      INSERT INTO learner_optimizer_evidence (
        event_id, user_id, case_id, completed_at, rating, generation,
        review_sequence_epoch, sequence_no
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(
      `${fixture.reviewId}-prior-evidence`,
      fixture.userId,
      caseId,
      completedAt,
      rating,
      boundary.generation,
      boundary.reviewSequenceEpoch
    ),
    binding.prepare(`
      INSERT INTO learner_case_encounters (user_id, case_id, first_scheduled_completed_at)
      VALUES (?, ?, ?)
    `).bind(fixture.userId, caseId, completedAt),
    binding.prepare(`
      INSERT INTO learner_aggregates (
        user_id, scheduled_completed, scheduled_again, scheduled_hard,
        scheduled_good, scheduled_easy, first_activity_at, last_activity_at
      ) VALUES (?, 1, ?, ?, ?, ?, ?, ?)
    `).bind(
      fixture.userId,
      counts.again,
      counts.hard,
      counts.good,
      counts.easy,
      completedAt,
      completedAt
    ),
    binding.prepare(`
      INSERT INTO learner_system_aggregates (
        user_id, system_id, scheduled_completed, scheduled_again, scheduled_hard,
        scheduled_good, scheduled_easy, first_completed_at, last_completed_at
      ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).bind(
      fixture.userId,
      systemId,
      counts.again,
      counts.hard,
      counts.good,
      counts.easy,
      completedAt,
      completedAt
    )
  ]);
}

/**
 * @param {D1Database} binding
 * @param {import('../src/lib/server/db/index.js').LearningDb} db
 * @param {typeof fixtures.due | typeof fixtures.repeat} fixture
 */
async function createExistingStateFixture(binding, db, fixture) {
  await ensureSmokeUser(binding, fixture.userId);
  const profile = await ensureLearnerFsrsProfile(db, fixture.userId);
  const scope = {
    systemId,
    routes: [{ routeType: 'topic', routeId: topicId }]
  };
  const scopeFingerprint = await fingerprintStudyScope(scope);
  const runStartedAt = Date.now() - 1_000;
  const boundary = {
    userId: fixture.userId,
    runId: fixture.runId,
    runStartedAt,
    scopeFingerprint,
    generation: Number(profile.generation),
    reviewSequenceEpoch: Number(profile.reviewSequenceEpoch),
    parameterRevision: Number(profile.parameterRevision),
    schedulerRevision: Number(profile.schedulerRevision),
    schedulerLibraryVersion: String(profile.schedulerLibraryVersion)
  };
  const runBoundaryToken = await issueScheduledRunBoundaryToken({
    secret: proofSecret,
    boundary
  });

  const priorReviewAt = Date.now() + fixture.priorReviewOffsetMs;
  const transition = scheduleFsrsReview({
    card: createInitialFsrsCard(priorReviewAt),
    rating: fixture.priorRating,
    now: priorReviewAt,
    parameters: deserializeFsrsParameters(profile.parametersJson)
  });
  const priorCard = transition.card;

  if (priorCard.dueAt > runStartedAt) {
    throw new Error(`${fixture.queueClass} smoke fixture did not mature before the captured run boundary.`);
  }
  if (fixture.queueClass === 'repeat' && ![1, 3].includes(Number(priorCard.state))) {
    throw new Error(`Repeat smoke fixture did not begin from a short-term FSRS state: ${priorCard.state}.`);
  }

  await seedPriorScheduledFootprint(
    binding,
    fixture,
    boundary,
    priorCard,
    fixture.priorRating,
    priorReviewAt
  );

  await binding.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      expected_state_revision, expected_due_at, run_started_at,
      case_title_snapshot, snapshot_version, revealed_at
    ) VALUES (?, ?, ?, ?, 'scheduled', 'original', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 1,
      cast((julianday('now') - 2440587.5) * 86400000 as integer))
  `).bind(
    fixture.reviewId,
    fixture.userId,
    caseId,
    systemId,
    fixture.queueClass,
    fixture.runId,
    scopeFingerprint,
    JSON.stringify(scope),
    boundary.generation,
    boundary.reviewSequenceEpoch,
    boundary.parameterRevision,
    boundary.schedulerRevision,
    boundary.schedulerLibraryVersion,
    priorCard.dueAt,
    runStartedAt,
    `Scheduled ${fixture.queueClass} completion D1 smoke Case`
  ).run();

  return {
    ...fixture,
    boundary,
    runBoundaryToken,
    priorCard
  };
}

/**
 * @param {D1Database} binding
 * @param {{userId:string,reviewId:string}} fixture
 */
async function completionEvidence(binding, fixture) {
  return binding.prepare(`
    SELECT
      e.queue_class AS event_queue_class,
      e.sequence_no AS event_sequence_no,
      e.resulting_state_revision AS event_state_revision,
      e.resulting_state AS event_state,
      e.next_due_at AS event_due_at,
      s.state_revision AS state_revision,
      s.state AS state,
      s.due_at AS state_due_at,
      (SELECT count(*) FROM scheduled_review_events WHERE id = ?) AS event_count,
      (SELECT count(*) FROM learner_optimizer_evidence WHERE event_id = ?) AS current_optimizer_count,
      (SELECT count(*) FROM learner_optimizer_evidence WHERE user_id = ? AND case_id = ?) AS optimizer_total,
      (SELECT count(*) FROM learner_case_fsrs WHERE user_id = ? AND case_id = ?) AS case_state_count,
      (SELECT count(*) FROM learner_case_encounters WHERE user_id = ? AND case_id = ?) AS encounter_count,
      coalesce((SELECT scheduled_completed FROM learner_aggregates WHERE user_id = ?), 0) AS learner_scheduled,
      coalesce((SELECT scheduled_completed FROM learner_system_aggregates WHERE user_id = ? AND system_id = ?), 0) AS system_scheduled,
      (SELECT count(*) FROM active_reviews WHERE id = ? AND user_id = ?) AS active_reviews
    FROM scheduled_review_events e
    INNER JOIN learner_case_fsrs s
      ON s.user_id = e.user_id AND s.case_id = e.case_id
    WHERE e.id = ? AND e.user_id = ?
  `).bind(
    fixture.reviewId,
    fixture.reviewId,
    fixture.userId,
    caseId,
    fixture.userId,
    caseId,
    fixture.userId,
    caseId,
    fixture.userId,
    fixture.userId,
    systemId,
    fixture.reviewId,
    fixture.userId,
    fixture.reviewId,
    fixture.userId
  ).first();
}

/** @param {D1Database} binding */
async function completeDueRepeatFixture(binding) {
  const db = createDb(binding);
  const due = await createExistingStateFixture(binding, db, fixtures.due);
  const repeat = await createExistingStateFixture(binding, db, fixtures.repeat);

  const dueResult = await completeScheduledReview({
    db,
    userId: due.userId,
    reviewId: due.reviewId,
    rating: due.completionRating,
    runBoundaryToken: due.runBoundaryToken,
    proofSecret
  });
  const repeatResult = await completeScheduledReview({
    db,
    userId: repeat.userId,
    reviewId: repeat.reviewId,
    rating: repeat.completionRating,
    runBoundaryToken: repeat.runBoundaryToken,
    proofSecret
  });

  return {
    due: {
      result: dueResult,
      priorState: {
        stateRevision: 1,
        state: due.priorCard.state,
        dueAt: due.priorCard.dueAt
      },
      evidence: await completionEvidence(binding, due)
    },
    repeat: {
      result: repeatResult,
      priorState: {
        stateRevision: 1,
        state: repeat.priorCard.state,
        dueAt: repeat.priorCard.dueAt
      },
      evidence: await completionEvidence(binding, repeat)
    }
  };
}

export default {
  /** @param {Request} request @param {{DB:D1Database}} env */
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/complete-due-repeat') return new Response('Not found', { status: 404 });
    try {
      return json(await completeDueRepeatFixture(env.DB));
    } catch (error) {
      return new Response(error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error), {
        status: 500
      });
    }
  }
};
