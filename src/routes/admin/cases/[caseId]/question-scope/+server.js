import { redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { CaseQuestionInputError } from '$lib/server/db/case-questions.js';
import { createDb } from '$lib/server/db/index.js';
import { moveCaseQuestionToStimulusTarget, saveQuestionAtScope } from '$lib/server/db/question-scope.js';

/** @param {FormData} formData @param {string} name */
function text(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST({ request, locals, platform, params }) {
  if (!canManageCaseAssets(locals.user)) return new Response('Administrator access is required.', { status: 403 });
  if (!platform?.env?.DB) return new Response('The study database is not configured.', { status: 503 });

  const formData = await request.formData();
  const caseId = text(formData, 'case_id') || params.caseId;
  if (caseId !== params.caseId) return new Response('The selected Case does not match this editor.', { status: 400 });

  try {
    const db = createDb(platform.env.DB);
    const intent = text(formData, 'intent') || 'create';
    if (intent === 'move') {
      await moveCaseQuestionToStimulusTarget(db, {
        caseId,
        promptId: text(formData, 'prompt_id'),
        target: text(formData, 'target')
      });
      redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=question-scope-updated#images`);
    }

    await saveQuestionAtScope(db, {
      caseId,
      scope: text(formData, 'scope') || 'case',
      target: text(formData, 'target'),
      promptMd: text(formData, 'prompt_md'),
      answerMd: text(formData, 'answer_md'),
      reusableForTopic: formData.get('reusable_for_topic')
    });
    const hash = text(formData, 'scope') === 'stimulus' ? '#images' : '#questions';
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=question-saved${hash}`);
  } catch (error) {
    if (error instanceof CaseQuestionInputError) return new Response(error.message, { status: 400 });
    throw error;
  }
}
