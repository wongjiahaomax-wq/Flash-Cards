import { error, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { convertStimulusOptionToSupporting } from '$lib/server/db/stimulus-role-conversion.js';
import { StimulusGroupInputError } from '$lib/server/db/stimulus-groups.js';
import { normalizeCaseLibraryReturnQuery } from '$lib/admin-case-library-state.ts';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {Request} request @param {FormData} formData */
function editorReturnQuery(request, formData) {
  const submitted = formText(formData, 'return_query');
  if (submitted) return normalizeCaseLibraryReturnQuery(submitted);
  try { return normalizeCaseLibraryReturnQuery(new URL(request.headers.get('referer') ?? '').searchParams.get('return_query')); } catch { return ''; }
}

export async function POST({ request, locals, platform }) {
  if (!canManageCaseAssets(locals.user)) throw error(403, 'Administrator access is required.');
  if (!platform?.env?.DB) throw error(503, 'The study database is not configured.');
  const formData = await request.formData();
  const caseId = formText(formData, 'case_id');
  let result;
  try {
    result = await convertStimulusOptionToSupporting(
      createDb(platform.env.DB),
      formText(formData, 'option_id'),
      caseId
    );
  } catch (cause) {
    if (cause instanceof StimulusGroupInputError) throw error(400, cause.message);
    throw cause;
  }
  const returnQuery = editorReturnQuery(request, formData);
  redirect(303, `/admin/cases/${encodeURIComponent(result.caseId)}?status=stimulus-moved-to-supporting${returnQuery ? `&return_query=${encodeURIComponent(returnQuery)}` : ''}#stimulus-curation`);
}
