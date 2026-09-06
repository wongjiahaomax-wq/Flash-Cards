import { error, fail } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { getStudyDataDeletionStatus } from '$lib/server/db/learner-study-data-deletion.ts';
import {
  freshLearnerFsrsStart,
  resetLearnerFsrsProgress
} from '$lib/server/db/fsrs-reset-fresh.js';
import {
  isStudyDataDeletionFenceError,
  STUDY_DATA_DELETION_FENCE_MESSAGE
} from '$lib/server/db/study-data-deletion-fence.js';
import { learnerStudyAccessError } from '$lib/server/learning/learner-study-runtime.js';
import {
  advanceDeletionForSelf,
  deletionFailure,
  deletionResult,
  requireStudyDataDeletionInactive,
  STUDY_DATA_DELETION_CONFIRMATION
} from '$lib/server/learning/learner-study-secondary-actions.js';

/** @param {App.Locals} locals @param {App.Platform | undefined} platform */
function context(locals, platform) {
  const access = learnerStudyAccessError(locals.user, platform?.env);
  if (access) error(access.status, access.message);
  if (!locals.user || !platform?.env?.DB) error(503, 'Study database is not configured.');
  return { user: locals.user, db: createDb(platform.env.DB) };
}

export async function load({ locals, platform }) {
  const { user, db } = context(locals, platform);
  return { studyDataDeletion: await getStudyDataDeletionStatus(db, user.id) };
}

export const actions = {
  resetProgress: async ({ locals, platform, request }) => {
    const { user, db } = context(locals, platform);
    const deletion = await requireStudyDataDeletionInactive(db, user.id);
    if (deletion) return fail(deletion.status, deletion.data);
    const formData = await request.formData();
    if (formData.get('confirmation') !== 'reset-progress') {
      return fail(400, { message: 'Reset Progress confirmation is required.' });
    }
    try {
      const result = await resetLearnerFsrsProgress({ db, userId: user.id });
      return {
        browserRunInvalidated: true,
        boundaryAction: result.operation,
        message: result.initialized
          ? 'Progress reset. Every Case is New again; past activity and encounter records were preserved.'
          : 'There was no scheduling progress to reset. Any active Review and saved Study session were cleared.'
      };
    } catch (cause) {
      if (isStudyDataDeletionFenceError(cause)) {
        return fail(409, { message: STUDY_DATA_DELETION_FENCE_MESSAGE, deletionInProgress: true });
      }
      throw cause;
    }
  },

  freshFsrsStart: async ({ locals, platform, request }) => {
    const { user, db } = context(locals, platform);
    const deletion = await requireStudyDataDeletionInactive(db, user.id);
    if (deletion) return fail(deletion.status, deletion.data);
    const formData = await request.formData();
    if (formData.get('confirmation') !== 'fresh-fsrs-start') {
      return fail(400, { message: 'Fresh scheduling start confirmation is required.' });
    }
    try {
      await freshLearnerFsrsStart({ db, userId: user.id });
      return {
        browserRunInvalidated: true,
        boundaryAction: 'fresh-fsrs-start',
        message: 'Fresh scheduling start complete. Scheduling and personalized learning settings were reset; past activity and encounter records were preserved.'
      };
    } catch (cause) {
      if (isStudyDataDeletionFenceError(cause)) {
        return fail(409, { message: STUDY_DATA_DELETION_FENCE_MESSAGE, deletionInProgress: true });
      }
      throw cause;
    }
  },

  deleteStudyData: async ({ locals, platform, request }) => {
    const { user, db } = context(locals, platform);
    const formData = await request.formData();
    if (formData.get('confirmation') !== STUDY_DATA_DELETION_CONFIRMATION) {
      return fail(400, { message: `Type ${STUDY_DATA_DELETION_CONFIRMATION} exactly to confirm study data deletion.` });
    }
    try {
      return deletionResult(await advanceDeletionForSelf(db, user.id, true));
    } catch (cause) {
      const failure = deletionFailure(cause);
      return fail(failure.status, failure.data);
    }
  },

  continueStudyDataDeletion: async ({ locals, platform }) => {
    const { user, db } = context(locals, platform);
    const current = await getStudyDataDeletionStatus(db, user.id);
    if (!current?.inProgress) {
      return current
        ? deletionResult({ status: current })
        : fail(409, { message: 'There is no study data deletion to continue.' });
    }
    try {
      return deletionResult(await advanceDeletionForSelf(db, user.id, false));
    } catch (cause) {
      const failure = deletionFailure(cause);
      return fail(failure.status, failure.data);
    }
  }
};
