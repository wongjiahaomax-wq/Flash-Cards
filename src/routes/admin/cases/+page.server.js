import { createDb } from '$lib/server/db/index.js';
import { listActiveTags, listCurrentCaseTagAssignments } from '$lib/server/db/tag-library.js';
import { load as loadParent } from '../+page.server.js';

export { actions } from '../+page.server.js';

export async function load(event) {
  const data = await loadParent(event);
  const filters = {
    search: event.url.searchParams.get('q')?.trim() ?? '',
    tagId: event.url.searchParams.get('tag')?.trim() ?? ''
  };

  if (!event.platform?.env?.DB) {
    return {
      ...data,
      tags: [],
      caseFilters: filters,
      cases: data.cases.map((item) => ({ ...item, tags: [] }))
    };
  }

  const db = createDb(event.platform.env.DB);
  const [tagRows, assignments] = await Promise.all([
    listActiveTags(db),
    listCurrentCaseTagAssignments(db)
  ]);
  const tagsByCase = new Map();
  for (const assignment of assignments) {
    const current = tagsByCase.get(assignment.caseId) ?? [];
    current.push({ id: assignment.tagId, name: assignment.tagName });
    tagsByCase.set(assignment.caseId, current);
  }

  const decoratedCases = data.cases.map((item) => ({
    ...item,
    tags: tagsByCase.get(item.id) ?? []
  }));

  return {
    ...data,
    tags: tagRows,
    caseFilters: filters,
    cases: filters.tagId
      ? decoratedCases.filter((item) => item.tags.some((tag) => tag.id === filters.tagId))
      : decoratedCases
  };
}
