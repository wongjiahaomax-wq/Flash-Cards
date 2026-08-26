import { error, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { CaseLifecycleError, deactivateProductionCase } from '$lib/server/db/case-lifecycle.ts';
import { createDb } from '$lib/server/db/index.js';

export async function POST({ request, locals, platform, params }) {
  if (!canManageCaseAssets(locals.user)) throw error(403, 'Administrator access is required.');
  if (!platform?.env?.DB) throw error(503, 'The study database is not configured.');

  const formData = await request.formData();
  const submittedCaseId = typeof formData.get('case_id') === 'string' ? String(formData.get('case_id')).trim() : '';
  if (submittedCaseId && submittedCaseId !== params.caseId) throw error(400, 'The selected Case does not match this editor.');

  try {
    await deactivateProductionCase(createDb(platform.env.DB), params.caseId);
  } catch (errorValue) {
    if (errorValue instanceof CaseLifecycleError) throw error(400, errorValue.message);
    console.error('Unable to deactivate Case.', errorValue);
    throw error(500, 'Unable to deactivate this Case.');
  }
  redirect(303, `/admin/cases/${encodeURIComponent(params.caseId)}/recovery?status=case-deactivated`);
}
