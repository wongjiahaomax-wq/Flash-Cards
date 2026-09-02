import { createDb } from '../src/lib/server/db/index.js';
import { ensureLearnerFsrsProfile } from '../src/lib/server/db/fsrs-bootstrap.js';
import {
  cleanupExpiredActiveReviews,
  discardActiveReview
} from '../src/lib/server/db/active-reviews.js';
import { completeScheduledReview } from '../src/lib/server/db/scheduled-review-completion.js';
import {
  fingerprintStudyScope,
  issueScheduledRunBoundaryToken,
  verifyScheduledRepeatOriginProof
} from '../src/lib/server/learning/study-run-proof.js';

const proofSecret = 'scheduled-completion-d1-smoke-secret-0123456789abcdefghijklmnopqrstuvwxyz';
const systemId = 'scheduled-completion-d1-smoke-system';
const topicId = 'scheduled-completion-d1-smoke-topic';
const caseId = 'scheduled-completion-d1-smoke-case';

const fixtures = {
  base: {
    userId: 'scheduled-completion-d1-smoke-user',
    reviewId: 'scheduled-completion-d1-smoke-review',
    runId: 'scheduled-completion-d1-smoke-run'
  },
  ratingRace: {
    userId: 'scheduled-completion-d1-smoke-rating-race-user',
    reviewId: 'scheduled-completion-d1-smoke-rating-race-review',
    runId: 'scheduled-completion-d1-smoke-rating-race-run'
  },
  discardRace: {
    userId: 'scheduled-completion-d1-smoke-discard-race-user',
    reviewId: 'scheduled-completion-d1-smoke-discard-race-review',
    runId: 'scheduled-completion-d1-smoke-discard-race-run'
  },
  cleanupRace: {
    userId: 'scheduled-completion-d1-smoke-cleanup-race-user',
    reviewId: 'scheduled-completion-d1-smoke-cleanup-race-review',
    runId: 'scheduled-completion-d1-smoke-cleanup-race-run'
  }
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
  `).bind(
    userId,
    userId,
    `${userId}@example.test`,
    current,
    current
  ).run();
}

/**
 * @param {D1Database} binding
 * @param {import('../src/lib/server/db/index.js').LearningDb} db
 * @param {{userId:string,reviewId:string,runId:string}} fixture
 */
async function createActiveFixture(binding, db, fixture) {
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

  await binding.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      expected_state_revision, expected_due_at, run_started_at,
      case_title_snapshot, snapshot_version, revealed_at
    ) VALUES (?, ?, ?, ?, 'scheduled', 'original', 'new', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 1,
      cast((julianday('now') - 2440587.5) * 86400000 as integer))
  `).bind(
    fixture.reviewId,
    fixture.userId,
    caseId,
    systemId,
    fixture.runId,
    scopeFingerprint,
    JSON.stringify(scope),
    boundary.generation,
    boundary.reviewSequenceEpoch,
    boundary.parameterRevision,
    boundary.schedulerRevision,
    boundary.schedulerLibraryVersion,
    runStartedAt,
    'Scheduled completion D1 smoke Case'
  ).run();

  return {
    ...fixture,
    boundary,
    runBoundaryToken
  };
}

/**
 * @param {D1Database} binding
 * @param {{userId:string,reviewId:string}} fixture
 */
async function completionCounts(binding, fixture) {
  return binding.prepare(`
    SELECT
      (SELECT count(*) FROM scheduled_review_events WHERE id = ?) AS events,
      (SELECT count(*) FROM learner_optimizer_evidence WHERE event_id = ?) AS optimizer_evidence,
      (SELECT count(*) FROM learner_case_fsrs WHERE user_id = ? AND case_id = ?) AS case_states,
      (SELECT count(*) FROM learner_case_encounters WHERE user_id = ? AND case_id = ?) AS encounters,
      coalesce((SELECT scheduled_completed FROM learner_aggregates WHERE user_id = ?), 0) AS learner_scheduled,
      coalesce((SELECT scheduled_completed FROM learner_system_aggregates WHERE user_id = ? AND system_id = ?), 0) AS system_scheduled,
      (SELECT count(*) FROM active_reviews WHERE user_id = ?) AS active_reviews
  `).bind(
    fixture.reviewId,
    fixture.reviewId,
    fixture.userId,
    caseId,
    fixture.userId,
    caseId,
    fixture.userId,
    fixture.userId,
    systemId,
    fixture.userId
  ).first();
}

/** @param {PromiseSettledResult<any>} settled */
function settledSummary(settled) {
  if (settled.status === 'fulfilled') {
    return { status: 'fulfilled', value: settled.value };
  }
  return {
    status: 'rejected',
    error: settled.reason instanceof Error
      ? {
        name: settled.reason.name,
        message: settled.reason.message,
        code: settled.reason.code ?? null
      }
      : { name: 'Error', message: String(settled.reason), code: null }
  };
}

/** @param {D1Database} binding */
async function completeFixture(binding) {
  const db = createDb(binding);
  const base = await createActiveFixture(binding, db, fixtures.base);
  const ratingRace = await createActiveFixture(binding, db, fixtures.ratingRace);
  const discardRace = await createActiveFixture(binding, db, fixtures.discardRace);
  const cleanupRace = await createActiveFixture(binding, db, fixtures.cleanupRace);

  // All four Reviews are frozen while the Case is active. Ordinary Admin
  // deactivation after freeze must not retroactively cancel completion.
  await binding.prepare('UPDATE cases SET is_active = 0 WHERE id = ?').bind(caseId).run();

  const completionInput = {
    db,
    userId: base.userId,
    reviewId: base.reviewId,
    rating: /** @type {const} */ ('again'),
    runBoundaryToken: base.runBoundaryToken,
    proofSecret
  };
  const racingCompletions = await Promise.all([
    completeScheduledReview(completionInput),
    completeScheduledReview(completionInput)
  ]);
  const statuses = racingCompletions.map((result) => result.status).sort();
  if (statuses.length !== 2 || statuses[0] !== 'completed' || statuses[1] !== 'replayed') {
    throw new Error(`Expected one completed and one replayed racing completion; received ${statuses.join(',')}.`);
  }
  const first = racingCompletions.find((result) => result.status === 'completed');
  const raceReplay = racingCompletions.find((result) => result.status === 'replayed');
  if (!first || !raceReplay) {
    throw new Error('Racing completion reconciliation did not expose both committed and replayed outcomes.');
  }

  const sameRatingReplay = await completeScheduledReview(completionInput);
  const differentRatingReplay = await completeScheduledReview({
    ...completionInput,
    rating: 'easy'
  });

  const verifiedRepeat = first.repeatEntry
    ? await verifyScheduledRepeatOriginProof({
      secret: proofSecret,
      userId: base.userId,
      runToken: base.runBoundaryToken,
      repeatToken: first.repeatEntry.workProof,
      caseId
    })
    : null;

  // Competing different ratings must serialize to exactly one transition. The
  // loser reconciles from the durable event and reports payload mismatch.
  const ratingRaceResults = await Promise.all([
    completeScheduledReview({
      db,
      userId: ratingRace.userId,
      reviewId: ratingRace.reviewId,
      rating: 'again',
      runBoundaryToken: ratingRace.runBoundaryToken,
      proofSecret
    }),
    completeScheduledReview({
      db,
      userId: ratingRace.userId,
      reviewId: ratingRace.reviewId,
      rating: 'easy',
      runBoundaryToken: ratingRace.runBoundaryToken,
      proofSecret
    })
  ]);
  const ratingCompleted = ratingRaceResults.filter((result) => result.status === 'completed');
  const ratingReplayed = ratingRaceResults.filter((result) => result.status === 'replayed');
  if (ratingCompleted.length !== 1 || ratingReplayed.length !== 1) {
    throw new Error('Competing ratings did not serialize to one completed and one replayed response.');
  }
  if (ratingRaceResults.filter((result) => result.payloadMismatch).length !== 1) {
    throw new Error('Exactly one competing-rating response must report payload mismatch.');
  }
  if (ratingRaceResults[0].rating !== ratingRaceResults[1].rating) {
    throw new Error('Competing ratings did not reconcile to the same committed rating.');
  }

  // Discard and completion are allowed to race. Exactly one operation may own
  // the active Review: either completion commits atomically, or Discard removes
  // it and completion fails without any durable completion writes.
  const discardRaceSettled = await Promise.allSettled([
    completeScheduledReview({
      db,
      userId: discardRace.userId,
      reviewId: discardRace.reviewId,
      rating: 'again',
      runBoundaryToken: discardRace.runBoundaryToken,
      proofSecret
    }),
    discardActiveReview({
      db,
      userId: discardRace.userId,
      reviewId: discardRace.reviewId
    })
  ]);
  const discardCompletion = discardRaceSettled[0];
  const discardWriter = discardRaceSettled[1];
  if (discardWriter.status !== 'fulfilled') {
    throw new Error('Discard writer unexpectedly rejected during completion race.');
  }
  if (discardCompletion.status === 'fulfilled') {
    if (discardCompletion.value.status !== 'completed' || discardWriter.value !== false) {
      throw new Error('Completion-wins Discard race did not serialize coherently.');
    }
  } else if (discardWriter.value !== true) {
    throw new Error('Discard-wins race must delete the active Review when completion does not commit.');
  }

  // An already-expired Review is raced against explicit DB-time cleanup. The
  // completion side must not commit any event/state/aggregate writes.
  await binding.prepare(`
    UPDATE active_reviews
    SET expires_at = cast((julianday('now') - 2440587.5) * 86400000 as integer) - 1
    WHERE id = ? AND user_id = ?
  `).bind(cleanupRace.reviewId, cleanupRace.userId).run();
  const cleanupRaceSettled = await Promise.allSettled([
    completeScheduledReview({
      db,
      userId: cleanupRace.userId,
      reviewId: cleanupRace.reviewId,
      rating: 'again',
      runBoundaryToken: cleanupRace.runBoundaryToken,
      proofSecret
    }),
    cleanupExpiredActiveReviews(db)
  ]);
  if (cleanupRaceSettled[0].status !== 'rejected') {
    throw new Error('Expired Review completion unexpectedly committed during cleanup race.');
  }
  if (cleanupRaceSettled[1].status !== 'fulfilled') {
    throw new Error('Expired active-Review cleanup unexpectedly rejected.');
  }

  const counts = await completionCounts(binding, base);
  const ratingRaceCounts = await completionCounts(binding, ratingRace);
  const discardRaceCounts = await completionCounts(binding, discardRace);
  const cleanupRaceCounts = await completionCounts(binding, cleanupRace);

  const discardCompletionCommitted = discardCompletion.status === 'fulfilled';
  const expectedDiscardCount = discardCompletionCommitted ? 1 : 0;
  for (const key of ['events', 'optimizer_evidence', 'case_states', 'encounters', 'learner_scheduled', 'system_scheduled']) {
    if (Number(discardRaceCounts?.[key]) !== expectedDiscardCount) {
      throw new Error(`Discard race left incoherent ${key} count ${discardRaceCounts?.[key]}.`);
    }
  }
  if (Number(discardRaceCounts?.active_reviews) !== 0) {
    throw new Error('Discard race left an active Review behind.');
  }
  for (const key of ['events', 'optimizer_evidence', 'case_states', 'encounters', 'learner_scheduled', 'system_scheduled', 'active_reviews']) {
    if (Number(cleanupRaceCounts?.[key]) !== 0) {
      throw new Error(`Cleanup race left partial ${key} state ${cleanupRaceCounts?.[key]}.`);
    }
  }

  return {
    racingCompletions,
    first,
    raceReplay,
    sameRatingReplay,
    differentRatingReplay,
    verifiedRepeat,
    ratingRaceResults,
    discardRace: {
      completion: settledSummary(discardCompletion),
      discard: settledSummary(discardWriter),
      counts: discardRaceCounts
    },
    cleanupRace: {
      completion: settledSummary(cleanupRaceSettled[0]),
      cleanup: settledSummary(cleanupRaceSettled[1]),
      counts: cleanupRaceCounts
    },
    counts,
    ratingRaceCounts
  };
}

export default {
  /** @param {Request} request @param {{DB:D1Database}} env */
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/complete-new') return new Response('Not found', { status: 404 });
    try {
      return json(await completeFixture(env.DB));
    } catch (error) {
      return new Response(error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error), {
        status: 500
      });
    }
  }
};
