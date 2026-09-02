import { createDb } from '../src/lib/server/db/index.js';
import { ensureLearnerFsrsProfile } from '../src/lib/server/db/fsrs-bootstrap.js';
import { completeScheduledReview } from '../src/lib/server/db/scheduled-review-completion.js';
import {
  fingerprintStudyScope,
  issueScheduledRunBoundaryToken,
  verifyScheduledRepeatOriginProof
} from '../src/lib/server/learning/study-run-proof.js';

const proofSecret = 'scheduled-completion-d1-smoke-secret-0123456789abcdefghijklmnopqrstuvwxyz';
const userId = 'scheduled-completion-d1-smoke-user';
const systemId = 'scheduled-completion-d1-smoke-system';
const topicId = 'scheduled-completion-d1-smoke-topic';
const caseId = 'scheduled-completion-d1-smoke-case';
const reviewId = 'scheduled-completion-d1-smoke-review';
const runId = 'scheduled-completion-d1-smoke-run';

/** @param {unknown} value */
function json(value) {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' }
  });
}

/** @param {D1Database} binding */
async function completeFixture(binding) {
  const db = createDb(binding);
  const profile = await ensureLearnerFsrsProfile(db, userId);
  const scope = {
    systemId,
    routes: [{ routeType: 'topic', routeId: topicId }]
  };
  const scopeFingerprint = await fingerprintStudyScope(scope);
  const runStartedAt = Date.now() - 1_000;
  const boundary = {
    userId,
    runId,
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
    reviewId,
    userId,
    caseId,
    systemId,
    runId,
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

  // Frozen Reviews remain completable after ordinary Admin content deactivation.
  await binding.prepare('UPDATE cases SET is_active = 0 WHERE id = ?').bind(caseId).run();

  const completionInput = {
    db,
    userId,
    reviewId,
    rating: /** @type {const} */ ('again'),
    runBoundaryToken,
    proofSecret
  };
  // Exercise the actual uniqueness race. Both requests begin against the same
  // active Review; one batch commits and the loser must reconcile from the
  // durable Scheduled event rather than applying a second FSRS transition.
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
      userId,
      runToken: runBoundaryToken,
      repeatToken: first.repeatEntry.workProof,
      caseId
    })
    : null;

  const counts = await binding.prepare(`
    SELECT
      (SELECT count(*) FROM scheduled_review_events WHERE id = ?) AS events,
      (SELECT count(*) FROM learner_optimizer_evidence WHERE event_id = ?) AS optimizer_evidence,
      (SELECT count(*) FROM learner_case_fsrs WHERE user_id = ? AND case_id = ?) AS case_states,
      (SELECT count(*) FROM learner_case_encounters WHERE user_id = ? AND case_id = ?) AS encounters,
      (SELECT scheduled_completed FROM learner_aggregates WHERE user_id = ?) AS learner_scheduled,
      (SELECT scheduled_completed FROM learner_system_aggregates WHERE user_id = ? AND system_id = ?) AS system_scheduled,
      (SELECT count(*) FROM active_reviews WHERE user_id = ?) AS active_reviews
  `).bind(
    reviewId,
    reviewId,
    userId,
    caseId,
    userId,
    caseId,
    userId,
    userId,
    systemId,
    userId
  ).first();

  return {
    racingCompletions,
    first,
    raceReplay,
    sameRatingReplay,
    differentRatingReplay,
    verifiedRepeat,
    counts
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
