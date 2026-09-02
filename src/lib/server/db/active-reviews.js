import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import {
  activeReviewAssets,
  activeReviewQuestions,
  activeReviews
} from './active-review-schema.js';
import { ensureLearnerPreferences } from './fsrs-bootstrap.js';
import { learnerCaseFsrs, learnerFsrsProfiles } from './fsrs-schema.js';
import { resolveSystemStudySelection } from './study-navigation.ts';
import {
  ACTIVE_REVIEW_SNAPSHOT_VERSION,
  ActiveReviewContentError,
  buildActiveReviewSnapshot
} from './active-review-content.js';
import {
  fingerprintStudyScope,
  verifyCapturedMembership,
  verifyScheduledRepeatOriginProof
} from '../learning/study-run-proof.js';

/** @typedef {typeof activeReviews.$inferInsert} ActiveReviewInsert */
/** @typedef {Awaited<ReturnType<typeof resolveSystemStudySelection>>} StudySelection */

const DATABASE_NOW_MS = sql`cast((julianday('now') - 2440587.5) * 86400000 as integer)`;

const INSERT_ACTIVE_REVIEW_SQL = `
  INSERT INTO active_reviews (
    id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
    run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
    parameter_revision, scheduler_revision, scheduler_library_version,
    expected_state_revision, expected_due_at, run_started_at,
    case_title_snapshot, vignette_snapshot_md, snapshot_version
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?
  )
`;

const INSERT_ACTIVE_REVIEW_QUESTIONS_JSON_SQL = `
  INSERT INTO active_review_questions (
    id, active_review_id, question_prompt_id, source_type, source_concept_id,
    source_stimulus_group_id, source_stimulus_option_id, source_asset_question_id,
    source_shared_question_id, display_order, prompt_snapshot_md, answer_snapshot_md
  )
  SELECT
    json_extract(value, '$.id'),
    json_extract(value, '$.activeReviewId'),
    json_extract(value, '$.questionPromptId'),
    json_extract(value, '$.sourceType'),
    json_extract(value, '$.sourceConceptId'),
    json_extract(value, '$.sourceStimulusGroupId'),
    json_extract(value, '$.sourceStimulusOptionId'),
    json_extract(value, '$.sourceAssetQuestionId'),
    json_extract(value, '$.sourceSharedQuestionId'),
    json_extract(value, '$.displayOrder'),
    json_extract(value, '$.promptSnapshotMd'),
    json_extract(value, '$.answerSnapshotMd')
  FROM json_each(?)
`;

const INSERT_ACTIVE_REVIEW_ASSETS_JSON_SQL = `
  INSERT INTO active_review_assets (
    id, active_review_id, asset_id, display_order, storage_key_snapshot,
    caption_snapshot_md, alt_text_snapshot, source_stimulus_group_id,
    source_stimulus_option_id
  )
  SELECT
    json_extract(value, '$.id'),
    json_extract(value, '$.activeReviewId'),
    json_extract(value, '$.assetId'),
    json_extract(value, '$.displayOrder'),
    json_extract(value, '$.storageKeySnapshot'),
    json_extract(value, '$.captionSnapshotMd'),
    json_extract(value, '$.altTextSnapshot'),
    json_extract(value, '$.sourceStimulusGroupId'),
    json_extract(value, '$.sourceStimulusOptionId')
  FROM json_each(?)
`;

export class ActiveReviewError extends Error {
  /**
   * @param {'invalid-input'|'stale-run'|'stale-case-state'|'ineligible-scope'|'content-unavailable'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'ActiveReviewError';
    this.code = code;
  }
}

/** @param {unknown} value @param {string} label */
function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new ActiveReviewError('invalid-input', `${label} is required.`);
  return normalized;
}

/** @param {Date|number|string|null|undefined} value */
function timestampMs(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/** @param {unknown} value */
function databaseErrorMessage(value) {
  if (value instanceof Error) return value.message;
  return String(value ?? '');
}

/** @param {any} profile @param {any} boundary */
function profileMatchesBoundary(profile, boundary) {
  return Boolean(profile)
    && Number(profile.generation) === boundary.generation
    && Number(profile.reviewSequenceEpoch) === boundary.reviewSequenceEpoch
    && Number(profile.parameterRevision) === boundary.parameterRevision
    && Number(profile.schedulerRevision) === boundary.schedulerRevision
    && String(profile.schedulerLibraryVersion) === boundary.schedulerLibraryVersion;
}

/** @param {any} state @param {any} boundary */
function stateMatchesBoundary(state, boundary) {
  return Boolean(state)
    && Number(state.generation) === boundary.generation
    && Number(state.reviewSequenceEpoch) === boundary.reviewSequenceEpoch
    && Number(state.parameterRevision) === boundary.parameterRevision
    && Number(state.schedulerRevision) === boundary.schedulerRevision
    && String(state.schedulerLibraryVersion) === boundary.schedulerLibraryVersion;
}

/** @param {import('./index.js').LearningDb} db @param {typeof activeReviews.$inferSelect} review */
async function hydrateActiveReview(db, review) {
  const [questions, assets] = await Promise.all([
    db
      .select()
      .from(activeReviewQuestions)
      .where(eq(activeReviewQuestions.activeReviewId, review.id))
      .orderBy(asc(activeReviewQuestions.displayOrder)),
    db
      .select()
      .from(activeReviewAssets)
      .where(eq(activeReviewAssets.activeReviewId, review.id))
      .orderBy(asc(activeReviewAssets.displayOrder))
  ]);
  let selectedScope = null;
  try {
    selectedScope = JSON.parse(review.scopeJson);
  } catch {
    throw new Error(`Active Review ${review.id} contains invalid persisted scope JSON.`);
  }
  return { ...review, selectedScope, questions, assets };
}

/**
 * Discover the one server-backed active Review even when browser localStorage is
 * missing. Expired rows are invisible to Resume but remain physically owned
 * until replacement or explicit cleanup consumes them using database time.
 * @param {import('./index.js').LearningDb} db
 * @param {string} userId
 */
export async function getActiveReview(db, userId) {
  requiredString(userId, 'Learner');
  const rows = await db
    .select()
    .from(activeReviews)
    .where(and(
      eq(activeReviews.userId, userId),
      sql`${activeReviews.expiresAt} > ${DATABASE_NOW_MS}`
    ))
    .limit(1);
  return rows[0] ? hydrateActiveReview(db, rows[0]) : null;
}

/** @param {import('./index.js').LearningDb} db @param {string} userId @param {string} reviewId */
export async function getActiveReviewById(db, userId, reviewId) {
  requiredString(userId, 'Learner');
  requiredString(reviewId, 'Active Review');
  const rows = await db
    .select()
    .from(activeReviews)
    .where(and(
      eq(activeReviews.userId, userId),
      eq(activeReviews.id, reviewId),
      sql`${activeReviews.expiresAt} > ${DATABASE_NOW_MS}`
    ))
    .limit(1);
  return rows[0] ? hydrateActiveReview(db, rows[0]) : null;
}

/** @param {unknown} cause */
function mappedCreateError(cause) {
  if (cause instanceof ActiveReviewError || cause instanceof ActiveReviewContentError) return cause;
  const message = databaseErrorMessage(cause);
  if (message.includes('active_review_stale_boundary')) {
    return new ActiveReviewError('stale-run', 'This Scheduled run is stale. Start a fresh run.');
  }
  if (message.includes('active_review_stale_case_state')) {
    return new ActiveReviewError(
      'stale-case-state',
      'This Case changed scheduling state before the Review could open.'
    );
  }
  if (message.includes('active_review_ineligible_scope')) {
    return new ActiveReviewError(
      'ineligible-scope',
      'This Case is no longer active learner content in the selected study scope.'
    );
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return new ActiveReviewError(
      'content-unavailable',
      'The Case or learner asset changed before the Review could be frozen.'
    );
  }
  return cause;
}

/** @param {ActiveReviewInsert} parent @param {D1Database} client */
function dbInsertActiveReview(parent, client) {
  return client.prepare(INSERT_ACTIVE_REVIEW_SQL).bind(
    parent.id,
    parent.userId,
    parent.caseId,
    parent.systemId,
    parent.studyMode,
    parent.contentMode,
    parent.queueClass ?? null,
    parent.runId,
    parent.scopeFingerprint,
    parent.scopeJson,
    parent.generation ?? null,
    parent.reviewSequenceEpoch ?? null,
    parent.parameterRevision ?? null,
    parent.schedulerRevision ?? null,
    parent.schedulerLibraryVersion ?? null,
    parent.expectedStateRevision ?? null,
    timestampMs(parent.expectedDueAt),
    timestampMs(parent.runStartedAt),
    parent.caseTitleSnapshot,
    parent.vignetteSnapshotMd ?? null,
    parent.snapshotVersion ?? ACTIVE_REVIEW_SNAPSHOT_VERSION
  );
}

/** @param {D1Database} client @param {string} userId */
function dbDeleteExpired(client, userId) {
  return client
    .prepare(`
      DELETE FROM active_reviews
      WHERE user_id = ?
        AND expires_at <= cast((julianday('now') - 2440587.5) * 86400000 as integer)
    `)
    .bind(userId);
}

/**
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   parent:ActiveReviewInsert,
 *   snapshot:Awaited<ReturnType<typeof buildActiveReviewSnapshot>>
 * }} input
 */
async function persistActiveReview(input) {
  const activeReviewId = input.parent.id;
  const questionRows = input.snapshot.questions.map((question) => ({
    id: globalThis.crypto.randomUUID(),
    activeReviewId,
    ...question
  }));
  const assetRows = input.snapshot.assets.map((asset) => ({
    id: globalThis.crypto.randomUUID(),
    activeReviewId,
    ...asset
  }));
  const client = input.db.$client;
  if (!client || typeof client.prepare !== 'function' || typeof client.batch !== 'function') {
    throw new Error('Active Review creation requires a Cloudflare D1 client with atomic batch support.');
  }

  /** @type {D1PreparedStatement[]} */
  const writes = [
    dbDeleteExpired(client, input.userId),
    dbInsertActiveReview(input.parent, client)
  ];
  if (questionRows.length > 0) {
    writes.push(
      client
        .prepare(INSERT_ACTIVE_REVIEW_QUESTIONS_JSON_SQL)
        .bind(JSON.stringify(questionRows))
    );
  }
  if (assetRows.length > 0) {
    writes.push(
      client
        .prepare(INSERT_ACTIVE_REVIEW_ASSETS_JSON_SQL)
        .bind(JSON.stringify(assetRows))
    );
  }

  try {
    await client.batch(writes);
  } catch (cause) {
    const existing = await getActiveReview(input.db, input.userId);
    if (existing) return { status: 'resume', review: existing };
    throw mappedCreateError(cause);
  }

  const created = await getActiveReviewById(input.db, input.userId, activeReviewId);
  if (!created) throw new Error('Active Review creation committed without a readable Review.');
  return { status: 'created', review: created };
}

/** @param {{expandedLearning:boolean}} preferences */
function contentModeForPreferences(preferences) {
  return preferences.expandedLearning ? 'expanded' : 'original';
}

/** @param {StudySelection} selection @param {string} caseId */
function selectedCandidate(selection, caseId) {
  const candidate = selection.candidates.find((item) => item.id === caseId);
  if (!candidate) {
    throw new ActiveReviewError(
      'ineligible-scope',
      'This Case is no longer active learner content in the selected study scope.'
    );
  }
  return candidate;
}

/**
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   systemId:string,
 *   routes:readonly {routeType:'topic'|'tag',routeId:string}[],
 *   caseId:string,
 *   queueClass:'due'|'new'|'repeat',
 *   runBoundaryToken:string,
 *   workProof:string,
 *   proofSecret:string,
 *   now?:Date|number|string,
 *   rng?:()=>number
 * }} input
 */
export async function createScheduledActiveReview(input) {
  const userId = requiredString(input.userId, 'Learner');
  const caseId = requiredString(input.caseId, 'Case');
  if (!['due', 'new', 'repeat'].includes(input.queueClass)) {
    throw new ActiveReviewError('invalid-input', 'Scheduled active Review queue class is invalid.');
  }

  const existing = await getActiveReview(input.db, userId);
  if (existing) return { status: 'resume', review: existing };

  const selection = await resolveSystemStudySelection(input.db, {
    systemId: input.systemId,
    routes: input.routes
  });
  const candidate = selectedCandidate(selection, caseId);
  const scope = { systemId: selection.systemId, routes: selection.routes };
  const scopeFingerprint = await fingerprintStudyScope(scope);

  const membership = input.queueClass === 'repeat'
    ? await verifyScheduledRepeatOriginProof({
      secret: input.proofSecret,
      userId,
      runToken: input.runBoundaryToken,
      repeatToken: input.workProof,
      caseId
    })
    : await verifyCapturedMembership({
      secret: input.proofSecret,
      userId,
      runToken: input.runBoundaryToken,
      membershipToken: input.workProof,
      queueClass: input.queueClass,
      caseId
    });
  const boundary = membership.boundary;
  if (boundary.scopeFingerprint !== scopeFingerprint) {
    throw new ActiveReviewError('stale-run', 'The selected study scope no longer matches this Scheduled run.');
  }

  const profileRows = await input.db
    .select()
    .from(learnerFsrsProfiles)
    .where(eq(learnerFsrsProfiles.userId, userId))
    .limit(1);
  const profile = profileRows[0];
  if (!profileMatchesBoundary(profile, boundary)) {
    throw new ActiveReviewError('stale-run', 'This Scheduled run is stale. Start a fresh run.');
  }

  const stateRows = await input.db
    .select()
    .from(learnerCaseFsrs)
    .where(and(eq(learnerCaseFsrs.userId, userId), eq(learnerCaseFsrs.caseId, caseId)))
    .limit(1);
  const state = stateRows[0] ?? null;
  const requestNow = timestampMs(input.now ?? new Date());
  if (requestNow == null) throw new ActiveReviewError('invalid-input', 'Scheduled Review time is invalid.');

  let expectedStateRevision = null;
  let expectedDueAt = null;
  if (input.queueClass === 'new') {
    if (state) {
      throw new ActiveReviewError('stale-case-state', 'This Case is no longer New in the current learner state.');
    }
  } else {
    if (!('stateRevision' in membership) || !('dueAt' in membership)) {
      throw new ActiveReviewError('stale-case-state', 'Scheduled work proof is missing Case state metadata.');
    }
    const proofStateRevision = Number(membership.stateRevision);
    const proofDueAt = Number(membership.dueAt);
    if (
      !stateMatchesBoundary(state, boundary)
      || Number(state?.stateRevision) !== proofStateRevision
      || timestampMs(state?.dueAt) !== proofDueAt
      || proofDueAt > requestNow
      || (input.queueClass === 'due' && proofDueAt > boundary.runStartedAt)
    ) {
      throw new ActiveReviewError(
        'stale-case-state',
        'This Case changed scheduling state before the Review could open.'
      );
    }
    expectedStateRevision = proofStateRevision;
    expectedDueAt = proofDueAt;
  }

  const preferences = await ensureLearnerPreferences(input.db, userId);
  const contentMode = contentModeForPreferences(preferences);
  const snapshot = await buildActiveReviewSnapshot({
    db: input.db,
    caseId,
    studyConceptId: candidate.studyConceptId,
    contentMode,
    rng: input.rng
  });
  const reviewId = globalThis.crypto.randomUUID();

  return persistActiveReview({
    db: input.db,
    userId,
    parent: {
      id: reviewId,
      userId,
      caseId,
      systemId: selection.systemId,
      studyMode: 'scheduled',
      contentMode,
      queueClass: input.queueClass,
      runId: boundary.runId,
      scopeFingerprint,
      scopeJson: JSON.stringify(scope),
      generation: boundary.generation,
      reviewSequenceEpoch: boundary.reviewSequenceEpoch,
      parameterRevision: boundary.parameterRevision,
      schedulerRevision: boundary.schedulerRevision,
      schedulerLibraryVersion: boundary.schedulerLibraryVersion,
      expectedStateRevision,
      expectedDueAt: expectedDueAt == null ? null : new Date(expectedDueAt),
      runStartedAt: new Date(boundary.runStartedAt),
      caseTitleSnapshot: snapshot.case.title,
      vignetteSnapshotMd: snapshot.case.vignetteMd,
      snapshotVersion: ACTIVE_REVIEW_SNAPSHOT_VERSION
    },
    snapshot
  });
}

/**
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   systemId:string,
 *   routes:readonly {routeType:'topic'|'tag',routeId:string}[],
 *   caseId:string,
 *   runId?:string,
 *   rng?:()=>number
 * }} input
 */
export async function createFreeActiveReview(input) {
  const userId = requiredString(input.userId, 'Learner');
  const caseId = requiredString(input.caseId, 'Case');
  const existing = await getActiveReview(input.db, userId);
  if (existing) return { status: 'resume', review: existing };

  const selection = await resolveSystemStudySelection(input.db, {
    systemId: input.systemId,
    routes: input.routes
  });
  const candidate = selectedCandidate(selection, caseId);
  const scope = { systemId: selection.systemId, routes: selection.routes };
  const [scopeFingerprint, preferences] = await Promise.all([
    fingerprintStudyScope(scope),
    ensureLearnerPreferences(input.db, userId)
  ]);
  const contentMode = contentModeForPreferences(preferences);
  const snapshot = await buildActiveReviewSnapshot({
    db: input.db,
    caseId,
    studyConceptId: candidate.studyConceptId,
    contentMode,
    rng: input.rng
  });
  const reviewId = globalThis.crypto.randomUUID();

  return persistActiveReview({
    db: input.db,
    userId,
    parent: {
      id: reviewId,
      userId,
      caseId,
      systemId: selection.systemId,
      studyMode: 'free',
      contentMode,
      queueClass: null,
      runId: input.runId ?? globalThis.crypto.randomUUID(),
      scopeFingerprint,
      scopeJson: JSON.stringify(scope),
      generation: null,
      reviewSequenceEpoch: null,
      parameterRevision: null,
      schedulerRevision: null,
      schedulerLibraryVersion: null,
      expectedStateRevision: null,
      expectedDueAt: null,
      runStartedAt: null,
      caseTitleSnapshot: snapshot.case.title,
      vignetteSnapshotMd: snapshot.case.vignetteMd,
      snapshotVersion: ACTIVE_REVIEW_SNAPSHOT_VERSION
    },
    snapshot
  });
}

/** @param {{db:import('./index.js').LearningDb,userId:string,reviewId:string}} input */
export async function revealActiveReview(input) {
  const userId = requiredString(input.userId, 'Learner');
  const reviewId = requiredString(input.reviewId, 'Active Review');
  await input.db
    .update(activeReviews)
    .set({ revealedAt: DATABASE_NOW_MS })
    .where(and(
      eq(activeReviews.userId, userId),
      eq(activeReviews.id, reviewId),
      isNull(activeReviews.revealedAt),
      sql`${activeReviews.expiresAt} > ${DATABASE_NOW_MS}`
    ));
  return getActiveReviewById(input.db, userId, reviewId);
}

/** @param {{db:import('./index.js').LearningDb,userId:string,reviewId:string}} input */
export async function discardActiveReview(input) {
  const userId = requiredString(input.userId, 'Learner');
  const reviewId = requiredString(input.reviewId, 'Active Review');
  const deleted = await input.db
    .delete(activeReviews)
    .where(and(eq(activeReviews.userId, userId), eq(activeReviews.id, reviewId)))
    .returning({ id: activeReviews.id });
  return deleted.length > 0;
}

/**
 * Explicit cleanup primitive for maintenance/tests. Replacement, discovery and
 * cleanup all evaluate expiry from database time, so application clock skew
 * cannot make an unexpired Review disappear.
 * @param {import('./index.js').LearningDb} db
 */
export async function cleanupExpiredActiveReviews(db) {
  return db
    .delete(activeReviews)
    .where(sql`${activeReviews.expiresAt} <= ${DATABASE_NOW_MS}`)
    .returning({ id: activeReviews.id, userId: activeReviews.userId });
}
