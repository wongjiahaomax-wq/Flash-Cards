export const STUDY_RUN_DEFAULT_DISTINCT_CASE_TARGET = 10;
export const STUDY_RUN_DISTINCT_CASE_TARGET_OPTIONS = Object.freeze([5, 10, 20]);

/** @param {unknown} value */
export function isStudyRunDistinctCaseTarget(value) {
  return value == null
    || (Number.isInteger(value) && STUDY_RUN_DISTINCT_CASE_TARGET_OPTIONS.includes(Number(value)));
}

/**
 * Parse the learner-facing run-size form value. Missing/blank input defaults to
 * 10 so non-UI callers of the shared planning boundary get the same product
 * default. `null` represents All available inside browser-local descriptors.
 *
 * @param {unknown} value
 * @returns {5|10|20|null}
 */
export function parseStudyRunDistinctCaseTarget(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return STUDY_RUN_DEFAULT_DISTINCT_CASE_TARGET;
  if (normalized === 'all') return null;
  const parsed = Number(normalized);
  if (Number.isInteger(parsed) && STUDY_RUN_DISTINCT_CASE_TARGET_OPTIONS.includes(parsed)) {
    return /** @type {5|10|20} */ (parsed);
  }
  throw new TypeError('Run size must be 5, 10, 20, or All available.');
}

/** @param {unknown} target @param {number} completedDistinctCases */
export function hasReachedStudyRunDistinctCaseTarget(target, completedDistinctCases) {
  if (!isStudyRunDistinctCaseTarget(target)) {
    throw new TypeError('Study run distinct-Case target is invalid.');
  }
  if (!Number.isInteger(completedDistinctCases) || completedDistinctCases < 0) {
    throw new TypeError('Completed distinct-Case count must be a non-negative integer.');
  }
  return target != null && completedDistinctCases >= Number(target);
}

/** @param {unknown} target @param {number} availableDistinctCases */
export function effectiveStudyRunDistinctCaseTarget(target, availableDistinctCases) {
  if (!isStudyRunDistinctCaseTarget(target)) {
    throw new TypeError('Study run distinct-Case target is invalid.');
  }
  if (!Number.isInteger(availableDistinctCases) || availableDistinctCases < 0) {
    throw new TypeError('Available distinct-Case count must be a non-negative integer.');
  }
  return target == null ? availableDistinctCases : Math.min(Number(target), availableDistinctCases);
}
