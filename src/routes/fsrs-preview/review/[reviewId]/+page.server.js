import { error } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { getActiveReviewById, revealActiveReview } from '$lib/server/db/active-reviews.js';
import { isLocalFsrsPreviewRequest } from '$lib/server/learning/local-fsrs-preview.js';

function context(locals, platform, url) {
  if (!isLocalFsrsPreviewRequest(url, platform?.env)) error(404, 'Local FSRS preview is unavailable.');
  if (!locals.user || !platform?.env?.DB) error(503, 'Local FSRS preview is not configured.');
  return { user: locals.user, db: createDb(platform.env.DB) };
}

export async function load({ locals, params, platform, url }) {
  const { user, db } = context(locals, platform, url);
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
        imageUrl: `/fsrs-preview/media/${review.id}/${asset.id}`
      }))
    }
  };
}

export const actions = {
  reveal: async ({ locals, params, platform, url }) => {
    const { user, db } = context(locals, platform, url);
    const review = await revealActiveReview({ db, userId: user.id, reviewId: params.reviewId });
    if (!review) error(404, 'Active Review not found or expired.');
  }
};
