import { error } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { getLearnerFsrsProgress } from '$lib/server/db/fsrs-progress.js';
import { getStudyDataDeletionStatus } from '$lib/server/db/learner-study-data-deletion.ts';
import { learnerStudyAccessError } from '$lib/server/learning/learner-study-runtime.js';

/** @param {App.Locals} locals @param {App.Platform | undefined} platform */
function context(locals, platform) {
  const access = learnerStudyAccessError(locals.user, platform?.env);
  if (access) error(access.status, access.message);
  if (!locals.user || !platform?.env?.DB) error(503, 'Study database is not configured.');
  return { user: locals.user, db: createDb(platform.env.DB) };
}

export async function load({ locals, platform }) {
  const { user, db } = context(locals, platform);
  const deletion = await getStudyDataDeletionStatus(db, user.id);
  if (deletion?.inProgress) {
    return { studyDataDeletion: deletion, blockedByDeletion: true, progress: null };
  }
  return {
    studyDataDeletion: deletion,
    blockedByDeletion: false,
    progress: await getLearnerFsrsProgress({ db, userId: user.id })
  };
}
