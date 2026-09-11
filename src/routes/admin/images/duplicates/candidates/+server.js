import { json } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { AssetVisualDiscoveryInputError, listVisualDuplicateCandidates } from '$lib/server/db/asset-visual-discovery.js';

export async function GET({ locals, platform, url }) {
  if (!canManageCaseAssets(locals.user)) {
    return json({ error: 'Administrator access is required.' }, { status: 403, headers: { 'cache-control': 'no-store' } });
  }
  if (!platform?.env?.DB) {
    return json({ error: 'The study database is not configured.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  try {
    const result = await listVisualDuplicateCandidates(createDb(platform.env.DB), {
      scope: url.searchParams.get('scope') ?? '',
      topicId: url.searchParams.get('topic_id') ?? '',
      systemId: url.searchParams.get('system_id') ?? ''
    });
    return json(result, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const clientError = error instanceof AssetVisualDiscoveryInputError;
    if (!clientError) console.error('Visual duplicate candidate listing failed.', error);
    return json(
      { error: clientError ? error.message : 'Unable to list discovery candidates.' },
      { status: clientError ? 400 : 500, headers: { 'cache-control': 'no-store' } }
    );
  }
}
