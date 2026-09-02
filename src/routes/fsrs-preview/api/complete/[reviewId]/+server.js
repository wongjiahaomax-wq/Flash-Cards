import { createDb } from '$lib/server/db/index.js';
import { getActiveReviewById } from '$lib/server/db/active-reviews.js';
import { completeFreeReview } from '$lib/server/db/free-review-completion.js';
import { completeScheduledReview } from '$lib/server/db/scheduled-review-completion.js';
import { completeFsrsPreviewRequest } from '$lib/fsrs-preview-completion.js';
import {
  LOCAL_FSRS_PREVIEW_PROOF_SECRET,
  isLocalFsrsPreviewRequest
} from '$lib/server/learning/local-fsrs-preview.js';
import { issueScheduledRunBoundaryToken } from '$lib/server/learning/study-run-proof.js';

/** @param {unknown} body @param {number} [status] */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function POST({ locals, params, platform, request, url }) {
  if (!isLocalFsrsPreviewRequest(url, platform?.env)) return json({ message: 'Not found.' }, 404);
  if (!locals.user) return json({ message: 'Authentication required.' }, 401);
  if (!platform?.env?.DB) return json({ message: 'Local D1 is not configured.' }, 503);

  /** @type {any} */
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ message: 'Invalid completion payload.' }, 400);
  }

  try {
    const result = await completeFsrsPreviewRequest({
      db: createDb(platform.env.DB),
      userId: locals.user.id,
      reviewId: params.reviewId,
      payload,
      proofSecret: LOCAL_FSRS_PREVIEW_PROOF_SECRET,
      now: new Date()
    }, {
      getActiveReviewById,
      completeScheduledReview,
      completeFreeReview,
      issueScheduledRunBoundaryToken
    });
    if (result.status === 'missing') {
      return json({ message: 'Active Review not found or expired.' }, 404);
    }
    return json(result);
  } catch (cause) {
    return json({ message: cause instanceof Error ? cause.message : String(cause) }, 400);
  }
}
