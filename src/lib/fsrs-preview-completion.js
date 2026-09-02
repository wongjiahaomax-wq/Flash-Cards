import { applyFreeCompletion } from './free-study-run.js';
import { isFsrsPreviewRunDescriptor } from './fsrs-preview-run-storage.js';
import { applyScheduledCompletion } from './scheduled-study-run.js';

/** @param {unknown} value */
function timestampMs(value) {
  if (value instanceof Date) return value.getTime();
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

/** @param {any} descriptor @param {string} reviewId */
function matchingBrowserDescriptor(descriptor, reviewId) {
  return isFsrsPreviewRunDescriptor(descriptor) && descriptor.currentReviewId === reviewId;
}

/** @param {any} descriptor @param {any} result @param {(descriptor:any,result:any)=>any} apply */
function browserCompletion(descriptor, result, apply) {
  try {
    return { descriptor: apply(descriptor, result), runLost: false };
  } catch {
    return { descriptor: null, runLost: true };
  }
}

/**
 * Preview completion orchestration. A matching browser descriptor is intentionally
 * routed to the receipt-owning completion service before reading active_reviews,
 * so an identical retry remains safe after the first transaction consumed the
 * active Review and its HTTP response was lost.
 *
 * @param {{db:any,userId:string,reviewId:string,payload:any,proofSecret:string,now?:Date|number|string}} input
 * @param {{
 *   getActiveReviewById:(db:any,userId:string,reviewId:string)=>Promise<any|null>,
 *   completeScheduledReview:(input:any)=>Promise<any>,
 *   completeFreeReview:(input:any)=>Promise<any>,
 *   issueScheduledRunBoundaryToken:(input:any)=>Promise<string>
 * }} services
 * @returns {Promise<any>}
 */
export async function completeFsrsPreviewRequest(input, services) {
  const descriptor = input.payload?.descriptor;
  const descriptorMatches = matchingBrowserDescriptor(descriptor, input.reviewId);
  const now = input.now ?? new Date();

  if (descriptorMatches && descriptor.kind === 'scheduled') {
    const result = await services.completeScheduledReview({
      db: input.db,
      userId: input.userId,
      reviewId: input.reviewId,
      rating: input.payload?.rating,
      runBoundaryToken: descriptor.runBoundaryToken,
      proofSecret: input.proofSecret,
      now
    });
    return {
      status: result.status,
      result,
      ...browserCompletion(descriptor, result, applyScheduledCompletion)
    };
  }

  if (descriptorMatches && descriptor.kind === 'free') {
    const result = await services.completeFreeReview({
      db: input.db,
      userId: input.userId,
      reviewId: input.reviewId,
      now
    });
    return {
      status: result.status,
      result,
      ...browserCompletion(descriptor, result, applyFreeCompletion)
    };
  }

  const review = await services.getActiveReviewById(input.db, input.userId, input.reviewId);
  if (!review) return { status: 'missing' };

  if (review.studyMode === 'scheduled') {
    const runStartedAt = timestampMs(review.runStartedAt);
    if (runStartedAt == null) throw new Error('Active Scheduled Review has no valid run start time.');
    const runBoundaryToken = await services.issueScheduledRunBoundaryToken({
      secret: input.proofSecret,
      boundary: {
        userId: input.userId,
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
    const result = await services.completeScheduledReview({
      db: input.db,
      userId: input.userId,
      reviewId: input.reviewId,
      rating: input.payload?.rating,
      runBoundaryToken,
      proofSecret: input.proofSecret,
      now
    });
    return { status: result.status, result, descriptor: null, runLost: true };
  }

  if (review.studyMode === 'free') {
    const result = await services.completeFreeReview({
      db: input.db,
      userId: input.userId,
      reviewId: input.reviewId,
      now
    });
    return { status: result.status, result, descriptor: null, runLost: true };
  }

  return { status: 'missing' };
}
