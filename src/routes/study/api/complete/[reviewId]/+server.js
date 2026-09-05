import { createDb } from '$lib/server/db/index.js';
import { getActiveReviewById } from '$lib/server/db/active-reviews.js';
import { completeFreeReview } from '$lib/server/db/free-review-completion.js';
import { completeScheduledReview } from '$lib/server/db/scheduled-review-completion.js';
import { isStudyDataDeletionActive } from '$lib/server/db/learner-study-data-deletion.ts';
import {
  learnerStudyAccessError,
  learnerStudyProofSecret
} from '$lib/server/learning/learner-study-runtime.js';
import { issueScheduledRunBoundaryToken } from '$lib/server/learning/study-run-proof.js';
import { completeStudyRunRequest } from '$lib/study-run-completion.js';

/** @param {unknown} body @param {number} [status] */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function POST({ locals, params, platform, request }) {
  const access = learnerStudyAccessError(locals.user, platform?.env);
  if (access) return json({ message: access.message }, access.status);
  if (!locals.user || !platform?.env?.DB) return json({ message: 'Study database is not configured.' }, 503);

  const db = createDb(platform.env.DB);
  if (await isStudyDataDeletionActive(db, locals.user.id)) {
    return json({ message: 'Study data deletion is in progress. Continue it from the Study page before studying again.' }, 409);
  }

  /** @type {any} */
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ message: 'Invalid completion payload.' }, 400);
  }

  try {
    const result = await completeStudyRunRequest({
      db,
      userId: locals.user.id,
      reviewId: params.reviewId,
      payload,
      proofSecret: learnerStudyProofSecret(platform.env),
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
