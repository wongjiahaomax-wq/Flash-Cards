import { json, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createAndAddCaseTag } from '$lib/server/db/case-tag-authoring.ts';
import { createDb } from '$lib/server/db/index.js';
import { listActiveTagOptions } from '$lib/server/db/library-options.js';
import { addCaseTag, removeCaseTag, TagInputError } from '$lib/server/db/tag-library.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET({ locals, platform }) {
  if (!canManageCaseAssets(locals.user)) return json({ error: 'Administrator access is required.' }, { status: 403 });
  if (!platform?.env?.DB) return json({ error: 'The study database is not configured.' }, { status: 503 });
  return json({ tags: await listActiveTagOptions(createDb(platform.env.DB)) });
}

export async function POST({ request, locals, platform, params }) {
  if (!canManageCaseAssets(locals.user)) return new Response('Administrator access is required.', { status: 403 });
  if (!platform?.env?.DB) return new Response('The study database is not configured.', { status: 503 });

  const formData = await request.formData();
  const caseId = formText(formData, 'case_id') || params.caseId;
  if (caseId !== params.caseId) return new Response('The selected Case does not match this editor.', { status: 400 });
  const operation = formText(formData, 'operation');
  const tagId = formText(formData, 'tag_id');

  try {
    const db = createDb(platform.env.DB);
    if (operation === 'add') await addCaseTag(db, { caseId, tagId });
    else if (operation === 'remove') await removeCaseTag(db, { caseId, tagId });
    else if (operation === 'create-and-add') {
      await createAndAddCaseTag(db, { caseId, name: formText(formData, 'name') });
    } else return new Response('Choose a valid Case Tag operation.', { status: 400 });
  } catch (error) {
    if (error instanceof TagInputError) return new Response(error.message, { status: 400 });
    console.error('Unable to update Case Tags from the Case editor.', error);
    return new Response('Unable to update the Case Tag.', { status: 500 });
  }

  const status = operation === 'create-and-add'
    ? 'case-tag-created'
    : `case-tag-${operation === 'add' ? 'added' : 'removed'}`;
  redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=${status}#topics`);
}
