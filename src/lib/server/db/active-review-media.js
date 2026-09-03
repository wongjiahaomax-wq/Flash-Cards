const DATABASE_NOW_MS_SQL = "cast((julianday('now') - 2440587.5) * 86400000 as integer)";

/**
 * Resolve the frozen R2 object for one unexpired active Review asset owned by
 * the authenticated learner. This intentionally avoids loading the complete
 * active Review snapshot (including every question/asset) for a single media
 * request.
 *
 * @param {D1Database} binding
 * @param {string} userId
 * @param {string} reviewId
 * @param {string} activeReviewAssetId
 * @returns {Promise<{storageKeySnapshot:string}|null>}
 */
export async function getOwnedActiveReviewMediaSnapshot(binding, userId, reviewId, activeReviewAssetId) {
  const normalizedUserId = String(userId ?? '').trim();
  const normalizedReviewId = String(reviewId ?? '').trim();
  const normalizedAssetId = String(activeReviewAssetId ?? '').trim();
  if (!normalizedUserId || !normalizedReviewId || !normalizedAssetId) return null;

  const result = await binding.prepare(`
    SELECT ara.storage_key_snapshot AS storageKeySnapshot
    FROM active_review_assets ara
    INNER JOIN active_reviews ar ON ar.id = ara.active_review_id
    WHERE ara.id = ?
      AND ar.id = ?
      AND ar.user_id = ?
      AND ar.expires_at > ${DATABASE_NOW_MS_SQL}
    LIMIT 1
  `).bind(normalizedAssetId, normalizedReviewId, normalizedUserId).all();

  const row = result.results?.[0];
  if (!row || typeof row.storageKeySnapshot !== 'string' || !row.storageKeySnapshot.trim()) return null;
  return { storageKeySnapshot: row.storageKeySnapshot };
}
