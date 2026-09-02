import { createDb } from '$lib/server/db/index.js';
import { getActiveReviewById } from '$lib/server/db/active-reviews.js';
import { isLocalFsrsPreviewRequest } from '$lib/server/learning/local-fsrs-preview.js';
import { serveReviewImage } from '$lib/server/storage/serve.js';

export async function GET({ locals, params, platform, request, url }) {
  const noStore = { 'Cache-Control': 'no-store' };
  if (!isLocalFsrsPreviewRequest(url, platform?.env)) return new Response('Not found.', { status: 404, headers: noStore });
  if (!locals.user) return new Response('Authentication required.', { status: 401, headers: noStore });
  if (!platform?.env?.DB || !platform?.env?.MEDIA) {
    return new Response('Local media storage is not configured.', { status: 503, headers: noStore });
  }
  const review = await getActiveReviewById(createDb(platform.env.DB), locals.user.id, params.reviewId);
  const asset = review?.assets.find((item) => item.id === params.assetId);
  if (!asset) return new Response('Not found.', { status: 404, headers: noStore });
  return serveReviewImage({
    user: locals.user,
    storageKeySnapshot: asset.storageKeySnapshot,
    bucket: platform.env.MEDIA,
    request
  });
}
