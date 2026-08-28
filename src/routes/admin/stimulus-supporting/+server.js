import { error, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { convertStimulusOptionToSupporting } from '$lib/server/db/stimulus-role-conversion.js';
import { StimulusGroupInputError } from '$lib/server/db/stimulus-groups.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST({ request, locals, platform }) {
  if (!canManageCaseAssets(locals.user)) throw error(403, 'Administrator access is required.');
  if (!platform?.env?.DB) throw error(503, 'The study database is not configured.');
  const formData = await request.formData();
  const caseId = formText(formData, 'case_id');
  try {
    const result = await convertStimulusOptionToSupporting(
      createDb(platform.env.DB),
      formText(formData, 'option_id')
    );
    if (caseId && result.caseId !== caseId) {
      throw new StimulusGroupInputError('The selected stimulus option does not belong to this Case.');
    }
    redirect(303, `/admin/cases/${encodeURIComponent(result.caseId)}?status=stimulus-moved-to-supporting#stimuli`);
  } catch (cause) {
    if (cause instanceof StimulusGroupInputError) throw error(400, cause.message);
    throw cause;
  }
}
