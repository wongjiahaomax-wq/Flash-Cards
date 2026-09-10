import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { listVisualDuplicateScopes, VISUAL_DISCOVERY_MAX_ASSETS } from '$lib/server/db/asset-visual-discovery.js';
import { MAX_IMAGE_BYTES } from '$lib/server/storage/media.js';

export async function load({ locals, platform }) {
  const fallbackLimits = {
    maxScanAssets: VISUAL_DISCOVERY_MAX_ASSETS,
    maxTotalFetchBytes: 96 * 1024 * 1024,
    maxSingleFetchBytes: MAX_IMAGE_BYTES,
    fetchConcurrency: 4,
    decodeConcurrency: 2
  };
  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) {
    return { discoveryEnabled: false, scopes: { topics: [], systems: [] }, limits: fallbackLimits };
  }
  const scopes = await listVisualDuplicateScopes(createDb(platform.env.DB));
  return { discoveryEnabled: true, scopes, limits: fallbackLimits };
}
