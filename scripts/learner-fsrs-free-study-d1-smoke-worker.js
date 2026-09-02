import { createDb } from '../src/lib/server/db/index.js';
import {
  cleanupExpiredActiveReviews,
  discardActiveReview
} from '../src/lib/server/db/active-reviews.js';
import {
  cleanupExpiredFreeCompletionReceipts,
  completeFreeReview
} from '../src/lib/server/db/free-review-completion.js';
import { setExpandedLearningPreference } from '../src/lib/server/db/learner-preferences.js';

const systemId = 'free-study-d1-smoke-system';
const topicId = 'free-study-d1-smoke-topic';
const caseId = 'free-study-d1-smoke-case';

const fixtures = {
  base: { userId: 'free-study-d1-smoke-user', reviewId: 'free-study-d1-smoke-review' },
  discardRace: { userId: 'free-study-d1-smoke-discard-user', reviewId: 'free-study-d1-smoke-discard-review' },
  cleanupRace: { userId: 'free-study-d1-smoke-cleanup-user', reviewId: 'free-study-d1-smoke-cleanup-review' }
};

/** @param {unknown} value */
function json(value) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' }
  });
}

/** @param {D1Database} binding @param {string} userId */
async function ensureSmokeUser(binding, userId) {
  const current = Date.now();
  await binding.prepare(`
    INSERT OR IGNORE INTO \`user\` (
      \`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`
    ) VALUES (?, ?, ?, 1, ?, ?)
  `).bind(userId, userId, `${userId}@example.test`, current, current).run();
}

/** @param {D1Database} binding @param {{userId:string,reviewId:string}} fixture */
async function createFreeActiveFixture(binding, fixture) {
  await ensureSmokeUser(binding, fixture.userId);
  const scope = {
    systemId,
    routes: [{ routeType: 'topic', routeId: topicId }]
  };
  await binding.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      expected_state_revision, expected_due_at, run_started_at,
      case_title_snapshot, snapshot_version, revealed_at
    ) VALUES (
      ?, ?, ?, ?, 'free', 'expanded', NULL,
      ?, ?, ?, NULL, NULL,
      NULL, NULL, NULL,
      NULL, NULL, NULL,
      'Free Study D1 smoke Case', 1,
      cast((julianday('now') - 2440587.5) * 86400000 as integer)
    )
  `).bind(
    fixture.reviewId,
    fixture.userId,
    caseId,
    systemId,
    `${fixture.reviewId}-run`,
    `${fixture.reviewId}-scope`,
    JSON.stringify(scope)
  ).run();
}

/** @param {D1Database} binding @param {{userId:string,reviewId:string}} fixture */
async function completionCounts(binding, fixture) {
  return binding.prepare(`
    SELECT
      (SELECT count(*) FROM free_review_completion_receipts WHERE id = ?) AS receipts,
      (SELECT count(*) FROM learner_case_encounters WHERE user_id = ? AND case_id = ?) AS encounters,
      coalesce((SELECT free_times_studied FROM learner_case_encounters WHERE user_id = ? AND case_id = ?), 0) AS free_times_studied,
      coalesce((SELECT free_completed FROM learner_aggregates WHERE user_id = ?), 0) AS learner_free,
      coalesce((SELECT scheduled_completed FROM learner_aggregates WHERE user_id = ?), 0) AS learner_scheduled,
      (SELECT count(*) FROM scheduled_review_events WHERE user_id = ?) AS scheduled_events,
      (SELECT count(*) FROM learner_optimizer_evidence WHERE user_id = ?) AS optimizer_evidence,
      (SELECT count(*) FROM learner_case_fsrs WHERE user_id = ?) AS case_states,
      (SELECT count(*) FROM learner_system_aggregates WHERE user_id = ?) AS system_aggregates,
      (SELECT count(*) FROM learner_fsrs_profiles WHERE user_id = ?) AS fsrs_profiles,
      (SELECT count(*) FROM active_reviews WHERE user_id = ?) AS active_reviews
  `).bind(
    fixture.reviewId,
    fixture.userId,
    caseId,
    fixture.userId,
    caseId,
    fixture.userId,
    fixture.userId,
    fixture.userId,
    fixture.userId,
    fixture.userId,
    fixture.userId,
    fixture.userId,
    fixture.userId
  ).first();
}

/** @param {PromiseSettledResult<any>} settled */
function settledSummary(settled) {
  if (settled.status === 'fulfilled') return { status: 'fulfilled', value: settled.value };
  return {
    status: 'rejected',
    error: settled.reason instanceof Error
      ? { name: settled.reason.name, message: settled.reason.message, code: settled.reason.code ?? null }
      : { name: 'Error', message: String(settled.reason), code: null }
  };
}

/** @param {D1Database} binding */
async function runSmoke(binding) {
  const db = createDb(binding);
  await createFreeActiveFixture(binding, fixtures.base);
  await createFreeActiveFixture(binding, fixtures.discardRace);
  await createFreeActiveFixture(binding, fixtures.cleanupRace);

  const defaultPreferenceRows = await binding.prepare(`
    SELECT count(*) AS n FROM learner_preferences WHERE user_id = ?
  `).bind(fixtures.base.userId).first();
  if (Number(defaultPreferenceRows?.n) !== 0) {
    throw new Error('Free fixture unexpectedly bootstrapped learner preferences before a preference operation.');
  }
  const preference = await setExpandedLearningPreference({
    db,
    userId: fixtures.base.userId,
    expandedLearning: true
  });
  if (!preference.expandedLearning) {
    throw new Error('Expanded Learning preference did not persist as enabled.');
  }
  const profileBeforeCompletion = await binding.prepare(`
    SELECT count(*) AS n FROM learner_fsrs_profiles WHERE user_id = ?
  `).bind(fixtures.base.userId).first();
  if (Number(profileBeforeCompletion?.n) !== 0) {
    throw new Error('Expanded preference write unexpectedly initialized an FSRS profile.');
  }

  // All Reviews were frozen while the authored Case was active. Ordinary Admin
  // deactivation after freeze must not retroactively cancel Free completion.
  await binding.prepare('UPDATE cases SET is_active = 0 WHERE id = ?').bind(caseId).run();

  const completionInput = {
    db,
    userId: fixtures.base.userId,
    reviewId: fixtures.base.reviewId
  };
  const racingCompletions = await Promise.all([
    completeFreeReview(completionInput),
    completeFreeReview(completionInput)
  ]);
  const statuses = racingCompletions.map((result) => result.status).sort();
  if (statuses.length !== 2 || statuses[0] !== 'completed' || statuses[1] !== 'replayed') {
    throw new Error(`Expected one completed and one replayed Free completion; got ${statuses.join(',')}.`);
  }
  const completed = racingCompletions.find((result) => result.status === 'completed');
  if (!completed) throw new Error('Free completion race did not expose the committed result.');
  const retry = await completeFreeReview(completionInput);
  if (
    retry.status !== 'replayed'
    || retry.receiptId !== completed.receiptId
    || retry.completedAt !== completed.completedAt
    || retry.freeTimesStudied !== completed.freeTimesStudied
  ) {
    throw new Error('Lost-response Free retry did not replay the committed receipt exactly.');
  }

  // Completion and Discard may race; whichever owns the active Review must leave
  // a coherent all-or-nothing result.
  const discardSettled = await Promise.allSettled([
    completeFreeReview({
      db,
      userId: fixtures.discardRace.userId,
      reviewId: fixtures.discardRace.reviewId
    }),
    discardActiveReview({
      db,
      userId: fixtures.discardRace.userId,
      reviewId: fixtures.discardRace.reviewId
    })
  ]);
  if (discardSettled[1].status !== 'fulfilled') {
    throw new Error('Discard unexpectedly rejected during Free completion race.');
  }
  if (discardSettled[0].status === 'fulfilled') {
    if (discardSettled[0].value.status !== 'completed' || discardSettled[1].value !== false) {
      throw new Error('Completion-wins Free Discard race was not coherent.');
    }
  } else if (discardSettled[1].value !== true) {
    throw new Error('Discard-wins Free race did not consume the active Review.');
  }

  // An already-expired active Review cannot write anything while explicit
  // cleanup races it.
  await binding.prepare(`
    UPDATE active_reviews
    SET started_at = cast((julianday('now') - 2440587.5) * 86400000 as integer) - 10000,
        expires_at = cast((julianday('now') - 2440587.5) * 86400000 as integer) - 1
    WHERE id = ? AND user_id = ?
  `).bind(fixtures.cleanupRace.reviewId, fixtures.cleanupRace.userId).run();
  const cleanupSettled = await Promise.allSettled([
    completeFreeReview({
      db,
      userId: fixtures.cleanupRace.userId,
      reviewId: fixtures.cleanupRace.reviewId
    }),
    cleanupExpiredActiveReviews(db)
  ]);
  if (cleanupSettled[0].status !== 'rejected' || cleanupSettled[1].status !== 'fulfilled') {
    throw new Error('Expired Free completion and cleanup did not serialize as expected.');
  }

  const baseCounts = await completionCounts(binding, fixtures.base);
  const discardCounts = await completionCounts(binding, fixtures.discardRace);
  const cleanupCounts = await completionCounts(binding, fixtures.cleanupRace);

  const expectedBase = {
    receipts: 1,
    encounters: 1,
    free_times_studied: 1,
    learner_free: 1,
    learner_scheduled: 0,
    scheduled_events: 0,
    optimizer_evidence: 0,
    case_states: 0,
    system_aggregates: 0,
    fsrs_profiles: 0,
    active_reviews: 0
  };
  for (const [key, expected] of Object.entries(expectedBase)) {
    if (Number(baseCounts?.[key]) !== expected) {
      throw new Error(`Base Free completion ${key} expected ${expected}, got ${baseCounts?.[key]}.`);
    }
  }

  const discardCommitted = discardSettled[0].status === 'fulfilled';
  const expectedDiscard = discardCommitted ? 1 : 0;
  for (const key of ['receipts', 'encounters', 'free_times_studied', 'learner_free']) {
    if (Number(discardCounts?.[key]) !== expectedDiscard) {
      throw new Error(`Discard race left incoherent ${key} count ${discardCounts?.[key]}.`);
    }
  }
  for (const key of ['learner_scheduled', 'scheduled_events', 'optimizer_evidence', 'case_states', 'system_aggregates', 'fsrs_profiles', 'active_reviews']) {
    if (Number(discardCounts?.[key]) !== 0) {
      throw new Error(`Discard race contaminated ${key} with ${discardCounts?.[key]}.`);
    }
  }
  for (const key of ['receipts', 'encounters', 'free_times_studied', 'learner_free', 'learner_scheduled', 'scheduled_events', 'optimizer_evidence', 'case_states', 'system_aggregates', 'fsrs_profiles', 'active_reviews']) {
    if (Number(cleanupCounts?.[key]) !== 0) {
      throw new Error(`Expired cleanup race left partial ${key} state ${cleanupCounts?.[key]}.`);
    }
  }

  // Receipt retention bounds retry authority as well as storage. Once the
  // receipt has expired, a retry must not return stale success merely because
  // maintenance has not deleted the row yet.
  await binding.prepare(`
    UPDATE free_review_completion_receipts
    SET completed_at = completed_at - 604800001,
        expires_at = cast((julianday('now') - 2440587.5) * 86400000 as integer) - 1
    WHERE id = ?
  `).bind(fixtures.base.reviewId).run();
  const expiredReceiptReplay = (await Promise.allSettled([
    completeFreeReview(completionInput)
  ]))[0];
  if (
    expiredReceiptReplay.status !== 'rejected'
    || expiredReceiptReplay.reason?.code !== 'unavailable'
  ) {
    throw new Error('Expired Free completion receipt remained authoritative before cleanup.');
  }

  const cleanedReceipts = await cleanupExpiredFreeCompletionReceipts(db, { limit: 10 });
  if (cleanedReceipts.length !== 1 || cleanedReceipts[0].id !== fixtures.base.reviewId) {
    throw new Error('Bounded Free receipt cleanup did not remove the expired receipt.');
  }

  return {
    preference: {
      expandedLearning: Boolean(preference.expandedLearning),
      fsrsProfileRowsAfterPreferenceWrite: Number(profileBeforeCompletion?.n)
    },
    racingCompletions,
    retry,
    baseCounts,
    discardRace: {
      completion: settledSummary(discardSettled[0]),
      discard: settledSummary(discardSettled[1]),
      counts: discardCounts
    },
    cleanupRace: {
      completion: settledSummary(cleanupSettled[0]),
      cleanup: settledSummary(cleanupSettled[1]),
      counts: cleanupCounts
    },
    expiredReceiptReplay: settledSummary(expiredReceiptReplay),
    expiredReceiptsCleaned: cleanedReceipts.length
  };
}

export default {
  /** @param {Request} request @param {{DB:D1Database}} env */
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/run') return new Response('Not found', { status: 404 });
    try {
      return json(await runSmoke(env.DB));
    } catch (error) {
      return new Response(
        error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error),
        { status: 500 }
      );
    }
  }
};
