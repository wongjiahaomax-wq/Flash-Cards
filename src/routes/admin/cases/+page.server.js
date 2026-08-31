import { fail, redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { getCaseLibraryPage, parseCaseLibraryFilters, parseCaseLibraryPage } from '$lib/server/db/case-library.js';
import { createCaseLibraryTopic, CaseLibraryTopicInputError } from '$lib/server/db/case-library-topic-authoring.ts';
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
import { bulkMoveCaseTopicsToSystem, TaxonomyInputError } from '$lib/server/db/taxonomy-admin-write.ts';
import { serverTimingValue, withServerReadTiming } from '$lib/server/performance-timing.js';
import { actions as parentActions } from '../+page.server.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {FormData} formData @param {string} [name] */
function selectedCaseIds(formData, name = 'case_ids') {
  return formData.getAll(name).filter((value) => typeof value === 'string').map((value) => value.trim()).filter(Boolean);
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
  params.delete('topic_name');
  params.delete('system_name');
  params.delete('case_count');
  params.delete('topic_count');
  params.delete('page');
  params.set('lifecycle', lifecycle);
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
  return fail(clientError ? 400 : 500, { error: clientError ? error.message : 'Unable to update the selected Case lifecycle.' });
}

/** @param {unknown} error */
function caseTagFailure(error) {
  const clientError = error instanceof CaseTagBulkError || error instanceof TagInputError;
  if (!clientError) console.error('Bulk Case Tag action failed.', error);
  return fail(clientError ? 400 : 500, { error: clientError ? error.message : 'Unable to update Tags for the selected Cases.' });
}

/** @param {unknown} error @param {{ name: string, parentId: string }} input @param {string[]} caseIds */
function topicCreationFailure(error, input, caseIds) {
  const clientError = error instanceof CaseLibraryTopicInputError || error instanceof TaxonomyInputError;
  if (!clientError) console.error('Case Library Topic creation failed.', error);
  return fail(clientError ? 400 : 500, {
    error: clientError ? error.message : 'Unable to create the Topic.',
    topicCreation: true,
    topicName: input.name,
    topicParentId: input.parentId,
    topicSelectedCaseIds: caseIds
  });
}

/** @param {unknown} error */
function topicMoveFailure(error) {
  const clientError = error instanceof TaxonomyInputError;
  if (!clientError) console.error('Case Library Topic System move failed.', error);
  return fail(clientError ? 400 : 500, { error: clientError ? error.message : 'Unable to move the selected Topics under that System.' });
}

/** @param {URL} url */
function statusData(url) {
  const parsedCount = Number.parseInt(url.searchParams.get('case_count') ?? '', 10);
  return {
    status: url.searchParams.get('status') ?? '',
    statusTagName: url.searchParams.get('tag_name') ?? '',
    statusTopicName: url.searchParams.get('topic_name') ?? '',
    statusSystemName: url.searchParams.get('system_name') ?? '',
    statusCaseCount: Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 0,
    statusTopicCount: Number.parseInt(url.searchParams.get('topic_count') ?? '', 10) || 0
  };
}

export const actions = {
  ...parentActions,
  createCaseLibraryTopic: async ({ request, locals, platform, url }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    if (parseCaseLibraryFilters(url.searchParams).lifecycle === 'inactive') {
      return fail(400, { error: 'Create Topics from the active Case Library.', topicCreation: true });
    }
    const formData = await request.formData();
    const input = { name: formText(formData, 'new_topic_name'), parentId: formText(formData, 'parent_id') };
    const caseIds = selectedCaseIds(formData, 'topic_case_ids');
    let result;
    try {
      result = await createCaseLibraryTopic(createDb(platform.env.DB), {
        caseIds,
        name: input.name,
        parentId: input.parentId
      });
    } catch (error) {
      return topicCreationFailure(error, input, caseIds);
    }
    redirect(303, libraryRedirect(formText(formData, 'return_query'), 'active', result.selectedCount ? 'topic-created-and-assigned' : 'topic-created', {
      topic_name: result.name,
      case_count: result.selectedCount || undefined
    }));
  },
  bulkMoveCaseTopicsToSystem: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    let result;
    try {
      result = await bulkMoveCaseTopicsToSystem(createDb(platform.env.DB), {
        caseIds: selectedCaseIds(formData),
        systemId: formText(formData, 'system_id')
      });
    } catch (error) {
      return topicMoveFailure(error);
    }
    redirect(303, libraryRedirect(formText(formData, 'return_query'), 'active', 'topic-systems-moved', {
      case_count: result.selectedCount,
      topic_count: result.topicCount,
      system_name: result.system.name
    }));
  },
  bulkAddCaseTag: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    let result;
    try {
      result = await bulkAddCaseTag(createDb(platform.env.DB), { caseIds: selectedCaseIds(formData), tagId: formText(formData, 'tag_id') });
    } catch (error) {
      return caseTagFailure(error);
    }
    redirect(303, libraryRedirect(formText(formData, 'return_query'), 'active', 'case-tags-added', { tag_name: result.tag.name, case_count: result.selectedCount }));
  },
  bulkRemoveCaseTag: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    let result;
    try {
      result = await bulkRemoveCaseTag(createDb(platform.env.DB), { caseIds: selectedCaseIds(formData), tagId: formText(formData, 'tag_id') });
    } catch (error) {
      return caseTagFailure(error);
    }
    redirect(303, libraryRedirect(formText(formData, 'return_query'), 'active', 'case-tags-removed', { tag_name: result.tag.name, case_count: result.selectedCount }));
  },
  bulkCreateAndAddCaseTag: async ({ request, locals, platform }) => {
    if (!canManageCaseAssets(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    let result;
    try {
      result = await bulkCreateAndAddCaseTag(createDb(platform.env.DB), { caseIds: selectedCaseIds(formData), name: formText(formData, 'new_tag_name') });
    } catch (error) {
      return caseTagFailure(error);
    }
    redirect(303, libraryRedirect(formText(formData, 'return_query'), 'active', 'case-tag-created-bulk', { tag_name: result.tag.name, case_count: result.selectedCount }));
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
      topicParents: [],
      filterTopics: [],
      filterSystems: [],
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
    topicParents: pageData.topicParentOptions,
    filterTopics: pageData.topicFilterOptions,
    filterSystems: pageData.systemFilterOptions,
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
