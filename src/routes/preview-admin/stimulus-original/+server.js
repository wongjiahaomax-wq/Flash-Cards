import { error, redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { getLivePreviewSession } from '$lib/server/db/preview-workspace.js';
import { setStimulusGroupOriginal } from '$lib/server/db/stimulus-originals.js';
import { StimulusGroupInputError } from '$lib/server/db/stimulus-groups.js';
import { requirePreviewAdmin } from '$lib/server/preview-auth.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST({ request, locals, platform }) {
  const env = platform?.env;
  const userId = requirePreviewAdmin({ user: locals.user, env });
  if (!env?.DB) throw error(503, 'The study database is not configured.');
  const db = createDb(env.DB);
  const session = await getLivePreviewSession(db, userId);
  if (!session || session.status !== 'active' || Number(session.expiresAt) <= Date.now()) {
    throw error(409, 'The Preview workspace is expired or requires cleanup. Reload before continuing.');
  }

  const formData = await request.formData();
  const caseId = formText(formData, 'case_id');
  try {
    const result = await setStimulusGroupOriginal(
      db,
      formText(formData, 'group_id'),
      formText(formData, 'option_id'),
      { previewSessionId: session.id }
    );
    if (caseId && result.caseId !== caseId) throw new StimulusGroupInputError('The selected stimulus family does not belong to this Case.');
    redirect(303, `/preview-admin/cases/${encodeURIComponent(result.caseId)}?status=stimulus-original-saved#stimuli`);
  } catch (cause) {
    if (cause instanceof StimulusGroupInputError) throw error(400, cause.message);
    throw cause;
  }
}
