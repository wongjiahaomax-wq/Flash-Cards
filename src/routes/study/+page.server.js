import { error, fail } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { discardActiveReview, getActiveReview } from '$lib/server/db/active-reviews.js';
import { ensureLearnerPreferences } from '$lib/server/db/fsrs-bootstrap.js';
import { getLearnerFsrsProgress } from '$lib/server/db/fsrs-progress.js';
import {
  freshLearnerFsrsStart,
  resetLearnerFsrsProgress
} from '$lib/server/db/fsrs-reset-fresh.js';
import { setExpandedLearningPreference } from '$lib/server/db/learner-preferences.js';
import { listSystemStudySelectionSystems } from '$lib/server/db/study-navigation.ts';
import {
  learnerStudyAccessError,
  learnerStudyProofSecret
} from '$lib/server/learning/learner-study-runtime.js';
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
  const [systems, preferences, activeReview, progress] = await Promise.all([
    listSystemStudySelectionSystems(db),
    ensureLearnerPreferences(db, user.id),
    getActiveReview(db, user.id),
    getLearnerFsrsProgress({ db, userId: user.id })
  ]);
  return {
    systems,
    preferences: {
      scheduledOrder: preferences.scheduledOrder,
      expandedLearning: Boolean(preferences.expandedLearning)
    },
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
    const formData = await request.formData();
    const reviewId = String(formData.get('reviewId') ?? '').trim();
    if (!reviewId) return fail(400, { message: 'Active Review id is required.' });
    await discardActiveReview({ db, userId: user.id, reviewId });
    return { discardedReviewId: reviewId, message: 'Active Review discarded. Browser run state was not reset.' };
  },

  resetProgress: async ({ locals, platform, request }) => {
    const { user, db } = context(locals, platform);
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
  }
};
