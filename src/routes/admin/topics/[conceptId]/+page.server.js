import { fail, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { listActiveTags } from '$lib/server/db/tag-library.js';
import { getTaxonomyDetail } from '$lib/server/db/taxonomy-admin-read.ts';
import {
  deleteUnusedTopic,
  replaceSystemTags,
  TaxonomyInputError,
  updateTaxonomyConcept
} from '$lib/server/db/taxonomy-admin-write.ts';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} cause */
function actionFailure(cause) {
  if (cause instanceof TaxonomyInputError) return fail(400, { error: cause.message });
  console.error('Taxonomy detail action failed.', cause);
  return fail(500, { error: 'Unable to update this System or Topic.' });
}

export async function load({ platform, params }) {
  if (!platform?.env?.DB) return { topic: null, activeTags: [] };
  const db = createDb(platform.env.DB);
  const [topic, activeTags] = await Promise.all([
    getTaxonomyDetail(db, params.conceptId),
    listActiveTags(db)
  ]);
  return { topic, activeTags };
}

export const actions = {
  updateConcept: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await updateTaxonomyConcept(createDb(platform.env.DB), {
        conceptId: params.conceptId,
        name: formText(formData, 'name'),
        descriptionMd: formText(formData, 'description_md'),
        kind: formText(formData, 'kind'),
        isActive: formData.get('is_active')
      });
    } catch (cause) {
      return actionFailure(cause);
    }
    redirect(303, `/admin/topics/${encodeURIComponent(params.conceptId)}?status=saved`);
  },

  deleteTopic: async ({ locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    try {
      await deleteUnusedTopic(createDb(platform.env.DB), { conceptId: params.conceptId });
    } catch (cause) {
      return actionFailure(cause);
    }
    redirect(303, '/admin/topics');
  },

  saveSystemTags: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const db = createDb(platform.env.DB);
    const formData = await request.formData();
    const selectedIds = formData.getAll('tag_id').filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean);
    try {
      const activeTags = await listActiveTags(db);
      const tagById = new Map(activeTags.map((tag) => [tag.id, tag]));
      const ordered = selectedIds
        .map((tagId, submittedIndex) => ({
          tagId,
          submittedIndex,
          name: tagById.get(tagId)?.name ?? '',
          requestedOrder: Number(formText(formData, `order:${tagId}`))
        }))
        .sort((left, right) => {
          const leftOrder = Number.isFinite(left.requestedOrder) ? left.requestedOrder : Number.MAX_SAFE_INTEGER;
          const rightOrder = Number.isFinite(right.requestedOrder) ? right.requestedOrder : Number.MAX_SAFE_INTEGER;
          return leftOrder - rightOrder || left.name.localeCompare(right.name) || left.tagId.localeCompare(right.tagId) || left.submittedIndex - right.submittedIndex;
        })
        .map((item) => item.tagId);
      await replaceSystemTags(db, { systemId: params.conceptId, tagIds: ordered });
    } catch (cause) {
      return actionFailure(cause);
    }
    redirect(303, `/admin/topics/${encodeURIComponent(params.conceptId)}?status=system-tags-saved`);
  }
};
