export { actions } from '../../+page.server.js';

import { createDb } from '$lib/server/db/index.js';
import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { listAdminConcepts } from '$lib/server/db/admin-content.js';

export async function load({ locals, platform, url }) {
  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) return { concepts: [], selectedConceptId: null };
  const concepts = await listAdminConcepts(createDb(platform.env.DB));
  const requested = url.searchParams.get('concept');
  return {
    concepts,
    selectedConceptId: concepts.some((concept) => concept.id === requested) ? requested : concepts[0]?.id ?? null
  };
}
