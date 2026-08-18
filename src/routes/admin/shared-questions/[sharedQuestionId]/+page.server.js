import { error, fail, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import {
  getSharedQuestion,
  listSharedQuestionPromptChoices,
  setSharedQuestionActive,
  SharedQuestionInputError,
  updateSharedQuestion
} from '$lib/server/db/shared-question-library.js';
import { listActiveTags } from '$lib/server/db/tag-library.js';

export async function load({ params, platform }) {
  if (!platform?.env?.DB) throw error(503, 'The study database is not configured.');
  const db = createDb(platform.env.DB);
  const [sharedQuestion, promptChoices, activeTags] = await Promise.all([
    getSharedQuestion(db, params.sharedQuestionId),
    listSharedQuestionPromptChoices(db),
    listActiveTags(db)
  ]);
  if (!sharedQuestion) throw error(404, 'Shared Question not found.');
  return { sharedQuestion, promptChoices, activeTags };
}

/** @param {FormData} formData @param {string} name */
function value(formData, name) {
  const item = formData.get(name);
  return typeof item === 'string' ? item.trim() : '';
}

/** @param {unknown} failure */
function actionFailure(failure) {
  return fail(failure instanceof SharedQuestionInputError ? 400 : 500, {
    error: failure instanceof SharedQuestionInputError ? failure.message : 'Unable to update Shared Question.'
  });
}

export const actions = {
  save: async ({ request, params, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await updateSharedQuestion(createDb(platform.env.DB), {
        id: params.sharedQuestionId,
        questionPromptId: value(formData, 'question_prompt_id'),
        answerMd: value(formData, 'answer_md'),
        reuseScopeTagId: value(formData, 'reuse_scope_tag_id'),
        descriptiveTagIds: formData.getAll('descriptive_tag_ids').filter((item) => typeof item === 'string')
      });
    } catch (failure) {
      return actionFailure(failure);
    }
    redirect(303, `/admin/shared-questions/${params.sharedQuestionId}?status=saved`);
  },

  setActive: async ({ request, params, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await setSharedQuestionActive(createDb(platform.env.DB), {
        id: params.sharedQuestionId,
        isActive: value(formData, 'is_active')
      });
    } catch (failure) {
      return actionFailure(failure);
    }
    redirect(303, `/admin/shared-questions/${params.sharedQuestionId}?status=updated`);
  }
};
