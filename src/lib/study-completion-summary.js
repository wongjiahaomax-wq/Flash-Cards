/** @param {any} descriptor */
export function buildStudyCompletionSummary(descriptor) {
  if (!descriptor || !['scheduled', 'free'].includes(descriptor.kind)) return null;
  if (descriptor.kind === 'scheduled') {
    const completedDistinct = new Set(Array.isArray(descriptor.completedCaseIds) ? descriptor.completedCaseIds : []).size;
    return {
      version: 1,
      runId: String(descriptor.runId ?? ''),
      mode: 'Scheduled Study',
      completedDistinct,
      repeatCount: null,
      target: descriptor.distinctCaseTarget == null ? null : Number(descriptor.distinctCaseTarget)
    };
  }
  const position = Number(descriptor.position ?? 0);
  const completedDistinct = Number.isInteger(position) && position >= 0
    ? new Set(Array.isArray(descriptor.bag) ? descriptor.bag.slice(0, position) : []).size
    : 0;
  return {
    version: 1,
    runId: String(descriptor.runId ?? ''),
    mode: 'Free Study',
    completedDistinct,
    repeatCount: null,
    target: descriptor.distinctCaseTarget == null ? null : Number(descriptor.distinctCaseTarget)
  };
}
