export const STUDY_DATA_DELETION_FENCE_ERROR = 'learner_study_data_deletion_in_progress';
export const STUDY_DATA_DELETION_FENCE_MESSAGE =
  'Study data deletion is in progress. Try again after it completes.';

export function createStudyDataDeletionFenceError() {
  const error = /** @type {Error & {code: string}} */ (new Error(STUDY_DATA_DELETION_FENCE_MESSAGE));
  error.code = 'study-data-deletion-in-progress';
  return error;
}

/** @param {unknown} cause */
export function isStudyDataDeletionFenceError(cause) {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  const code = cause && typeof cause === 'object'
    ? /** @type {{code?: string}} */ (cause).code
    : undefined;
  return code === 'study-data-deletion-in-progress'
    || message.includes(STUDY_DATA_DELETION_FENCE_ERROR);
}
