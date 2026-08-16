import { canManageCaseAssets, listAdminCases } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { listActiveTags, listCurrentCaseTagAssignments } from '$lib/server/db/tag-library.js';

export { actions } from '../+page.server.js';

export async function load({ locals, platform, url }) {
  const filters = {
    search: url.searchParams.get('q')?.trim() ?? '',
    tagId: url.searchParams.get('tag')?.trim() ?? ''
  };

  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) {
    return { tags: [], caseFilters: filters, cases: [] };
  }

  const db = createDb(platform.env.DB);
  const [caseRows, tagRows, assignments] = await Promise.all([
    listAdminCases(db, filters.search.toLowerCase()),
    listActiveTags(db),
    listCurrentCaseTagAssignments(db)
  ]);

  /** @type {Map<string, Array<{ id: string, name: string }>>} */
  const tagsByCase = new Map();
  for (const assignment of assignments) {
    const current = tagsByCase.get(assignment.caseId) ?? [];
    current.push({ id: assignment.tagId, name: assignment.tagName });
    tagsByCase.set(assignment.caseId, current);
  }

  const decoratedCases = caseRows.map((item) => ({
    ...item,
    tags: tagsByCase.get(item.id) ?? []
  }));

  return {
    tags: tagRows,
    caseFilters: filters,
    cases: filters.tagId
      ? decoratedCases.filter((item) => item.tags.some((tag) => tag.id === filters.tagId))
      : decoratedCases
  };
}
