import {
  advanceStudyDataDeletion,
  beginStudyDataDeletion,
  getStudyDataDeletionStatus,
  isStudyDataDeletionActive,
  StudyDataDeletionError
} from '../db/learner-study-data-deletion.ts';

export const STUDY_DATA_DELETION_CONFIRMATION = 'DELETE MY STUDY DATA';
export const MAX_DELETION_STEPS_PER_REQUEST = 4;
export const STUDY_DATA_DELETION_IN_PROGRESS_MESSAGE =
  'Study data deletion is in progress. Continue deletion to finish it before studying again.';

/** @param {import('../db/index.js').LearningDb} db @param {string} userId */
export async function requireStudyDataDeletionInactive(db, userId) {
  if (await isStudyDataDeletionActive(db, userId)) {
    return {
      status: 409,
      data: { message: STUDY_DATA_DELETION_IN_PROGRESS_MESSAGE, deletionInProgress: true }
    };
  }
  return null;
}

/** @param {import('../db/index.js').LearningDb} db @param {string} userId @param {boolean} begin */
export async function advanceDeletionForSelf(db, userId, begin) {
  if (begin) await beginStudyDataDeletion({ db, userId });
  let result = null;
  for (let step = 0; step < MAX_DELETION_STEPS_PER_REQUEST; step += 1) {
    result = await advanceStudyDataDeletion({ db, userId });
    if (result.complete) break;
  }
  const status = await getStudyDataDeletionStatus(db, userId);
  if (!status) throw new Error('Study data deletion completed without a durable status marker.');
  return { status, result };
}

/** @param {{status:Awaited<ReturnType<typeof getStudyDataDeletionStatus>>}} input */
export function deletionResult({ status }) {
  if (!status) throw new Error('Study data deletion completed without a durable status marker.');
  if (status.inProgress) {
    return {
      browserRunInvalidated: true,
      deletionInProgress: true,
      deletion: status,
      message: STUDY_DATA_DELETION_IN_PROGRESS_MESSAGE
    };
  }
  return {
    browserRunInvalidated: true,
    studyDataDeleted: true,
    deletion: status,
    message: 'Study data deleted. Your account remains active. Your next Study run starts from fresh study state.'
  };
}

/** @param {unknown} cause */
export function deletionFailure(cause) {
  if (cause instanceof StudyDataDeletionError) {
    const status = cause.code === 'user-not-found'
      ? 404
      : cause.code === 'account-deletion-in-progress' ? 409 : 400;
    return { status, data: { message: cause.message } };
  }
  console.error('Self-service study data deletion failed; the durable fence remains safe to retry.', cause);
  return {
    status: 500,
    data: {
      message: 'Study data deletion could not be advanced. Your study remains safely blocked; try again.'
    }
  };
}
