import { fail, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import {
  createSharedQuestion,
  listSharedQuestionPromptChoices,
  listSharedQuestions,
  setSharedQuestionActive,
  SharedQuestionInputError
} from '$lib/server/db/shared-question-library.js';
import { listActiveTags } from '$lib/server/db/tag-library.js';

export async function load({ platform }) {
  if (!platform?.env?.DB) return { sharedQuestions: [], promptChoices: [], activeTags: [] };
  const db = createDb(platform.env.DB);
  const [sharedQuestions, promptChoices, activeTags] = await Promise.all([
    listSharedQuestions(db),
    listSharedQuestionPromptChoices(db),
    listActiveTags(db)
  ]);
  return { sharedQuestions, promptChoices, activeTags };
}

/** @param {FormData} formData @param {string} name */
function value(formData, name) {
  const item = formData.get(name);
  return typeof item === 'string' ? item.trim() : '';
}

/** @param {FormData} formData */
function descriptiveTagIds(formData) {
  return formData.getAll('descriptive_tag_ids').filter((item) => typeof item === 'string');
}

/** @param {unknown} error */
function actionFailure(error) {
  return fail(error instanceof SharedQuestionInputError ? 400 : 500, {
    error: error instanceof SharedQuestionInputError ? error.message : 'Unable to update Shared Questions.'
  });
}

export const actions = {
  create: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    let id;
    try {
      id = await createSharedQuestion(createDb(platform.env.DB), {
        questionPromptId: value(formData, 'question_prompt_id'),
        promptMd: value(formData, 'prompt_md'),
        answerMd: value(formData, 'answer_md'),
        reuseScopeTagId: value(formData, 'reuse_scope_tag_id'),
        descriptiveTagIds: descriptiveTagIds(formData)
      });
    } catch (error) {
      return actionFailure(error);
    }
    redirect(303, `/admin/shared-questions/${id}?status=created`);
  },

  setActive: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await setSharedQuestionActive(createDb(platform.env.DB), {
        id: value(formData, 'shared_question_id'),
        isActive: value(formData, 'is_active')
      });
    } catch (error) {
      return actionFailure(error);
    }
    redirect(303, '/admin/shared-questions?status=updated');
  }
};
