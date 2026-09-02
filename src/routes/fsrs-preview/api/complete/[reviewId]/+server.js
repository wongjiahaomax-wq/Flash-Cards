import { createDb } from '$lib/server/db/index.js';
import { getActiveReviewById } from '$lib/server/db/active-reviews.js';
import { completeFreeReview } from '$lib/server/db/free-review-completion.js';
import { completeScheduledReview } from '$lib/server/db/scheduled-review-completion.js';
import { applyFreeCompletion } from '$lib/free-study-run.js';
import { applyScheduledCompletion } from '$lib/scheduled-study-run.js';
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

/** @param {unknown} value */
function timestampMs(value) {
  if (value instanceof Date) return value.getTime();
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

/** @param {NonNullable<Awaited<ReturnType<typeof getActiveReviewById>>>} review @param {string} userId */
async function reconstructedRunToken(review, userId) {
  const runStartedAt = timestampMs(review.runStartedAt);
  if (runStartedAt == null) throw new Error('Active Scheduled Review has no valid run start time.');
  return issueScheduledRunBoundaryToken({
    secret: LOCAL_FSRS_PREVIEW_PROOF_SECRET,
    boundary: {
      userId,
      runId: review.runId,
      runStartedAt,
      scopeFingerprint: review.scopeFingerprint,
      generation: Number(review.generation),
      reviewSequenceEpoch: Number(review.reviewSequenceEpoch),
      parameterRevision: Number(review.parameterRevision),
      schedulerRevision: Number(review.schedulerRevision),
      schedulerLibraryVersion: String(review.schedulerLibraryVersion)
    }
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
  const db = createDb(platform.env.DB);
  const review = await getActiveReviewById(db, locals.user.id, params.reviewId);
  if (!review) return json({ message: 'Active Review not found or expired.' }, 404);

  try {
    if (review.studyMode === 'scheduled') {
      const descriptor = payload?.descriptor;
      const descriptorMatches = descriptor?.kind === 'scheduled'
        && descriptor.currentReviewId === review.id
        && descriptor.runId === review.runId;
      const runBoundaryToken = descriptorMatches
        ? descriptor.runBoundaryToken
        : await reconstructedRunToken(review, locals.user.id);
      const result = await completeScheduledReview({
        db,
        userId: locals.user.id,
        reviewId: review.id,
        rating: payload?.rating,
        runBoundaryToken,
        proofSecret: LOCAL_FSRS_PREVIEW_PROOF_SECRET,
        now: new Date()
      });
      return json({
        status: result.status,
        result,
        descriptor: descriptorMatches ? applyScheduledCompletion(descriptor, result) : null,
        runLost: !descriptorMatches
      });
    }

    const descriptor = payload?.descriptor;
    const descriptorMatches = descriptor?.kind === 'free'
      && descriptor.currentReviewId === review.id
      && descriptor.runId === review.runId;
    const result = await completeFreeReview({
      db,
      userId: locals.user.id,
      reviewId: review.id,
      now: new Date()
    });
    return json({
      status: result.status,
      result,
      descriptor: descriptorMatches ? applyFreeCompletion(descriptor, result) : null,
      runLost: !descriptorMatches
    });
  } catch (cause) {
    return json({ message: cause instanceof Error ? cause.message : String(cause) }, 400);
  }
}
