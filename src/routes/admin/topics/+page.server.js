import { fail, redirect } from '@sveltejs/kit';

import { AdminContentInputError } from '$lib/server/db/admin-content.js';
import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { applyStagedCasePrimaryTopics } from '$lib/server/db/case-primary-topic-staging.ts';
import { createDb } from '$lib/server/db/index.js';
import { getTaxonomyCoverageReport, listTaxonomyLibrary } from '$lib/server/db/taxonomy-admin-read.ts';
import { applyStagedTaxonomyHierarchy } from '$lib/server/db/taxonomy-hierarchy-staging.ts';
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
  if (cause instanceof TaxonomyInputError || cause instanceof AdminContentInputError) {
    return fail(400, { error: cause.message });
  }
  console.error('Systems & Topics Admin action failed.', cause);
  return fail(500, { error: 'Unable to update the System/Topic workspace.' });
}

/** @param {FormData} formData @param {string} field @param {string} label */
function stagedJsonChanges(formData, field, label) {
  const raw = formText(formData, field);
  if (!raw) return null;
  let changes;
  try {
    changes = JSON.parse(raw);
  } catch {
    throw new TaxonomyInputError(`${label} could not be read. Refresh and try again.`);
  }
  if (!Array.isArray(changes)) {
    throw new TaxonomyInputError(`${label} must be submitted as a list.`);
  }
  return changes;
}

/** @param {FormData} formData */
function legacyHierarchyChanges(formData) {
  const changes = [];
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith('parent:') || typeof value !== 'string') continue;
    const id = name.slice('parent:'.length).trim();
    if (!id) continue;
    changes.push({ id, parentId: value.trim() || null });
  }
  return changes;
}

export async function load({ platform, url }) {
  const filters = { search: url.searchParams.get('q')?.trim() ?? '' };
  const selectedId = url.searchParams.get('selected')?.trim() ?? '';
  if (!platform?.env?.DB) {
    return { topics: [], hierarchyOptions: [], coverage: null, filters, selectedId };
  }

  const db = createDb(platform.env.DB);
  const [topics, hierarchyOptions, coverage] = await Promise.all([
    listTaxonomyLibrary(db, filters),
    filters.search ? listTaxonomyLibrary(db) : Promise.resolve(null),
    getTaxonomyCoverageReport(db)
  ]);

  return {
    topics,
    hierarchyOptions: hierarchyOptions ?? topics,
    coverage,
    filters,
    selectedId
  };
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
    redirect(303, `/admin/topics?selected=${encodeURIComponent(created.id)}&status=created`);
  },

  applyHierarchy: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      const staged = stagedJsonChanges(formData, 'changes_json', 'Staged hierarchy changes');
      const db = createDb(platform.env.DB);
      if (staged) {
        await applyStagedTaxonomyHierarchy(db, staged);
      } else {
        await applyTaxonomyHierarchy(db, legacyHierarchyChanges(formData));
      }
    } catch (cause) {
      return actionFailure(cause);
    }
    redirect(303, '/admin/topics?status=hierarchy-saved');
  },

  applyCasePrimaryTopics: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      const staged = stagedJsonChanges(formData, 'case_changes_json', 'Staged Primary Topic changes');
      if (!staged) throw new AdminContentInputError('Select at least one staged Case Primary Topic change.');
      await applyStagedCasePrimaryTopics(createDb(platform.env.DB), staged);
    } catch (cause) {
      return actionFailure(cause);
    }
    redirect(303, '/admin/topics?status=case-primary-topics-saved');
  }
};
