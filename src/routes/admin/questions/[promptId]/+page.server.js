import { fail, redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import {
  getQuestionPromptDetail,
  QuestionPromptInputError,
  updateQuestionPrompt
} from '$lib/server/db/question-library.js';

export async function load({ platform, params }) {
  if (!platform?.env?.DB) return { prompt: null };
  return { prompt: await getQuestionPromptDetail(createDb(platform.env.DB), params.promptId) };
}

export const actions = {
  updatePrompt: async ({ request, platform, params }) => {
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await updateQuestionPrompt(createDb(platform.env.DB), {
        promptId: params.promptId,
        promptMd: formData.get('prompt_md'),
        confirmSharedEdit: formData.get('confirm_shared_edit'),
        expectedUsageCount: formData.get('expected_usage_count')
      });
    } catch (error) {
      return fail(error instanceof QuestionPromptInputError ? 400 : 500, {
        error: error instanceof Error ? error.message : 'Unable to update the Question Prompt.'
      });
    }
    redirect(303, '/admin/questions/' + encodeURIComponent(params.promptId) + '?status=saved');
  }
};
