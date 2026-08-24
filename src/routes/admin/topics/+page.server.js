import { fail, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { getTaxonomyCoverageReport, listTaxonomyLibrary } from '$lib/server/db/taxonomy-admin-read.ts';
import {
  applyTaxonomyHierarchy,
  createTaxonomyConcept,
  TaxonomyInputError
} from '$lib/server/db/taxonomy-admin-write.ts';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} cause */
function actionFailure(cause) {
  if (cause instanceof TaxonomyInputError) return fail(400, { error: cause.message });
  console.error('Taxonomy Admin action failed.', cause);
  return fail(500, { error: 'Unable to update the System/Topic taxonomy.' });
}

export async function load({ platform, url }) {
  const filters = { search: url.searchParams.get('q')?.trim() ?? '' };
  if (!platform?.env?.DB) return { topics: [], hierarchyOptions: [], coverage: null, filters };
  const db = createDb(platform.env.DB);
  const [topics, hierarchyOptions, coverage] = await Promise.all([
    listTaxonomyLibrary(db, filters),
    filters.search ? listTaxonomyLibrary(db) : Promise.resolve(null),
    getTaxonomyCoverageReport(db)
  ]);
  return { topics, hierarchyOptions: hierarchyOptions ?? topics, coverage, filters };
}

export const actions = {
  createConcept: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    let created;
    try {
      created = await createTaxonomyConcept(createDb(platform.env.DB), {
        name: formText(formData, 'name'),
        kind: formText(formData, 'kind'),
        parentId: formText(formData, 'parent_id'),
        descriptionMd: formText(formData, 'description_md')
      });
    } catch (cause) {
      return actionFailure(cause);
    }
    redirect(303, `/admin/topics/${encodeURIComponent(created.id)}?status=created`);
  },

  applyHierarchy: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const changes = [];
    for (const [name, value] of formData.entries()) {
      if (!name.startsWith('parent:') || typeof value !== 'string') continue;
      const id = name.slice('parent:'.length).trim();
      if (!id) continue;
      changes.push({ id, parentId: value.trim() || null });
    }
    try {
      await applyTaxonomyHierarchy(createDb(platform.env.DB), changes);
    } catch (cause) {
      return actionFailure(cause);
    }
    redirect(303, '/admin/topics?status=hierarchy-saved');
  }
};
