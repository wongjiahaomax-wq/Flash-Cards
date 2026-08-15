import { error, redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { completeReview, getReview, revealReview, startReview } from '$lib/server/db/learning.js';

/** @param {string} assetId */
function imageUrl(assetId) {
  return `/api/assets/${encodeURIComponent(assetId)}/image`;
}

export async function load({ locals, params, platform }) {
  if (!platform?.env?.DB || !locals.user) throw error(503, 'Study database is not configured.');
  const review = await getReview(createDb(platform.env.DB), params.reviewId, locals.user.id);
  if (!review) throw error(404, 'Review not found.');

  return {
    caseStudy: {
      id: review.id,
      // The database title is an internal/admin label and is deliberately not
      // rendered here because it may disclose the diagnosis before reveal.
      title: 'Case review',
      concept: review.conceptName,
      primaryConceptId: review.primaryConceptId,
      vignette: review.vignette,
      status: review.status,
      rating: review.rating,
      revealed: review.revealed,
      assets: review.assets.map((asset) => ({
        ...asset,
        imageUrl: imageUrl(asset.assetId)
      })),
      questions: review.questions.map((question) => ({
        prompt: question.prompt,
        answer: question.answer,
        scope:
          question.sourceType === 'case'
            ? 'Case-specific answer'
            : question.sourceType === 'ancestor_concept'
              ? 'Inherited topic question'
              : 'Topic question'
      }))
    }
  };
}

export const actions = {
  reveal: async ({ locals, params, platform }) => {
    if (!platform?.env?.DB || !locals.user) throw error(503, 'Study database is not configured.');
    await revealReview(createDb(platform.env.DB), params.reviewId, locals.user.id);
  },
  rate: async ({ locals, params, platform, request }) => {
    if (!platform?.env?.DB || !locals.user) throw error(503, 'Study database is not configured.');
    const formData = await request.formData();
    const rating = formData.get('rating');
    if (rating !== 'again' && rating !== 'good') throw error(400, 'Invalid review rating.');
    await completeReview(createDb(platform.env.DB), params.reviewId, locals.user.id, rating);
  },
  next: async ({ locals, params, platform }) => {
    if (!platform?.env?.DB || !locals.user) throw error(503, 'Study database is not configured.');
    const db = createDb(platform.env.DB);
    const review = await getReview(db, params.reviewId, locals.user.id);
    if (!review) throw error(404, 'Review not found.');
    if (review.status !== 'completed') throw error(400, 'Complete this review before starting another case.');
    const reviewId = await startReview({ db, userId: locals.user.id, conceptId: review.primaryConceptId });
    if (!reviewId) throw error(404, 'No active study cases are available for this topic.');
    redirect(303, `/study/${reviewId}`);
  }
};
