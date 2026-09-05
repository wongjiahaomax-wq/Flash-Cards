import { error, fail } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { discardActiveReview, getActiveReview } from '$lib/server/db/active-reviews.js';
import { ensureLearnerPreferences } from '$lib/server/db/fsrs-bootstrap.js';
import { getLearnerFsrsProgress } from '$lib/server/db/fsrs-progress.js';
import {
  freshLearnerFsrsStart,
  resetLearnerFsrsProgress
} from '$lib/server/db/fsrs-reset-fresh.js';
import {
  advanceStudyDataDeletion,
  beginStudyDataDeletion,
  getStudyDataDeletionStatus,
  isStudyDataDeletionActive,
  StudyDataDeletionError
} from '$lib/server/db/learner-study-data-deletion.ts';
import { setExpandedLearningPreference } from '$lib/server/db/learner-preferences.js';
import { listSystemStudySelectionSystems } from '$lib/server/db/study-navigation.ts';
import {
  learnerStudyAccessError,
  learnerStudyProofSecret
} from '$lib/server/learning/learner-study-runtime.js';
import { planSystemStudyRunFromForm } from '$lib/server/learning/plan-system-study.ts';

const STUDY_DATA_DELETION_CONFIRMATION = 'DELETE MY STUDY DATA';
const MAX_DELETION_STEPS_PER_REQUEST = 4;
const STUDY_DATA_DELETION_IN_PROGRESS_MESSAGE =
  'Study data deletion is in progress. Continue deletion to finish it before studying again.';

/** @param {App.Locals} locals @param {App.Platform | undefined} platform */
function context(locals, platform) {
  const access = learnerStudyAccessError(locals.user, platform?.env);
  if (access) error(access.status, access.message);
  if (!locals.user || !platform?.env?.DB) error(503, 'Study database is not configured.');
  return { user: locals.user, db: createDb(platform.env.DB), env: platform.env };
}

/** @param {import('$lib/server/db/index.js').LearningDb} db @param {string} userId */
async function requireStudyDataDeletionInactive(db, userId) {
  if (await isStudyDataDeletionActive(db, userId)) {
    return fail(409, { message: STUDY_DATA_DELETION_IN_PROGRESS_MESSAGE, deletionInProgress: true });
  }
  return null;
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
  console.error('Self-service study data deletion failed; the durable fence remains safe to retry.', cause);
  return fail(500, {
    message: 'Study data deletion could not be advanced. Your study remains safely blocked; try again.'
  });
}

/** @param {{status:Awaited<ReturnType<typeof getStudyDataDeletionStatus>>}} input */
function deletionResult({ status }) {
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
      progress: null,
      activeReview: null,
      studyDataDeletion: deletion
    };
  }

  const [systems, activeReview, progress] = await Promise.all([
    listSystemStudySelectionSystems(db),
    getActiveReview(db, user.id),
    getLearnerFsrsProgress({ db, userId: user.id })
  ]);
  return {
    systems,
    preferences: {
      scheduledOrder: preferences.scheduledOrder,
      expandedLearning: Boolean(preferences.expandedLearning)
    },
    studyDataDeletion: deletion,
    progress,
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
    if (deletion) return deletion;
    const formData = await request.formData();
    const result = await planSystemStudyRunFromForm({
      db,
      userId: user.id,
      formData,
      proofSecret: learnerStudyProofSecret(env)
    });
    if (!result.ok) return fail(result.status, result.form);
    return { descriptor: result.descriptor, message: 'Study run planned. Opening the first Review…' };
  },

  preference: async ({ locals, platform, request }) => {
    const { user, db } = context(locals, platform);
    const formData = await request.formData();
    const expandedLearning = formData.get('expandedLearning') === 'on';
    await setExpandedLearningPreference({ db, userId: user.id, expandedLearning });
    return {
      preferenceSaved: true,
      message: expandedLearning ? 'Expanded Learning enabled.' : 'Expanded Learning disabled.'
    };
  },

  discard: async ({ locals, platform, request }) => {
    const { user, db } = context(locals, platform);
    const deletion = await requireStudyDataDeletionInactive(db, user.id);
    if (deletion) return deletion;
    const formData = await request.formData();
    const reviewId = String(formData.get('reviewId') ?? '').trim();
    if (!reviewId) return fail(400, { message: 'Active Review id is required.' });
    await discardActiveReview({ db, userId: user.id, reviewId });
    return { discardedReviewId: reviewId, message: 'Active Review discarded. Browser run state was not reset.' };
  },

  resetProgress: async ({ locals, platform, request }) => {
    const { user, db } = context(locals, platform);
    const deletion = await requireStudyDataDeletionInactive(db, user.id);
    if (deletion) return deletion;
    const formData = await request.formData();
    if (formData.get('confirmation') !== 'reset-progress') {
      return fail(400, { message: 'Reset Progress confirmation is required.' });
    }
    const result = await resetLearnerFsrsProgress({ db, userId: user.id });
    return {
      browserRunInvalidated: true,
      boundaryAction: result.operation,
      message: result.initialized
        ? 'Progress reset. Every Case is New to scheduling again; retained history and encounter records were preserved.'
        : 'There was no initialized FSRS progress to reset. Any active Review and browser run were cleared.'
    };
  },

  freshFsrsStart: async ({ locals, platform, request }) => {
    const { user, db } = context(locals, platform);
    const deletion = await requireStudyDataDeletionInactive(db, user.id);
    if (deletion) return deletion;
    const formData = await request.formData();
    if (formData.get('confirmation') !== 'fresh-fsrs-start') {
      return fail(400, { message: 'Fresh FSRS Start confirmation is required.' });
    }
    await freshLearnerFsrsStart({ db, userId: user.id });
    return {
      browserRunInvalidated: true,
      boundaryAction: 'fresh-fsrs-start',
      message: 'Fresh FSRS Start complete. Scheduling state and personalized parameters were reset; retained history and encounter records were preserved.'
    };
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
      return deletionFailure(cause);
    }
  },

  continueStudyDataDeletion: async ({ locals, platform }) => {
    const { user, db } = context(locals, platform);
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
