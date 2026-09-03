import { error } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { getActiveReviewById, revealActiveReview } from '$lib/server/db/active-reviews.js';
import { learnerStudyAccessError } from '$lib/server/learning/learner-study-runtime.js';

/** @param {App.Locals} locals @param {App.Platform | undefined} platform */
function context(locals, platform) {
  const access = learnerStudyAccessError(locals.user, platform?.env);
  if (access) error(access.status, access.message);
  if (!locals.user || !platform?.env?.DB) error(503, 'Study database is not configured.');
  return { user: locals.user, db: createDb(platform.env.DB) };
}

export async function load({ locals, params, platform }) {
  const { user, db } = context(locals, platform);
  const review = await getActiveReviewById(db, user.id, params.reviewId);
  if (!review) error(404, 'Active Review not found or expired.');
  return {
    review: {
      id: review.id,
      studyMode: review.studyMode,
      contentMode: review.contentMode,
      queueClass: review.queueClass,
      vignette: review.vignetteSnapshotMd,
      revealed: Boolean(review.revealedAt),
      startedAt: review.startedAt?.getTime?.() ?? Number(review.startedAt),
      questions: review.questions.map((question) => ({
        id: question.id,
        prompt: question.promptSnapshotMd,
        answer: question.answerSnapshotMd,
        sourceType: question.sourceType
      })),
      assets: review.assets.map((asset) => ({
        id: asset.id,
        caption: asset.captionSnapshotMd,
        altText: asset.altTextSnapshot,
        imageUrl: `/study/media/${review.id}/${asset.id}`
      }))
    }
  };
}

export const actions = {
  reveal: async ({ locals, params, platform }) => {
    const { user, db } = context(locals, platform);
    const review = await revealActiveReview({ db, userId: user.id, reviewId: params.reviewId });
    if (!review) error(404, 'Active Review not found or expired.');
  }
};
