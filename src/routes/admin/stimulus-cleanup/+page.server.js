import { error } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { listStimulusCleanupIssues } from '$lib/server/db/stimulus-audit.js';

export async function load({ locals, platform }) {
  if (!canManageCaseAssets(locals.user)) throw error(403, 'Administrator access is required.');
  if (!platform?.env?.DB) throw error(503, 'The study database is not configured.');
  const issues = await listStimulusCleanupIssues(createDb(platform.env.DB));
  return {
    issues,
    cleanupCount: issues.filter((issue) => issue.severity === 'needs_cleanup').length,
    suggestedCount: issues.filter((issue) => issue.severity === 'review_suggested').length
  };
}
