import { error, fail } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { discardActiveReview, getActiveReview } from '$lib/server/db/active-reviews.js';
import { ensureLearnerPreferences } from '$lib/server/db/fsrs-bootstrap.js';
import {
  getStudyDataDeletionStatus,
} from '$lib/server/db/learner-study-data-deletion.ts';
import { getLearnerFsrsProgressSummary } from '$lib/server/db/fsrs-progress.js';
import { listSystemStudySelectionSystems } from '$lib/server/db/study-navigation.ts';
import {
  isStudyDataDeletionFenceError,
  STUDY_DATA_DELETION_FENCE_MESSAGE
} from '$lib/server/db/study-data-deletion-fence.js';
import {
  learnerStudyAccessError,
  learnerStudyProofSecret
} from '$lib/server/learning/learner-study-runtime.js';
import { requireStudyDataDeletionInactive } from '$lib/server/learning/learner-study-secondary-actions.js';
import { planSystemStudyRunFromForm } from '$lib/server/learning/plan-system-study.ts';

/** @param {App.Locals} locals @param {App.Platform | undefined} platform */
function context(locals, platform) {
  const access = learnerStudyAccessError(locals.user, platform?.env);
  if (access) error(access.status, access.message);
  if (!locals.user || !platform?.env?.DB) error(503, 'Study database is not configured.');
  return { user: locals.user, db: createDb(platform.env.DB), env: platform.env };
}

export async function load({ locals, platform }) {
  const { user, db } = context(locals, platform);
  const deletion = await getStudyDataDeletionStatus(db, user.id);
  const preferences = await ensureLearnerPreferences(db, user.id);
  if (deletion?.inProgress) {
    return {
      systems: [],
      preferences: {
        scheduledOrder: preferences.scheduledOrder,
        expandedLearning: Boolean(preferences.expandedLearning)
      },
      progressSummary: null,
      activeReview: null,
      studyDataDeletion: deletion
    };
  }

  const [systems, activeReview, progressSummary] = await Promise.all([
    listSystemStudySelectionSystems(db),
    getActiveReview(db, user.id),
    getLearnerFsrsProgressSummary({ db, userId: user.id })
  ]);
  return {
    systems,
    preferences: {
      scheduledOrder: preferences.scheduledOrder,
      expandedLearning: Boolean(preferences.expandedLearning)
    },
    studyDataDeletion: deletion,
    progressSummary,
    activeReview: activeReview ? {
      id: activeReview.id,
      studyMode: activeReview.studyMode,
      contentMode: activeReview.contentMode,
      queueClass: activeReview.queueClass,
      caseId: activeReview.caseId,
      revealed: Boolean(activeReview.revealedAt),
      startedAt: activeReview.startedAt?.getTime?.() ?? Number(activeReview.startedAt),
      expiresAt: activeReview.expiresAt?.getTime?.() ?? Number(activeReview.expiresAt)
    } : null
  };
}

export const actions = {
  plan: async ({ locals, platform, request }) => {
    const { user, db, env } = context(locals, platform);
    const deletion = await requireStudyDataDeletionInactive(db, user.id);
    if (deletion) return fail(deletion.status, deletion.data);
    const formData = await request.formData();
    let result;
    try {
      result = await planSystemStudyRunFromForm({
        db,
        userId: user.id,
        formData,
        proofSecret: learnerStudyProofSecret(env)
      });
    } catch (cause) {
      if (isStudyDataDeletionFenceError(cause)) {
        return fail(409, { message: STUDY_DATA_DELETION_FENCE_MESSAGE, deletionInProgress: true });
      }
      throw cause;
    }
    if (!result.ok) {
      return fail(result.status, {
        ...result.form,
        freshSystems: await listSystemStudySelectionSystems(db)
      });
    }
    return { descriptor: result.descriptor, message: 'Study run planned. Opening the first Review…' };
  },

  discard: async ({ locals, platform, request }) => {
    const { user, db } = context(locals, platform);
    const deletion = await requireStudyDataDeletionInactive(db, user.id);
    if (deletion) return fail(deletion.status, deletion.data);
    const formData = await request.formData();
    const reviewId = String(formData.get('reviewId') ?? '').trim();
    if (!reviewId) return fail(400, { message: 'Active Review id is required.' });
    await discardActiveReview({ db, userId: user.id, reviewId });
    return { discardedReviewId: reviewId, message: 'Active Review discarded. Browser run state was not reset.' };
  }
};
