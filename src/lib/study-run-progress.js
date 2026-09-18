import { effectiveStudyRunDistinctCaseTarget } from './study-run-size.js';

/** @param {any} descriptor @returns {{current:number,total:number}|null} */
export function activeStudyRunProgress(descriptor) {
  if (!descriptor?.currentReviewId) return null;

  if (descriptor.kind === 'free') {
    if (!Array.isArray(descriptor.bag)) return null;
    const total = effectiveStudyRunDistinctCaseTarget(descriptor.distinctCaseTarget, descriptor.bag.length);
    const position = Number(descriptor.position);
    if (!Number.isInteger(position) || position < 0 || position >= total) return null;
    return { current: position + 1, total };
  }

  if (
    descriptor.kind !== 'scheduled'
    || !Array.isArray(descriptor.capturedDue)
    || !Array.isArray(descriptor.capturedNew)
    || !Array.isArray(descriptor.completedCaseIds)
    || !descriptor.currentWork?.caseId
  ) return null;

  const duePosition = Number(descriptor.duePosition);
  const newPosition = Number(descriptor.newPosition);
  if (
    !Number.isInteger(duePosition) || duePosition < 0 || duePosition > descriptor.capturedDue.length
    || !Number.isInteger(newPosition) || newPosition < 0 || newPosition > descriptor.capturedNew.length
  ) return null;

  const completed = new Set(descriptor.completedCaseIds);
  const remaining = descriptor.capturedDue.length - duePosition + descriptor.capturedNew.length - newPosition;
  const attainable = completed.size + remaining;
  if (attainable < 1) return null;

  const total = effectiveStudyRunDistinctCaseTarget(descriptor.distinctCaseTarget, attainable);
  const current = completed.has(descriptor.currentWork.caseId) ? completed.size : completed.size + 1;
  return current >= 1 && current <= total ? { current, total } : null;
}
