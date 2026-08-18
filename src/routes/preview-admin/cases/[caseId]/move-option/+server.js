import { redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { moveStimulusOptionWithinCase, StimulusOptionMoveError } from '$lib/server/db/image-option-move.js';
import { getLivePreviewSession } from '$lib/server/db/preview-workspace.js';
import { requirePreviewAdmin } from '$lib/server/preview-auth.js';

/** @param {FormData} formData @param {string} name */
function text(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST({ request, locals, platform, params }) {
  let userId;
  try { userId = requirePreviewAdmin({ user: locals.user, env: platform?.env }); }
  catch { return new Response('Preview Admin access is required.', { status: 403 }); }
  if (!platform?.env?.DB) return new Response('The study database is not configured.', { status: 503 });
  const db = createDb(platform.env.DB);
  const session = await getLivePreviewSession(db, userId);
  if (!session || session.status !== 'active' || Number(session.expiresAt) <= Date.now()) return new Response('The Preview workspace is expired or requires cleanup.', { status: 409 });
  const formData = await request.formData();
  const caseId = text(formData, 'case_id') || params.caseId;
  if (caseId !== params.caseId) return new Response('The selected Case does not match this editor.', { status: 400 });
  try {
    await moveStimulusOptionWithinCase(db, {
      caseId,
      optionId: text(formData, 'option_id'),
      targetGroupId: text(formData, 'target_group_id'),
      previewSessionId: session.id
    });
  } catch (error) {
    const clientError = error instanceof StimulusOptionMoveError;
    if (!clientError) console.error('Unable to move Preview alternative stimulus option.', error);
    return new Response(clientError ? error.message : 'Unable to move the Preview alternative image.', { status: clientError ? (error.code === 'NOT_OWNED' ? 403 : 400) : 500 });
  }
  redirect(303, `/preview-admin/cases/${encodeURIComponent(caseId)}?status=option-moved#images`);
}
