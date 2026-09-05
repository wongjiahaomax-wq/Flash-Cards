import { error, fail } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import {
  advanceStudyDataDeletion,
  beginStudyDataDeletion,
  getStudyDataDeletionStatus,
  isStudyDataDeletionActive,
  StudyDataDeletionError
} from '$lib/server/db/learner-study-data-deletion.ts';
import { isPreviewWorker, isProductionAdmin } from '$lib/server/preview-auth.js';

const STUDY_DATA_DELETION_CONFIRMATION = 'DELETE MY STUDY DATA';
const MAX_DELETION_STEPS_PER_REQUEST = 4;
const STUDY_DATA_DELETION_IN_PROGRESS_MESSAGE =
  'Study data deletion is in progress. Continue deletion to finish it before studying again.';

/** @param {App.Locals} locals @param {App.Platform | undefined} platform */
function requireAdminContext(locals, platform) {
  if (isPreviewWorker(platform?.env)) {
    error(403, 'Administrator study data is unavailable on the Preview Worker.');
  }
  if (!locals.user) {
    error(403, 'Production Admin access is required.');
  }
  if (!isProductionAdmin(locals.user)) {
    error(403, 'Production Admin access is required.');
  }
  if (!platform?.env?.DB) {
    error(503, 'Administrator study data requires the application database.');
  }
  return { user: locals.user, db: createDb(platform.env.DB) };
}

/** @param {import('$lib/server/db/index.js').LearningDb} db @param {string} userId @param {boolean} begin */
async function advanceDeletionForSelf(db, userId, begin) {
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

/** @param {unknown} cause */
function deletionFailure(cause) {
  if (cause instanceof StudyDataDeletionError) {
    return fail(cause.code === 'user-not-found' ? 404 : 400, { message: cause.message });
  }
  console.error('Administrator self-service study data deletion failed; the durable fence remains safe to retry.', cause);
  return fail(500, {
    message: 'Study data deletion could not be advanced. Your study remains safely blocked; try again.'
  });
}

/** @param {{status:Awaited<ReturnType<typeof getStudyDataDeletionStatus>>}} input */
function deletionResult({ status }) {
  if (!status) throw new Error('Study data deletion completed without a durable status marker.');
  if (status.inProgress) {
    return {
      deletionInProgress: true,
      deletion: status,
      message: STUDY_DATA_DELETION_IN_PROGRESS_MESSAGE
    };
  }
  return {
    studyDataDeleted: true,
    deletion: status,
    message: 'Study data deleted. Your administrator account and role remain active. Your next study session starts from fresh study state.'
  };
}

export async function load({ locals, platform }) {
  const { user, db } = requireAdminContext(locals, platform);
  return {
    deletion: await getStudyDataDeletionStatus(db, user.id)
  };
}

export const actions = {
  deleteStudyData: async ({ locals, platform, request }) => {
    const { user, db } = requireAdminContext(locals, platform);
    const formData = await request.formData();
    if (formData.get('confirmation') !== STUDY_DATA_DELETION_CONFIRMATION) {
      return fail(400, { message: `Type ${STUDY_DATA_DELETION_CONFIRMATION} exactly to confirm study data deletion.` });
    }
    try {
      return deletionResult(await advanceDeletionForSelf(db, user.id, true));
    } catch (cause) {
      return deletionFailure(cause);
    }
  },

  continueStudyDataDeletion: async ({ locals, platform }) => {
    const { user, db } = requireAdminContext(locals, platform);
    if (!await isStudyDataDeletionActive(db, user.id)) {
      const status = await getStudyDataDeletionStatus(db, user.id);
      return status ? deletionResult({ status }) : fail(409, { message: 'There is no study data deletion to continue.' });
    }
    try {
      return deletionResult(await advanceDeletionForSelf(db, user.id, false));
    } catch (cause) {
      return deletionFailure(cause);
    }
  }
};
