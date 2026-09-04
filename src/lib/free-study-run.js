import {
  effectiveStudyRunDistinctCaseTarget,
  isStudyRunDistinctCaseTarget
} from './study-run-size.js';

export class FreeStudyRunError extends Error {
  /** @param {'invalid-descriptor'|'work-mismatch'|'review-in-progress'} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'FreeStudyRunError';
    this.code = code;
  }
}

/** @typedef {{status:'ready',caseId:string}|{status:'complete'}} FreeWorkSelection */

/** @param {any} descriptor */
function assertDescriptor(descriptor) {
  if (
    !descriptor
    || descriptor.kind !== 'free'
    || descriptor.version !== 2
    || !Array.isArray(descriptor.bag)
    || !isStudyRunDistinctCaseTarget(descriptor.distinctCaseTarget)
  ) {
    throw new FreeStudyRunError('invalid-descriptor', 'Free Study run descriptor is invalid or unsupported.');
  }
}

/** @param {any} descriptor @returns {FreeWorkSelection} */
export function selectNextFreeWork(descriptor) {
  assertDescriptor(descriptor);
  if (descriptor.currentReviewId) {
    throw new FreeStudyRunError('review-in-progress', 'Finish or discard the current Free Review before selecting more work.');
  }
  const position = Number(descriptor.position ?? 0);
  if (!Number.isInteger(position) || position < 0 || position > descriptor.bag.length) {
    throw new FreeStudyRunError('invalid-descriptor', 'Free Study bag position is invalid.');
  }
  const effectiveTarget = effectiveStudyRunDistinctCaseTarget(
    descriptor.distinctCaseTarget,
    descriptor.bag.length
  );
  if (position >= effectiveTarget) return { status: 'complete' };
  const caseId = descriptor.bag[position];
  return typeof caseId === 'string' && caseId
    ? { status: 'ready', caseId }
    : { status: 'complete' };
}

/** @param {any} descriptor @param {string} caseId @param {string} reviewId */
export function beginFreeWork(descriptor, caseId, reviewId) {
  const next = selectNextFreeWork(descriptor);
  if (next.status !== 'ready' || next.caseId !== caseId || !reviewId) {
    throw new FreeStudyRunError('work-mismatch', 'Free Study work no longer matches the current bag position.');
  }
  return { ...descriptor, currentReviewId: reviewId };
}

/**
 * Remove one server-revalidated stale/ineligible Free queue entry without
 * consuming a distinct-Case run slot. The bag remains browser-local; the
 * server-side active Review creator remains the eligibility authority.
 * @param {any} descriptor
 * @param {string} caseId
 */
export function skipFreeWork(descriptor, caseId) {
  const next = selectNextFreeWork(descriptor);
  if (next.status !== 'ready' || next.caseId !== caseId) {
    throw new FreeStudyRunError('work-mismatch', 'Free Study bag position no longer matches the skipped Case.');
  }
  const position = Number(descriptor.position ?? 0);
  return {
    ...descriptor,
    bag: [
      ...descriptor.bag.slice(0, position),
      ...descriptor.bag.slice(position + 1)
    ]
  };
}

/** @param {any} descriptor @param {{receiptId:string,caseId:string}} result */
export function applyFreeCompletion(descriptor, result) {
  assertDescriptor(descriptor);
  if (!descriptor.currentReviewId) return descriptor;
  const position = Number(descriptor.position ?? 0);
  if (
    descriptor.currentReviewId !== result.receiptId
    || descriptor.bag[position] !== result.caseId
  ) {
    throw new FreeStudyRunError('work-mismatch', 'Free completion receipt does not match the active browser Review.');
  }
  return {
    ...descriptor,
    position: position + 1,
    currentReviewId: null
  };
}
