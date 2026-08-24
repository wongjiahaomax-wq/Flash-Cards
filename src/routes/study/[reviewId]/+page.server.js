import { error, fail, redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import {
  completeReview,
  continueReviewWithExpandedLearning,
  getReview,
  revealReview,
  startReview,
  startSystemReview
} from '$lib/server/db/learning.js';
import { listOwnedReviewMedia } from '$lib/server/db/review-media.js';
import {
  QUESTION_POOL_MODE_DETAILS,
  QuestionPoolUnavailableError,
  isQuestionPoolMode
} from '$lib/server/learning/question-pool-mode';
import { StudyNavigationInputError } from '$lib/server/db/study-navigation.ts';
import { isPreviewOnlyAdmin, isPreviewWorker } from '$lib/server/preview-auth.js';
import { getReviewImageUrl } from '$lib/server/storage/media.js';

/** @param {App.Locals['user']} user @param {App.Platform | undefined} platform */
function assertLearnerStudyAccess(user, platform) {
  if (isPreviewWorker(platform?.env) || isPreviewOnlyAdmin(user)) {
    throw error(403, 'Learner Study is unavailable for Preview-only Admin.');
  }
  const database = platform?.env?.DB;
  if (!database || !user) throw error(503, 'Study database is not configured.');
  return { database, user };
}

export async function load({ locals, params, platform }) {
  const context = assertLearnerStudyAccess(locals.user, platform);
  const db = createDb(context.database);
  const review = await getReview(db, params.reviewId, context.user.id);
  if (!review) throw error(404, 'Review not found.');
  if (!isQuestionPoolMode(review.questionPoolMode)) throw error(500, 'Review question set is invalid.');

  const reviewMedia = await listOwnedReviewMedia(db, review.id, context.user.id);
  const reviewAssetIdByAssetId = new Map(reviewMedia.map((row) => [row.assetId, row.reviewAssetId]));
  const questionSet = QUESTION_POOL_MODE_DETAILS[review.questionPoolMode];

  return {
    caseStudy: {
      id: review.id,
      // The database title is an internal/admin label and is deliberately not
      // rendered here because it may disclose the diagnosis before reveal.
      title: 'Case review',
      concept: review.routeLabel,
      systemName: review.systemName,
      routeType: review.routeType,
      studyTagId: review.studyTagId,
      studyConceptId: review.studyConceptId,
      primaryConceptId: review.primaryConceptId,
      vignette: review.vignette,
      status: review.status,
      rating: review.rating,
      revealed: review.revealed,
      questionPoolMode: review.questionPoolMode,
      questionSet,
      assets: review.assets.map((asset) => {
        const reviewAssetId = reviewAssetIdByAssetId.get(asset.assetId);
        if (!reviewAssetId) throw error(500, 'Review media snapshot is incomplete.');
        return {
          ...asset,
          imageUrl: getReviewImageUrl(review.id, reviewAssetId)
        };
      }),
      questions: review.questions.map((question) => ({
        prompt: question.prompt,
        answer: question.answer,
        scope:
          question.sourceType === 'case'
            ? 'Case-specific answer'
            : question.sourceType === 'stimulus_option'
              ? 'Selected stimulus option answer'
              : question.sourceType === 'asset'
                ? 'Reusable image answer'
                : question.sourceType === 'stimulus_group'
                  ? 'Stimulus group answer'
                  : question.sourceType === 'tag_shared'
                    ? 'Shared Tag-scoped answer'
                    : question.sourceType === 'ancestor_concept'
                      ? 'Inherited topic question'
                      : 'Topic question'
      }))
    }
  };
}

export const actions = {
  reveal: async ({ locals, params, platform }) => {
    const context = assertLearnerStudyAccess(locals.user, platform);
    await revealReview(createDb(context.database), params.reviewId, context.user.id);
  },
  rate: async ({ locals, params, platform, request }) => {
    const context = assertLearnerStudyAccess(locals.user, platform);
    const formData = await request.formData();
    const rating = formData.get('rating');
    if (rating !== 'again' && rating !== 'good') throw error(400, 'Invalid review rating.');
    await completeReview(createDb(context.database), params.reviewId, context.user.id, rating);
  },
  continueExpanded: async ({ locals, params, platform }) => {
    const context = assertLearnerStudyAccess(locals.user, platform);
    const db = createDb(context.database);
    const review = await getReview(db, params.reviewId, context.user.id);
    if (!review) throw error(404, 'Review not found.');
    if (review.status !== 'completed') throw error(400, 'Complete this review before continuing with Expanded Learning.');
    if (review.questionPoolMode !== 'core') throw error(400, 'Expanded Learning continuation is only available after Original questions.');

    let reviewId;
    try {
      reviewId = await continueReviewWithExpandedLearning({ db, userId: context.user.id, reviewId: review.id });
    } catch (cause) {
      if (cause instanceof QuestionPoolUnavailableError) return fail(400, { message: cause.message });
      throw cause;
    }
    if (!reviewId) throw error(404, 'This case is no longer available for study.');
    redirect(303, `/study/${reviewId}`);
  },
  next: async ({ locals, params, platform, request }) => {
    const context = assertLearnerStudyAccess(locals.user, platform);
    const db = createDb(context.database);
    const review = await getReview(db, params.reviewId, context.user.id);
    if (!review) throw error(404, 'Review not found.');
    if (review.status !== 'completed') throw error(400, 'Complete this review before starting another case.');

    const formData = await request.formData();
    const questionPoolMode = formData.get('questionPoolMode');
    if (!isQuestionPoolMode(questionPoolMode)) {
      return fail(400, { message: 'Choose Original questions or Expanded Learning for the next review.' });
    }

    let reviewId;
    try {
      if (review.studySystemConceptId) {
        reviewId = await startSystemReview({
          db,
          userId: context.user.id,
          systemId: review.studySystemConceptId,
          routeType: review.routeType,
          routeId: review.routeType === 'tag' ? review.studyTagId : review.studyConceptId,
          questionPoolMode
        });
      } else {
        reviewId = await startReview({
          db,
          userId: context.user.id,
          conceptId: review.primaryConceptId,
          questionPoolMode
        });
      }
    } catch (cause) {
      if (cause instanceof QuestionPoolUnavailableError || cause instanceof StudyNavigationInputError) return fail(400, { message: cause.message });
      throw cause;
    }
    if (!reviewId) throw error(404, 'No active study cases are available for this route.');
    redirect(303, `/study/${reviewId}`);
  }
};
