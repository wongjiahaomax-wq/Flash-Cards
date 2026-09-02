import {
  MAX_ACTIVE_REVIEW_ASSETS,
  MAX_ACTIVE_REVIEW_QUESTIONS,
  MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES,
  activeReviewSnapshotBytes
} from '../src/lib/server/db/active-review-content.js';
import { createDb } from '../src/lib/server/db/index.js';
import {
  createFreeActiveReview,
  getActiveReview
} from '../src/lib/server/db/active-reviews.js';

const userId = 'active-review-d1-smoke-user';
const systemId = 'active-review-d1-smoke-system';
const topicId = 'active-review-d1-smoke-topic';
const caseId = 'active-review-d1-smoke-case';
const routes = [{ routeType: 'topic', routeId: topicId }];

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

    return new Response('Not found', { status: 404 });
  }
};
