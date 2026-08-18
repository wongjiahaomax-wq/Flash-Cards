import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';

import { createDb } from '$lib/server/db/index.js';
import { QuestionPromptInputError } from '$lib/server/db/question-library.js';
import {
  getQuestionPromptDetailWithShared,
  updateQuestionPromptWithSharedGuard
} from '$lib/server/db/shared-question-prompt-usage.js';
import { questionPrompts } from '$lib/server/db/schema.js';

/** @typedef {import('$lib/server/db/index.js').LearningDb} LearningDb */

/** @param {LearningDb} db @param {string} promptId */
async function isProductionPrompt(db, promptId) {
  return Boolean((await db
    .select({ id: questionPrompts.id })
    .from(questionPrompts)
    .where(and(eq(questionPrompts.id, promptId), isNull(questionPrompts.previewSessionId)))
    .limit(1))[0]);
}

export async function load({ platform, params }) {
  if (!platform?.env?.DB) return { prompt: null };
  const db = createDb(platform.env.DB);
  if (!(await isProductionPrompt(db, params.promptId))) return { prompt: null };
  return { prompt: await getQuestionPromptDetailWithShared(db, params.promptId) };
}

export const actions = {
  updatePrompt: async ({ request, platform, params }) => {
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const db = createDb(platform.env.DB);
    if (!(await isProductionPrompt(db, params.promptId))) {
      return fail(404, { error: 'Production Question Prompt not found.' });
    }
    const formData = await request.formData();
    try {
      await updateQuestionPromptWithSharedGuard(db, {
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
