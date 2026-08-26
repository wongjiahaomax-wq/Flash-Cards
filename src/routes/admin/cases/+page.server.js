import { fail, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { getCaseLibraryPage, parseCaseLibraryFilters, parseCaseLibraryPage } from '$lib/server/db/case-library.js';
import {
  bulkAddCaseTag,
  bulkCreateAndAddCaseTag,
  bulkRemoveCaseTag,
  CaseTagBulkError
} from '$lib/server/db/case-tag-authoring.ts';
import { bulkDeactivateProductionCases, bulkRestoreProductionCases, CaseLifecycleError } from '$lib/server/db/case-lifecycle.ts';
import { createDb } from '$lib/server/db/index.js';
import { listCaseLibraryTagOptions } from '$lib/server/db/library-options.js';
import { TagInputError } from '$lib/server/db/tag-library.js';
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

/**
 * @param {string} returnQuery
 * @param {'active'|'inactive'} lifecycle
 * @param {string} status
 * @param {Record<string, string | number | undefined>} [extras]
 */
function libraryRedirect(returnQuery, lifecycle, status, extras = {}) {
  const params = new URLSearchParams(returnQuery);
  params.delete('status');
  params.delete('tag_name');
  params.delete('case_count');
  params.delete('page');
  if (lifecycle === 'inactive') params.set('lifecycle', 'inactive');
  else params.delete('lifecycle');
  params.set('status', status);
  for (const [name, value] of Object.entries(extras)) {
    if (value !== undefined) params.set(name, String(value));
  }
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

/** @param {unknown} error */
function caseTagFailure(error) {
  const clientError = error instanceof CaseTagBulkError || error instanceof TagInputError;
  if (!clientError) console.error('Bulk Case Tag action failed.', error);
  return fail(clientError ? 400 : 500, {
    error: clientError ? error.message : 'Unable to update Tags for the selected Cases.'
  });
}

/** @param {URL} url */
function statusData(url) {
  const parsedCount = Number.parseInt(url.searchParams.get('case_count') ?? '', 10);
  return {
    status: url.searchParams.get('status') ?? '',
    statusTagName: url.searchParams.get('tag_name') ?? '',
    statusCaseCount: Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 0
  };
}

export const actions = {
  ...parentActions,
  bulkAddCaseTag: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    let result;
    try {
      result = await bulkAddCaseTag(createDb(platform.env.DB), {
        caseIds: selectedCaseIds(formData),
        tagId: formText(formData, 'tag_id')
      });
    } catch (error) {
      return caseTagFailure(error);
    }
    redirect(303, libraryRedirect(formText(formData, 'return_query'), 'active', 'case-tags-added', {
      tag_name: result.tag.name,
      case_count: result.selectedCount
    }));
  },
  bulkRemoveCaseTag: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    let result;
    try {
      result = await bulkRemoveCaseTag(createDb(platform.env.DB), {
        caseIds: selectedCaseIds(formData),
        tagId: formText(formData, 'tag_id')
      });
    } catch (error) {
      return caseTagFailure(error);
    }
    redirect(303, libraryRedirect(formText(formData, 'return_query'), 'active', 'case-tags-removed', {
      tag_name: result.tag.name,
      case_count: result.selectedCount
    }));
  },
  bulkCreateAndAddCaseTag: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    let result;
    try {
      result = await bulkCreateAndAddCaseTag(createDb(platform.env.DB), {
        caseIds: selectedCaseIds(formData),
        name: formText(formData, 'new_tag_name')
      });
    } catch (error) {
      return caseTagFailure(error);
    }
    redirect(303, libraryRedirect(formText(formData, 'return_query'), 'active', 'case-tag-created-bulk', {
      tag_name: result.tag.name,
      case_count: result.selectedCount
    }));
  },
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
    return {
      tags: [],
      topics: [],
      caseFilters: filters,
      cases: [],
      pagination: emptyPagination,
      ...statusData(url)
    };
  }

  const db = createDb(platform.env.DB);
  const { pageData, tagRows } = await withServerReadTiming(
    'admin-case-library-read',
    async () => {
      const [pageData, tagRows] = await Promise.all([
        getCaseLibraryPage(db, filters, { page: requestedPage }),
        listCaseLibraryTagOptions(db, filters.lifecycle)
      ]);
      return { pageData, tagRows };
    },
    ({ operation, durationMs }) => {
      setHeaders({ 'server-timing': serverTimingValue(operation, durationMs) });
    }
  );

  return {
    tags: tagRows,
    topics: pageData.topicOptions,
    caseFilters: filters,
    cases: pageData.rows,
    pagination: {
      totalCount: pageData.totalCount,
      totalPages: pageData.totalPages,
      page: pageData.page,
      pageSize: pageData.pageSize
    },
    ...statusData(url)
  };
}
