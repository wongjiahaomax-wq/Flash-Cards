import { fail, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { getCaseLibraryPage, parseCaseLibraryFilters, parseCaseLibraryPage } from '$lib/server/db/case-library.js';
import { bulkDeactivateProductionCases, bulkRestoreProductionCases, CaseLifecycleError } from '$lib/server/db/case-lifecycle.ts';
import { createDb } from '$lib/server/db/index.js';
import { listActiveTagOptions } from '$lib/server/db/library-options.js';
import { listAdminConcepts } from '$lib/server/db/admin-content.js';
import { serverTimingValue, withServerReadTiming } from '$lib/server/performance-timing.js';
import { actions as parentActions } from '../+page.server.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {FormData} formData */
function selectedCaseIds(formData) {
  return formData.getAll('case_ids').filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean);
}

/** @param {string} returnQuery @param {'active'|'inactive'} lifecycle @param {string} status */
function libraryRedirect(returnQuery, lifecycle, status) {
  const params = new URLSearchParams(returnQuery);
  params.delete('status');
  params.delete('page');
  if (lifecycle === 'inactive') params.set('lifecycle', 'inactive');
  else params.delete('lifecycle');
  params.set('status', status);
  return `/admin/cases?${params.toString()}`;
}

/** @param {unknown} error */
function lifecycleFailure(error) {
  const clientError = error instanceof CaseLifecycleError;
  if (!clientError) console.error('Case lifecycle action failed.', error);
  return fail(clientError ? 400 : 500, {
    error: clientError ? error.message : 'Unable to update the selected Case lifecycle.'
  });
}

export const actions = {
  ...parentActions,
  bulkDeactivateCases: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await bulkDeactivateProductionCases(createDb(platform.env.DB), selectedCaseIds(formData));
    } catch (error) {
      return lifecycleFailure(error);
    }
    redirect(303, libraryRedirect(formText(formData, 'return_query'), 'inactive', 'cases-deactivated'));
  },
  bulkRestoreCases: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await bulkRestoreProductionCases(createDb(platform.env.DB), selectedCaseIds(formData));
    } catch (error) {
      return lifecycleFailure(error);
    }
    redirect(303, libraryRedirect(formText(formData, 'return_query'), 'active', 'cases-restored'));
  }
};

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
