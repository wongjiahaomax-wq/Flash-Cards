import { error, fail, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { CaseLifecycleError, getInactiveProductionCaseRecovery, restoreProductionCase } from '$lib/server/db/case-lifecycle.ts';
import { createDb } from '$lib/server/db/index.js';
import { normalizeCaseLibraryReturnQuery } from '$lib/admin-case-library-state.ts';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function load({ locals, platform, params, url }) {
  if (!canManageCaseAssets(locals.user)) throw error(403, 'Administrator access is required.');
  if (!platform?.env?.DB) throw error(503, 'The study database is not configured.');

  const recoveryCase = await getInactiveProductionCaseRecovery(createDb(platform.env.DB), params.caseId);
  if (!recoveryCase) throw error(404, 'Inactive Production Case not found.');
  const caseLibraryReturnQuery = normalizeCaseLibraryReturnQuery(url.searchParams.get('return_query'));
  return { recoveryCase, status: url.searchParams.get('status') ?? '', caseLibraryReturnQuery };
}

export const actions = {
  restoreCase: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id') || params.caseId;
    if (caseId !== params.caseId) return fail(400, { error: 'The selected Case does not match this recovery page.' });

    try {
      await restoreProductionCase(createDb(platform.env.DB), caseId);
    } catch (errorValue) {
      if (errorValue instanceof CaseLifecycleError) return fail(400, { error: errorValue.message });
      console.error('Unable to restore Case.', errorValue);
      return fail(500, { error: 'Unable to restore this Case.' });
    }
    let returnQuery = normalizeCaseLibraryReturnQuery(formText(formData, 'return_query'));
    if (!returnQuery) {
      try { returnQuery = normalizeCaseLibraryReturnQuery(new URL(request.headers.get('referer') ?? '').searchParams.get('return_query')); } catch { returnQuery = ''; }
    }
    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=case-restored${returnQuery ? `&return_query=${encodeURIComponent(returnQuery)}` : ''}`);
  }
};
