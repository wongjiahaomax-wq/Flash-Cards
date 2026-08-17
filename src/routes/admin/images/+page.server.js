import { fail } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import {
  ASSET_LIBRARY_SELECT_ALL_LIMIT,
  assetLibraryQueryContext,
  createAssetFromUpload,
  getAssetLibraryPage,
  listAssetLibraryTopics,
  parseAssetLibraryFilters,
  parseAssetLibraryPage
} from '$lib/server/db/asset-library.js';
import {
  AdminImageWorkflowInputError,
  ADMIN_IMAGE_BULK_LIMIT,
  bulkAddAssetsToStimulusGroup,
  listActiveStimulusGroupTargets
} from '$lib/server/db/admin-image-workflow.js';
import { getTeachingImageUrl, MediaStorageLimitError } from '$lib/server/storage/media.js';

function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function load({ locals, platform, url }) {
  const filters = parseAssetLibraryFilters(url.searchParams);
  const requestedPage = parseAssetLibraryPage(url.searchParams);
  const empty = { assets: [], topics: [], stimulusGroups: [], filters, pagination: { totalCount: 0, totalPages: 1, page: 1, pageSize: 60 }, queryContext: assetLibraryQueryContext(filters), allMatchingIds: [], selectAllLimit: ASSET_LIBRARY_SELECT_ALL_LIMIT, bulkLimit: ADMIN_IMAGE_BULK_LIMIT };
  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) return empty;

  const db = createDb(platform.env.DB);
  const [pageData, topics, stimulusGroups] = await Promise.all([
    getAssetLibraryPage(db, filters, { page: requestedPage, includeAllMatchingIds: true }),
    listAssetLibraryTopics(db),
    listActiveStimulusGroupTargets(db)
  ]);
  return {
    assets: pageData.rows,
    topics,
    stimulusGroups,
    filters,
    pagination: { totalCount: pageData.totalCount, totalPages: pageData.totalPages, page: pageData.page, pageSize: pageData.pageSize },
    queryContext: assetLibraryQueryContext(filters),
    allMatchingIds: pageData.allMatchingIds,
    selectAllLimit: ASSET_LIBRARY_SELECT_ALL_LIMIT,
    bulkLimit: ADMIN_IMAGE_BULK_LIMIT
  };
}

export const actions = {
  bulkAddToStimulusGroup: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const assetIds = formData.getAll('asset_id').filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean);
    try {
      const result = await bulkAddAssetsToStimulusGroup(createDb(platform.env.DB), formText(formData, 'group_id'), assetIds);
      return {
        bulkSuccess: true,
        bulkMessage: result.addedCount
          ? `Added ${result.addedCount} image${result.addedCount === 1 ? '' : 's'} to the alternative set${result.alreadyPresentCount ? `; ${result.alreadyPresentCount} already present` : ''}.`
          : `No relationship changes were needed; all ${result.alreadyPresentCount} selected images were already in the set.`
      };
    } catch (error) {
      const clientError = error instanceof AdminImageWorkflowInputError;
      if (!clientError) console.error('Bulk image grouping failed.', error);
      return fail(clientError ? 400 : 500, { error: clientError ? error.message : 'Unable to update the selected images.' });
    }
  },

  upload: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB || !platform.env.MEDIA) return fail(503, { error: 'Image storage is not configured.' });
    const formData = await request.formData();
    const imageValue = formData.get('image');
    if (!imageValue || typeof imageValue !== 'object' || typeof imageValue.size !== 'number' || typeof imageValue.type !== 'string' || typeof imageValue.arrayBuffer !== 'function') return fail(400, { error: 'Choose a JPEG or PNG image to upload.' });
    try {
      const created = await createAssetFromUpload(createDb(platform.env.DB), platform.env.MEDIA, imageValue, {
        originalFilename: formText(formData, 'image_name'), altText: formText(formData, 'alt_text'), sourceLabel: formText(formData, 'source_label'), sourceUrl: formText(formData, 'source_url'), licence: formText(formData, 'licence')
      });
      return { success: true, assetId: created.id, imageUrl: getTeachingImageUrl(created.id) };
    } catch (error) {
      const clientError = (error instanceof Error && error.name === 'AssetLibraryInputError') || error instanceof MediaStorageLimitError;
      if (!clientError) console.error('Teaching image upload failed.', error);
      return fail(clientError ? 400 : 500, { error: error instanceof Error ? error.message : 'Unable to save the teaching image.' });
    }
  }
};
