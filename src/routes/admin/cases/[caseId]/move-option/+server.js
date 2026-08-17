import { redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { moveStimulusOptionWithinCase, StimulusOptionMoveError } from '$lib/server/db/image-option-move.js';

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
    await moveStimulusOptionWithinCase(createDb(platform.env.DB), {
      caseId,
      optionId: text(formData, 'option_id'),
      targetGroupId: text(formData, 'target_group_id'),
      previewSessionId: null
    });
  } catch (error) {
    const clientError = error instanceof StimulusOptionMoveError;
    if (!clientError) console.error('Unable to move alternative stimulus option.', error);
    return new Response(clientError ? error.message : 'Unable to move the alternative image.', { status: clientError ? (error.code === 'NOT_OWNED' ? 403 : 400) : 500 });
  }
  redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=option-moved#images`);
}
