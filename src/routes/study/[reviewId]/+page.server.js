import { error, fail } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { getActiveReviewById, revealActiveReview } from '$lib/server/db/active-reviews.js';
import { createLearnerFeedback, LearnerFeedbackInputError } from '$lib/server/db/learner-feedback.ts';
import { isStudyDataDeletionActive } from '$lib/server/db/learner-study-data-deletion.ts';
import {
  isStudyDataDeletionFenceError,
  STUDY_DATA_DELETION_FENCE_MESSAGE
} from '$lib/server/db/study-data-deletion-fence.js';
import { learnerStudyAccessError } from '$lib/server/learning/learner-study-runtime.js';

const STUDY_DATA_DELETION_IN_PROGRESS_MESSAGE =
  'Study data deletion is in progress. Continue it from the Study page before studying again.';

/** @param {App.Locals} locals @param {App.Platform | undefined} platform */
function context(locals, platform) {
  const access = learnerStudyAccessError(locals.user, platform?.env);
  if (access) error(access.status, access.message);
  if (!locals.user || !platform?.env?.DB) error(503, 'Study database is not configured.');
  const db = createDb(platform.env.DB);
  return { user: locals.user, db };
}

/** @param {import('$lib/server/db/index.js').LearningDb} db @param {string} userId */
async function requireStudyDataDeletionInactive(db, userId) {
  if (await isStudyDataDeletionActive(db, userId)) {
    error(409, STUDY_DATA_DELETION_IN_PROGRESS_MESSAGE);
  }
}

export async function load({ locals, params, platform }) {
  const { user, db } = context(locals, platform);
  await requireStudyDataDeletionInactive(db, user.id);
  const review = await getActiveReviewById(db, user.id, params.reviewId);
  if (!review) error(404, 'Active Review not found or expired.');
  const revealed = Boolean(review.revealedAt);
  return {
    review: {
      id: review.id,
      studyMode: review.studyMode,
      contentMode: review.contentMode,
      queueClass: review.queueClass,
      vignette: review.vignetteSnapshotMd,
      revealed,
      ...(revealed ? { caseTitle: review.caseTitleSnapshot } : {}),
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
    await requireStudyDataDeletionInactive(db, user.id);
    let review;
    try {
      review = await revealActiveReview({ db, userId: user.id, reviewId: params.reviewId });
    } catch (cause) {
      if (isStudyDataDeletionFenceError(cause)) {
        error(409, STUDY_DATA_DELETION_FENCE_MESSAGE);
      }
      throw cause;
    }
    if (!review) error(404, 'Active Review not found or expired.');
  },
  submitFeedback: async ({ request, locals, params, platform }) => {
    const { user, db } = context(locals, platform);
    await requireStudyDataDeletionInactive(db, user.id);
    const formData = await request.formData();
    try {
      const feedback = await createLearnerFeedback({
        db,
        userId: user.id,
        reviewId: params.reviewId,
        body: formData.get('feedback_body')
      });
      if (!feedback) {
        return fail(409, { error: 'This Review is no longer available for feedback. Return to Study and open a current Review.' });
      }
      return { ok: true, feedbackId: feedback.id };
    } catch (cause) {
      if (cause instanceof LearnerFeedbackInputError) return fail(400, { error: cause.message });
      if (String(cause).includes('LEARNER_FEEDBACK_ACCOUNT_DELETION')) {
        return fail(409, { error: STUDY_DATA_DELETION_IN_PROGRESS_MESSAGE });
      }
      console.error('Learner feedback submission failed.', cause);
      return fail(500, { error: 'Unable to submit feedback right now. Please try again.' });
    }
  }
};
