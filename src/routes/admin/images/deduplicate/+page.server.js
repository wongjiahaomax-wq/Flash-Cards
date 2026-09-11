import { fail, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import {
  AssetDeduplicationInputError,
  getDuplicateAssetMergePlan,
  mergeDuplicateAssets
} from '$lib/server/db/asset-deduplication.js';
import { getTeachingImageUrl } from '$lib/server/storage/media.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {any} plan */
function publicPlan(plan) {
  if (!plan) return null;
  const client = { ...plan };
  delete client.authoringState;
  delete client.fingerprintPayload;
  if (client.survivor) client.survivor = { ...client.survivor, imageUrl: client.r2.a ? getTeachingImageUrl(client.survivor.id) : null };
  if (client.duplicate) client.duplicate = { ...client.duplicate, imageUrl: client.r2.b ? getTeachingImageUrl(client.duplicate.id) : null };
  return client;
}

export async function load({ locals, platform, url }) {
  const survivorAssetId = url.searchParams.get('survivor')?.trim() ?? '';
  const duplicateAssetId = url.searchParams.get('duplicate')?.trim() ?? '';
  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB || !platform.env.MEDIA || !survivorAssetId || !duplicateAssetId) {
    return { plan: null, status: url.searchParams.get('status') };
  }
  try {
    const plan = await getDuplicateAssetMergePlan({
      db: createDb(platform.env.DB),
      bucket: platform.env.MEDIA,
      survivorAssetId,
      duplicateAssetId
    });
    return { plan: publicPlan(plan), status: url.searchParams.get('status') };
  } catch (error) {
    if (!(error instanceof AssetDeduplicationInputError)) console.error('Image dedupe comparison failed.', error);
    return { plan: null, status: url.searchParams.get('status'), error: error instanceof Error ? error.message : 'Unable to load this comparison.' };
  }
}

export const actions = {
  merge: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB || !platform.env.MEDIA) return fail(503, { error: 'Image storage is not configured.' });
    const formData = await request.formData();
    /** @type {Record<string, string>} */
    const questionResolutions = {};
    for (const [name, value] of formData.entries()) {
      if (!name.startsWith('resolution_') || typeof value !== 'string' || !value) continue;
      questionResolutions[name.slice('resolution_'.length)] = value;
    }
    let result;
    try {
      result = await mergeDuplicateAssets({
        db: createDb(platform.env.DB),
        bucket: platform.env.MEDIA,
        survivorAssetId: formText(formData, 'survivor_asset_id'),
        duplicateAssetId: formText(formData, 'duplicate_asset_id'),
        mergePlanFingerprint: formText(formData, 'merge_plan_fingerprint'),
        questionResolutions,
        certificationConfirmed: formData.get('certification_confirmed') === 'yes'
      });
    } catch (error) {
      const clientError = error instanceof AssetDeduplicationInputError;
      if (!clientError) console.error('Certified image dedupe failed.', error);
      return fail(clientError ? 400 : 500, { error: clientError ? error.message : 'Unable to merge these image Assets.' });
    }
    redirect(303, `/admin/images?status=dedupe-${result.cleanup.status}`);
  }
};
