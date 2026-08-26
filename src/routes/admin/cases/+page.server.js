import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { getCaseLibraryPage, parseCaseLibraryFilters, parseCaseLibraryPage } from '$lib/server/db/case-library.js';
import { createDb } from '$lib/server/db/index.js';
import { listActiveTagOptions } from '$lib/server/db/library-options.js';
import { listAdminConcepts } from '$lib/server/db/admin-content.js';
import { serverTimingValue, withServerReadTiming } from '$lib/server/performance-timing.js';

export { actions } from '../+page.server.js';

export async function load({ locals, platform, url, setHeaders }) {
  const filters = parseCaseLibraryFilters(url.searchParams);
  const requestedPage = parseCaseLibraryPage(url.searchParams);
  const emptyPagination = { totalCount: 0, totalPages: 1, page: 1, pageSize: 60 };

  if (!canManageCaseAssets(locals.user) || !platform?.env?.DB) {
    return { tags: [], topics: [], caseFilters: filters, cases: [], pagination: emptyPagination, status: url.searchParams.get('status') ?? '' };
  }

  const db = createDb(platform.env.DB);
  const { pageData, tagRows, topicRows } = await withServerReadTiming(
    'admin-case-library-read',
    async () => {
      const [pageData, tagRows, topicRows] = await Promise.all([
        getCaseLibraryPage(db, filters, { page: requestedPage }),
        listActiveTagOptions(db),
        listAdminConcepts(db)
      ]);
      return { pageData, tagRows, topicRows };
    },
    ({ operation, durationMs }) => {
      setHeaders({ 'server-timing': serverTimingValue(operation, durationMs) });
    }
  );

  return {
    tags: tagRows,
    topics: topicRows,
    caseFilters: filters,
    cases: pageData.rows,
    pagination: {
      totalCount: pageData.totalCount,
      totalPages: pageData.totalPages,
      page: pageData.page,
      pageSize: pageData.pageSize
    },
    status: url.searchParams.get('status') ?? ''
  };
}
