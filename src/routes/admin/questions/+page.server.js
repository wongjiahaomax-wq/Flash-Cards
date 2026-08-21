import { listAdminConcepts } from '$lib/server/db/admin-content.js';
import { createDb } from '$lib/server/db/index.js';
import { listActiveTagOptions } from '$lib/server/db/library-options.js';
import { getQuestionLibraryPage, parseQuestionLibraryFilters, parseQuestionLibraryPage } from '$lib/server/db/question-library-page.js';
import { serverTimingValue, withServerReadTiming } from '$lib/server/performance-timing.js';

// Production Prompt ownership is centralized in getQuestionLibraryPage via
// isNull(questionPrompts.previewSessionId); the route intentionally stays a thin read-model adapter.
export async function load({ platform, url, setHeaders }) {
  const filters = parseQuestionLibraryFilters(url.searchParams);
  const requestedPage = parseQuestionLibraryPage(url.searchParams);
  const emptyPagination = { totalCount: 0, totalPages: 1, page: 1, pageSize: 60 };

  if (!platform?.env?.DB) {
    return { questions: [], topics: [], tags: [], filters, pagination: emptyPagination };
  }

  const db = createDb(platform.env.DB);
  const { pageData, topics, tags } = await withServerReadTiming(
    'admin-question-library-read',
    async () => {
      const [pageData, topics, tags] = await Promise.all([
        getQuestionLibraryPage(db, filters, { page: requestedPage }),
        listAdminConcepts(db),
        listActiveTagOptions(db)
      ]);
      return { pageData, topics, tags };
    },
    ({ operation, durationMs }) => {
      setHeaders({ 'server-timing': serverTimingValue(operation, durationMs) });
    }
  );

  return {
    questions: pageData.rows,
    topics,
    tags,
    filters,
    pagination: {
      totalCount: pageData.totalCount,
      totalPages: pageData.totalPages,
      page: pageData.page,
      pageSize: pageData.pageSize
    }
  };
}
