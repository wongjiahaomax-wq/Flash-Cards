import { json } from '@sveltejs/kit';

import { AdminContentInputError, promoteCaseTopic } from '$lib/server/db/admin-content.js';
import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createCaseLibraryTopic, CaseLibraryTopicInputError } from '$lib/server/db/case-library-topic-authoring.ts';
import { createDb } from '$lib/server/db/index.js';
import { moveTopicToSystem, TaxonomyInputError } from '$lib/server/db/taxonomy-admin-write.ts';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} error */
function classificationFailure(error) {
  const clientError = error instanceof AdminContentInputError || error instanceof CaseLibraryTopicInputError || error instanceof TaxonomyInputError;
  if (!clientError) console.error('Unable to update Case classification from the Case Library.', error);
  return new Response(clientError ? error.message : 'Unable to update this Case classification.', { status: clientError ? 400 : 500 });
}

export async function POST({ request, locals, platform, params }) {
  if (!canManageCaseAssets(locals.user)) return new Response('Administrator access is required.', { status: 403 });
  if (!platform?.env?.DB) return new Response('The study database is not configured.', { status: 503 });

  const formData = await request.formData();
  const caseId = formText(formData, 'case_id') || params.caseId;
  if (caseId !== params.caseId) return new Response('The selected Case does not match this editor.', { status: 400 });

  const operation = formText(formData, 'operation');
  const db = createDb(platform.env.DB);
  try {
    if (operation === 'select-topic') {
      await promoteCaseTopic(db, { caseId, conceptId: formText(formData, 'concept_id') });
      return json({ ok: true, status: 'classification-updated' });
    }
    if (operation === 'create-topic') {
      const created = await createCaseLibraryTopic(db, {
        caseIds: [caseId],
        name: formText(formData, 'name'),
        parentId: formText(formData, 'parent_id')
      });
      return json({ ok: true, status: 'topic-created-and-assigned', topic: { id: created.id, name: created.name } });
    }
    if (operation === 'move-topic-to-system') {
      await moveTopicToSystem(db, {
        caseId,
        topicId: formText(formData, 'topic_id'),
        systemId: formText(formData, 'system_id')
      });
      return json({ ok: true, status: 'topic-system-moved' });
    }
    return new Response('Choose a valid Case classification operation.', { status: 400 });
  } catch (error) {
    return classificationFailure(error);
  }
}