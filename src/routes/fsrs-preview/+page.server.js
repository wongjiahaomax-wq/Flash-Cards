import { error, fail } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { discardActiveReview, getActiveReview } from '$lib/server/db/active-reviews.js';
import { ensureLearnerPreferences } from '$lib/server/db/fsrs-bootstrap.js';
import { setExpandedLearningPreference } from '$lib/server/db/learner-preferences.js';
import { listSystemStudySelectionSystems } from '$lib/server/db/study-navigation.ts';
import {
  LOCAL_FSRS_PREVIEW_PROOF_SECRET,
  isLocalFsrsPreviewRequest
} from '$lib/server/learning/local-fsrs-preview.js';
import { planSystemStudyRunFromForm } from '$lib/server/learning/plan-system-study.ts';

/** @param {App.Locals} locals @param {App.Platform | undefined} platform @param {URL} url */
function context(locals, platform, url) {
  if (!isLocalFsrsPreviewRequest(url, platform?.env)) error(404, 'Local FSRS preview is unavailable.');
  if (!locals.user || !platform?.env?.DB) error(503, 'Local FSRS preview is not configured.');
  return { user: locals.user, db: createDb(platform.env.DB) };
}

export async function load({ locals, platform, url }) {
  const { user, db } = context(locals, platform, url);
  const [systems, preferences, activeReview] = await Promise.all([
    listSystemStudySelectionSystems(db),
    ensureLearnerPreferences(db, user.id),
    getActiveReview(db, user.id)
  ]);
  return {
    systems,
    preferences: {
      scheduledOrder: preferences.scheduledOrder,
      expandedLearning: Boolean(preferences.expandedLearning)
    },
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
  plan: async ({ locals, platform, request, url }) => {
    const { user, db } = context(locals, platform, url);
    const formData = await request.formData();
    const result = await planSystemStudyRunFromForm({
      db,
      userId: user.id,
      formData,
      proofSecret: LOCAL_FSRS_PREVIEW_PROOF_SECRET
    });
    if (!result.ok) return fail(result.status, result.form);
    return { descriptor: result.descriptor, message: 'Preview run planned. Opening the first Review…' };
  },

  preference: async ({ locals, platform, request, url }) => {
    const { user, db } = context(locals, platform, url);
    const formData = await request.formData();
    const expandedLearning = formData.get('expandedLearning') === 'on';
    await setExpandedLearningPreference({ db, userId: user.id, expandedLearning });
    return {
      preferenceSaved: true,
      message: expandedLearning ? 'Expanded Learning enabled.' : 'Expanded Learning disabled.'
    };
  },

  discard: async ({ locals, platform, request, url }) => {
    const { user, db } = context(locals, platform, url);
    const formData = await request.formData();
    const reviewId = String(formData.get('reviewId') ?? '').trim();
    if (!reviewId) return fail(400, { message: 'Active Review id is required.' });
    await discardActiveReview({ db, userId: user.id, reviewId });
    return { discardedReviewId: reviewId, message: 'Active Review discarded. Browser run state was not reset.' };
  }
};
