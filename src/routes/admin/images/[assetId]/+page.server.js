import { fail, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import {
  AssetLibraryInputError,
  getAssetLibraryDetail,
  updateAssetMetadata
} from '$lib/server/db/asset-library.js';
import { assets } from '$lib/server/db/schema.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {string} assetId @param {string} status */
function detailRedirect(assetId, status) {
  return `/admin/images/${encodeURIComponent(assetId)}?status=${encodeURIComponent(status)}`;
}

async function isProductionAsset(db, assetId) {
  return Boolean((await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.id, assetId), isNull(assets.previewSessionId)))
    .limit(1))[0]);
}

export async function load({ locals, params, platform, url }) {
  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) return { detail: null, status: null };
  const db = createDb(platform.env.DB);
  if (!(await isProductionAsset(db, params.assetId))) return { detail: null, status: null };
  return {
    detail: await getAssetLibraryDetail(db, params.assetId),
    status: url.searchParams.get('status')
  };
}

export const actions = {
  saveMetadata: async ({ request, locals, params, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });

    const db = createDb(platform.env.DB);
    if (!(await isProductionAsset(db, params.assetId))) {
      return fail(404, { error: 'Production Asset not found.' });
    }
    const formData = await request.formData();
    try {
      await updateAssetMetadata(db, params.assetId, {
        originalFilename: formText(formData, 'original_filename'),
        altText: formText(formData, 'alt_text'),
        sourceLabel: formText(formData, 'source_label'),
        sourceUrl: formText(formData, 'source_url'),
        licence: formText(formData, 'licence'),
        isActive: formData.has('is_active')
      });
    } catch (error) {
      const clientError = error instanceof AssetLibraryInputError;
      if (!clientError) console.error('Asset metadata update failed.', error);
      return fail(clientError ? 400 : 500, { error: error instanceof Error ? error.message : 'Unable to update the Asset.' });
    }
    redirect(303, detailRedirect(params.assetId, 'saved'));
  }
};
