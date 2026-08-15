import { fail, redirect } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { createDb } from '$lib/server/db/index.js';
import { assets } from '$lib/server/db/schema.js';
import {
  attachAssetToCase,
  canManageCaseAssets,
  CaseAssetInputError,
  detachAssetFromCase,
  getAdminCaseData,
  listAdminCases,
  moveCaseAsset,
  updateCaseAssetCaption
} from '$lib/server/db/case-assets.js';
import {
  assertSupportedImageType,
  deleteTeachingImage,
  getTeachingImageUrl,
  MediaStorageLimitError,
  putTeachingImage
} from '$lib/server/storage/media.js';

class AssetInputError extends Error {}

/** @param {FormDataEntryValue | null} value */
function optionalText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

/**
 * @param {FormDataEntryValue | null} value
 * @param {string} label
 */
function requiredText(value, label) {
  const text = optionalText(value);
  if (!text) throw new AssetInputError(`${label} is required.`);
  return text;
}

/** @param {string | null} value */
function validateSourceUrl(value) {
  if (!value) return null;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new AssetInputError('Source URL must be a valid http(s) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AssetInputError('Source URL must be a valid http(s) URL.');
  }

  return parsed.toString();
}

/** @param {string} mimeType */
function extensionForType(mimeType) {
  return mimeType === 'image/png' ? 'png' : 'jpg';
}

export async function load({ locals, platform, url }) {
  if (!canManageCaseAssets(locals.user)) return { assets: [], cases: [], selectedCase: null };

  const db = platform?.env?.DB ? createDb(platform.env.DB) : null;
  if (!db) return { assets: [], cases: [], selectedCase: null };

  const rows = await db.select().from(assets).orderBy(desc(assets.createdAt)).limit(100);
  const caseRows = await listAdminCases(db);
  const requestedId = url.searchParams.get('case');
  const selectedId = caseRows.some((item) => item.id === requestedId) ? requestedId : caseRows[0]?.id;
  const manager = selectedId ? await getAdminCaseData(db, selectedId) : null;

  return {
    assets: rows.map((asset) => ({
      ...asset,
      imageUrl: getTeachingImageUrl(asset.id)
    })),
    cases: caseRows,
    selectedCase: manager
      ? {
          ...manager,
          attached: manager.attached.map((asset) => ({
            ...asset,
            imageUrl: asset.isActive ? getTeachingImageUrl(asset.assetId) : null
          })),
          available: manager.available.map((asset) => ({
            ...asset,
            imageUrl: getTeachingImageUrl(asset.assetId)
          }))
        }
      : null
  };
}

/** @param {unknown} error */
function actionError(error) {
  return error instanceof CaseAssetInputError ? error.message : 'Unable to update Case images.';
}

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {string} caseId @param {string} status */
function selectedCaseRedirect(caseId, status) {
  return `/admin?case=${encodeURIComponent(caseId)}&status=${encodeURIComponent(status)}`;
}

export const actions = {
  upload: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });

    const env = platform?.env;
    if (!env?.DB || !env?.MEDIA) {
      return fail(503, { error: 'Image storage is not configured.' });
    }

    const formData = await request.formData();
    const imageValue = formData.get('image');

    if (
      !imageValue ||
      typeof imageValue !== 'object' ||
      typeof imageValue.size !== 'number' ||
      typeof imageValue.type !== 'string' ||
      typeof imageValue.arrayBuffer !== 'function'
    ) {
      return fail(400, { error: 'Choose a JPEG or PNG image to upload.' });
    }

    try {
      assertSupportedImageType(imageValue.type);
      const altText = requiredText(formData.get('alt_text'), 'Alt text');
      const sourceLabel = optionalText(formData.get('source_label'));
      const sourceUrl = validateSourceUrl(optionalText(formData.get('source_url')));
      const licence = optionalText(formData.get('licence'));
      const key = `teaching-images/${crypto.randomUUID()}.${extensionForType(imageValue.type)}`;

      await putTeachingImage(env.MEDIA, key, imageValue);

      try {
        const id = crypto.randomUUID();
        await createDb(env.DB).insert(assets).values({
          id,
          type: 'image',
          storageKey: key,
          mimeType: imageValue.type,
          originalFilename: optionalText(imageValue.name),
          altText,
          sourceLabel,
          sourceUrl,
          licence,
          isActive: true
        });
      } catch (metadataError) {
        try {
          await deleteTeachingImage(env.MEDIA, key);
        } catch (cleanupError) {
          console.error('Unable to clean up orphaned teaching image after metadata failure.', {
            key,
            cleanupError
          });
        }
        throw metadataError;
      }
    } catch (error) {
      const clientError = error instanceof AssetInputError || error instanceof MediaStorageLimitError;
      if (!clientError) {
        console.error('Teaching image upload failed.', error);
      }
      return fail(clientError ? 400 : 500, {
        error: error instanceof Error ? error.message : 'Unable to save the teaching image.'
      });
    }

    redirect(303, '/admin?uploaded=1');
  },

  attach: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    const assetId = formText(formData, 'asset_id');
    try {
      await attachAssetToCase(createDb(platform.env.DB), caseId, assetId);
    } catch (error) {
      return fail(error instanceof CaseAssetInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'attached'));
  },

  detach: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    const assetId = formText(formData, 'asset_id');
    try {
      await detachAssetFromCase(createDb(platform.env.DB), caseId, assetId);
    } catch (error) {
      return fail(error instanceof CaseAssetInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'detached'));
  },

  caption: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    const assetId = formText(formData, 'asset_id');
    try {
      await updateCaseAssetCaption(createDb(platform.env.DB), caseId, assetId, formText(formData, 'caption'));
    } catch (error) {
      return fail(error instanceof CaseAssetInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'caption-saved'));
  },

  reorder: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    const caseId = formText(formData, 'case_id');
    const assetId = formText(formData, 'asset_id');
    const direction = formText(formData, 'direction');
    if (direction !== 'up' && direction !== 'down') {
      return fail(400, { error: 'A valid movement direction is required.', caseId });
    }
    try {
      await moveCaseAsset(createDb(platform.env.DB), caseId, assetId, direction);
    } catch (error) {
      return fail(error instanceof CaseAssetInputError ? 400 : 500, { error: actionError(error), caseId });
    }
    redirect(303, selectedCaseRedirect(caseId, 'reordered'));
  }
};
