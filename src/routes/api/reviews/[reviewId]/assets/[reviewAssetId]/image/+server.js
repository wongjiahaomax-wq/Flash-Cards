import { createDb } from '$lib/server/db/index.js';
import { getOwnedReviewMediaSnapshot } from '$lib/server/db/review-media.js';
import { serveReviewImage } from '$lib/server/storage/serve.js';

export async function GET({ locals, params, platform, request }) {
  if (!locals.user) {
    return new Response('Authentication required.', {
      status: 401,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const database = platform?.env?.DB;
  const bucket = platform?.env?.MEDIA;
  if (!database || !bucket) {
    return new Response('Media storage is not configured.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const reviewId = String(params.reviewId ?? '').trim();
  const reviewAssetId = String(params.reviewAssetId ?? '').trim();
  if (!reviewId || !reviewAssetId) {
    return new Response('Not found.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const snapshot = await getOwnedReviewMediaSnapshot(createDb(database), {
    reviewId,
    reviewAssetId,
    userId: locals.user.id
  });
  if (!snapshot) {
    return new Response('Not found.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  return serveReviewImage({
    user: locals.user,
    storageKeySnapshot: snapshot.storageKeySnapshot,
    bucket,
    request
  });
}
