import { getOwnedActiveReviewMediaSnapshot } from '$lib/server/db/active-review-media.js';
import { createDb } from '$lib/server/db/index.js';
import { isStudyDataDeletionActive } from '$lib/server/db/learner-study-data-deletion.ts';
import { learnerStudyAccessError } from '$lib/server/learning/learner-study-runtime.js';
import { serveReviewImage } from '$lib/server/storage/serve.js';

export async function GET({ locals, params, platform, request }) {
  const noStore = { 'Cache-Control': 'no-store' };
  const access = learnerStudyAccessError(locals.user, platform?.env);
  if (access) return new Response(access.message, { status: access.status, headers: noStore });
  if (!locals.user || !platform?.env?.DB || !platform?.env?.MEDIA) {
    return new Response('Study media storage is not configured.', { status: 503, headers: noStore });
  }
  if (await isStudyDataDeletionActive(createDb(platform.env.DB), locals.user.id)) {
    return new Response('Study data deletion is in progress. Continue it from the Study page before studying again.', { status: 409, headers: noStore });
  }

  const asset = await getOwnedActiveReviewMediaSnapshot(
    platform.env.DB,
    locals.user.id,
    params.reviewId,
    params.assetId
  );
  if (!asset) return new Response('Not found.', { status: 404, headers: noStore });

  return serveReviewImage({
    user: locals.user,
    storageKeySnapshot: asset.storageKeySnapshot,
    bucket: platform.env.MEDIA,
    request
  });
}
