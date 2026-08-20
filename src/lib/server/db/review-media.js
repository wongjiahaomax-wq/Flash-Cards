import { and, eq } from 'drizzle-orm';

import { reviewAssets, reviews } from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/**
 * Load the immutable Review-owned media identities used to construct learner
 * delivery URLs. Ownership is checked against the Review rather than the
 * current Asset state.
 *
 * @param {LearningDb} db
 * @param {string} reviewId
 * @param {string} userId
 */
export async function listOwnedReviewMedia(db, reviewId, userId) {
  return db.select({
    reviewAssetId: reviewAssets.id,
    assetId: reviewAssets.assetId,
    displayOrder: reviewAssets.displayOrder,
    storageKeySnapshot: reviewAssets.storageKeySnapshot
  })
    .from(reviewAssets)
    .innerJoin(reviews, eq(reviews.id, reviewAssets.reviewId))
    .where(and(eq(reviewAssets.reviewId, reviewId), eq(reviews.userId, userId)))
    .orderBy(reviewAssets.displayOrder);
}

/**
 * Resolve one authenticated learner's historical media snapshot. The caller
 * receives only the server-side snapshotted key; no arbitrary R2 key can be
 * supplied by the request.
 *
 * @param {LearningDb} db
 * @param {{ reviewId: string, reviewAssetId: string, userId: string }} input
 */
export async function getOwnedReviewMediaSnapshot(db, { reviewId, reviewAssetId, userId }) {
  return (await db.select({
    reviewAssetId: reviewAssets.id,
    assetId: reviewAssets.assetId,
    storageKeySnapshot: reviewAssets.storageKeySnapshot
  })
    .from(reviewAssets)
    .innerJoin(reviews, eq(reviews.id, reviewAssets.reviewId))
    .where(and(
      eq(reviewAssets.id, reviewAssetId),
      eq(reviewAssets.reviewId, reviewId),
      eq(reviews.userId, userId)
    ))
    .limit(1))[0] ?? null;
}
