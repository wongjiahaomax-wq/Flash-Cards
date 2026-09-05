export const STUDY_DATA_DELETION_FENCE_ERROR = 'learner_study_data_deletion_in_progress';
export const STUDY_DATA_DELETION_FENCE_MESSAGE =
  'Study data deletion is in progress. Try again after it completes.';

/** @param {unknown} cause */
export function isStudyDataDeletionFenceError(cause) {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  return message.includes(STUDY_DATA_DELETION_FENCE_ERROR);
}
