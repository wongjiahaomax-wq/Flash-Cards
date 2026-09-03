import {
  MAX_ACTIVE_REVIEW_ASSETS,
  MAX_ACTIVE_REVIEW_QUESTIONS,
  MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES,
  activeReviewSnapshotBytes
} from '../src/lib/server/db/active-review-content.js';
import { createDb } from '../src/lib/server/db/index.js';
import {
  ActiveReviewError,
  createFreeActiveReview,
  createScheduledActiveReview,
  getActiveReview
} from '../src/lib/server/db/active-reviews.js';
import {
  freshLearnerFsrsStart,
  resetLearnerFsrsProgress
} from '../src/lib/server/db/fsrs-reset-fresh.js';
import { planScheduledSystemStudyRun } from '../src/lib/server/db/study-run-planning.js';

const userId = 'active-review-d1-smoke-user';
const systemId = 'active-review-d1-smoke-system';
const topicId = 'active-review-d1-smoke-topic';
const caseId = 'active-review-d1-smoke-case';
const routes = [{ routeType: 'topic', routeId: topicId }];
const proofSecret = 'active-review-d1-smoke-proof-secret';

function exactSnapshot(review) {
  return {
    version: review.snapshotVersion,
    case: {
      id: review.caseId,
      title: review.caseTitleSnapshot,
      vignetteMd: review.vignetteSnapshotMd
    },
    questions: review.questions.map(({ id: _id, activeReviewId: _activeReviewId, ...question }) => question),
    assets: review.assets.map(({ id: _id, activeReviewId: _activeReviewId, ...asset }) => asset)
  };
}

function assertMaximumFixture(review) {
  if (review.questions.length !== MAX_ACTIVE_REVIEW_QUESTIONS) {
    throw new Error(`Expected ${MAX_ACTIVE_REVIEW_QUESTIONS} frozen questions; got ${review.questions.length}.`);
  }
  if (review.assets.length !== MAX_ACTIVE_REVIEW_ASSETS) {
    throw new Error(`Expected ${MAX_ACTIVE_REVIEW_ASSETS} frozen assets; got ${review.assets.length}.`);
  }
  const snapshotBytes = activeReviewSnapshotBytes(exactSnapshot(review));
  if (snapshotBytes > MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES) {
    throw new Error(`D1 smoke fixture unexpectedly exceeded the active Review envelope: ${snapshotBytes}.`);
  }
  return snapshotBytes;
}

async function createMaximumReview(db, runId) {
  const result = await createFreeActiveReview({
    db,
    userId,
    systemId,
    routes,
    caseId,
    runId,
    rng: () => 0
  });
  if (result.status !== 'created') {
    throw new Error(`Expected a newly created active Review; got ${result.status}.`);
  }
  return {
    id: result.review.id,
    snapshotBytes: assertMaximumFixture(result.review)
  };
}

async function readProfile(env) {
  const profile = await env.DB.prepare(`
    SELECT generation, review_sequence_epoch, parameter_revision
    FROM learner_fsrs_profiles
    WHERE user_id = ?
    LIMIT 1
  `).bind(userId).first();
  if (!profile) throw new Error('Expected an initialized learner FSRS profile during race smoke.');
  return {
    generation: Number(profile.generation),
    reviewSequenceEpoch: Number(profile.review_sequence_epoch),
    parameterRevision: Number(profile.parameter_revision)
  };
}

async function readActiveBoundary(env) {
  const row = await env.DB.prepare(`
    SELECT generation, review_sequence_epoch, parameter_revision
    FROM active_reviews
    WHERE user_id = ?
    LIMIT 1
  `).bind(userId).first();
  if (!row) return null;
  return {
    generation: Number(row.generation),
    reviewSequenceEpoch: Number(row.review_sequence_epoch),
    parameterRevision: Number(row.parameter_revision)
  };
}

async function activeReviewCount(env) {
  const row = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM active_reviews WHERE user_id = ?')
    .bind(userId)
    .first();
  return Number(row?.n ?? 0);
}

async function prepareBoundaryScenario(db, env, runId) {
  await env.DB.prepare('DELETE FROM active_reviews WHERE user_id = ?').bind(userId).run();
  await env.DB.prepare('DELETE FROM learner_case_fsrs WHERE user_id = ?').bind(userId).run();

  const descriptor = await planScheduledSystemStudyRun({
    db,
    userId,
    systemId,
    routes,
    proofSecret,
    now: Date.now(),
    rng: () => 0,
    runId
  });
  const entry = descriptor.capturedNew[0];
  if (!entry) {
    throw new Error('Reset/Fresh race smoke expected the fixture Case to be captured New.');
  }
  const workProof = descriptor.membershipProofs.new[entry.proofIndex];
  if (!workProof) throw new Error('Reset/Fresh race smoke expected a captured-New work proof.');

  return {
    before: {
      generation: descriptor.schedulerBoundary.generation,
      reviewSequenceEpoch: descriptor.schedulerBoundary.reviewSequenceEpoch,
      parameterRevision: descriptor.schedulerBoundary.parameterRevision
    },
    input: {
      db,
      userId,
      systemId,
      routes,
      caseId: entry.caseId,
      queueClass: 'new',
      runBoundaryToken: descriptor.runBoundaryToken,
      workProof,
      proofSecret,
      now: descriptor.runStartedAt + 1,
      rng: () => 0
    }
  };
}

function assertExpectedBoundaryChange(before, after, operation) {
  if (operation === 'reset') {
    if (after.generation !== before.generation) {
      throw new Error('Reset race changed generation unexpectedly.');
    }
    if (after.reviewSequenceEpoch !== before.reviewSequenceEpoch + 1) {
      throw new Error('Reset race did not advance the review-sequence epoch exactly once.');
    }
    if (after.parameterRevision !== before.parameterRevision) {
      throw new Error('Reset race changed parameter revision unexpectedly.');
    }
    return;
  }

  if (after.generation !== before.generation + 1) {
    throw new Error('Fresh race did not advance generation exactly once.');
  }
  if (after.reviewSequenceEpoch !== before.reviewSequenceEpoch + 1) {
    throw new Error('Fresh race did not advance the review-sequence epoch exactly once.');
  }
  if (after.parameterRevision !== before.parameterRevision + 1) {
    throw new Error('Fresh race did not publish exactly one new parameter revision.');
  }
}

function classifyCreationRaceResult(creation) {
  if (creation.status === 'fulfilled') {
    if (creation.value.status !== 'created') {
      throw new Error(`Concurrent Scheduled creation unexpectedly returned ${creation.value.status}.`);
    }
    return 'created-then-consumed';
  }
  if (creation.reason instanceof ActiveReviewError && creation.reason.code === 'stale-run') {
    return 'stale-rejected';
  }
  if (
    creation.reason instanceof Error
    && creation.reason.message.includes('Active Review creation committed without a readable Review')
  ) {
    return 'created-then-consumed';
  }
  throw creation.reason;
}

async function applyBoundaryChange(db, operation) {
  return operation === 'reset'
    ? resetLearnerFsrsProgress({ db, userId })
    : freshLearnerFsrsStart({ db, userId });
}

async function runBoundaryCreationRace(db, env, operation) {
  const runId = `active-review-${operation}-race-${globalThis.crypto.randomUUID()}`;
  const { before, input } = await prepareBoundaryScenario(db, env, runId);

  const creationPromise = createScheduledActiveReview(input);
  const boundaryPromise = applyBoundaryChange(db, operation);
  const [creation, boundary] = await Promise.allSettled([creationPromise, boundaryPromise]);

  if (boundary.status !== 'fulfilled') throw boundary.reason;
  const creationOutcome = classifyCreationRaceResult(creation);

  const after = await readProfile(env);
  assertExpectedBoundaryChange(before, after, operation);

  const remainingActiveReviews = await activeReviewCount(env);
  if (remainingActiveReviews !== 0) {
    throw new Error(`${operation} committed with ${remainingActiveReviews} stale active Review row(s).`);
  }

  return {
    operation,
    serialization: 'concurrent',
    creationOutcome,
    before,
    after,
    remainingActiveReviews
  };
}

async function runCreationFirstBoundary(db, env, operation) {
  const runId = `active-review-${operation}-creation-first-${globalThis.crypto.randomUUID()}`;
  const { before, input } = await prepareBoundaryScenario(db, env, runId);

  const creation = await createScheduledActiveReview(input);
  if (creation.status !== 'created') {
    throw new Error(`Creation-first ${operation} proof expected a newly created Scheduled Review.`);
  }

  const activeBoundaryBefore = await readActiveBoundary(env);
  if (!activeBoundaryBefore) {
    throw new Error(`Creation-first ${operation} proof could not read the committed Scheduled active Review.`);
  }
  if (
    activeBoundaryBefore.generation !== before.generation
    || activeBoundaryBefore.reviewSequenceEpoch !== before.reviewSequenceEpoch
    || activeBoundaryBefore.parameterRevision !== before.parameterRevision
  ) {
    throw new Error(`Creation-first ${operation} proof created a Review on an unexpected boundary.`);
  }

  await applyBoundaryChange(db, operation);

  const after = await readProfile(env);
  assertExpectedBoundaryChange(before, after, operation);
  const remainingActiveReviews = await activeReviewCount(env);
  if (remainingActiveReviews !== 0) {
    throw new Error(`Creation-first ${operation} committed with ${remainingActiveReviews} stale active Review row(s).`);
  }

  return {
    operation,
    serialization: 'creation-first',
    creationOutcome: 'created-then-consumed',
    before,
    activeBoundaryBefore,
    after,
    remainingActiveReviews
  };
}

export default {
  async fetch(request, env) {
    const db = createDb(env.DB);
    const pathname = new URL(request.url).pathname;

    if (pathname === '/create-maximum') {
      const before = await getActiveReview(db, userId);
      if (before) throw new Error('Maximum-fixture smoke expected no active Review before initial creation.');
      return Response.json(await createMaximumReview(db, 'active-review-d1-smoke-run-1'));
    }

    if (pathname === '/expire-and-discover') {
      const now = Date.now();
      const current = await env.DB
        .prepare('SELECT id FROM active_reviews WHERE user_id = ?')
        .bind(userId)
        .first();
      if (!current?.id) throw new Error('Expected an active Review before expiry smoke.');

      await env.DB
        .prepare('UPDATE active_reviews SET started_at = ?, expires_at = ? WHERE user_id = ?')
        .bind(now - 10_000, now - 1, userId)
        .run();

      const discovered = await getActiveReview(db, userId);
      if (discovered !== null) {
        throw new Error('Expired active Review must be invisible to Resume discovery.');
      }

      const stillOwned = await env.DB
        .prepare('SELECT id FROM active_reviews WHERE user_id = ?')
        .bind(userId)
        .first();
      if (stillOwned?.id !== current.id) {
        throw new Error('Resume discovery must not delete the expired ownership row before replacement.');
      }

      return Response.json({ expiredId: current.id, stillOwned: true });
    }

    if (pathname === '/replace-maximum') {
      const replacement = await createMaximumReview(db, 'active-review-d1-smoke-run-2');
      const ownerRows = await env.DB
        .prepare('SELECT COUNT(*) AS n FROM active_reviews WHERE user_id = ?')
        .bind(userId)
        .first();
      if (Number(ownerRows?.n ?? 0) !== 1) {
        throw new Error('Expired replacement must commit exactly one active ownership row.');
      }
      return Response.json(replacement);
    }

    if (pathname === '/race-reset') {
      return Response.json(await runBoundaryCreationRace(db, env, 'reset'));
    }

    if (pathname === '/race-fresh') {
      return Response.json(await runBoundaryCreationRace(db, env, 'fresh'));
    }

    if (pathname === '/creation-first-reset') {
      return Response.json(await runCreationFirstBoundary(db, env, 'reset'));
    }

    if (pathname === '/creation-first-fresh') {
      return Response.json(await runCreationFirstBoundary(db, env, 'fresh'));
    }

    return new Response('Not found', { status: 404 });
  }
};
