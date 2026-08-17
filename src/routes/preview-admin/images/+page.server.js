import { fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';

import { ASSET_LIBRARY_SELECT_ALL_LIMIT, assetLibraryQueryContext, getAssetLibraryPage, listAssetLibraryTopics, parseAssetLibraryFilters, parseAssetLibraryPage } from '$lib/server/db/asset-library.js';
import { addPreviewAssetsToStimulusGroup, PREVIEW_IMAGE_BULK_LIMIT, getLivePreviewSession, PreviewWorkspaceError } from '$lib/server/db/preview-workspace.js';
import { createDb } from '$lib/server/db/index.js';
import { cases, stimulusGroups } from '$lib/server/db/schema.js';
import { requirePreviewAdmin } from '$lib/server/preview-auth.js';

/** @param {unknown} error */
function actionMessage(error) { return error instanceof Error ? error.message : 'Unable to update the Preview workspace.'; }

export async function load({ parent, platform, url }) {
  const parentData = await parent();
  const env = platform?.env;
  const filters = parseAssetLibraryFilters(url.searchParams);
  const queryContext = assetLibraryQueryContext(filters);
  if (!env?.DB || parentData.workspace.status !== 'active' || parentData.workspaceError) {
    return { assets: [], topics: [], stimulusGroups: [], filters, pagination: { totalCount: 0, totalPages: 1, page: 1, pageSize: 60 }, queryContext, allMatchingIds: [], selectAllLimit: ASSET_LIBRARY_SELECT_ALL_LIMIT, bulkLimit: PREVIEW_IMAGE_BULK_LIMIT, workspaceBlocked: true };
  }
  const db = createDb(env.DB);
  const [pageData, topics] = await Promise.all([
    getAssetLibraryPage(db, filters, { page: parseAssetLibraryPage(url.searchParams), includeAllMatchingIds: true }),
    listAssetLibraryTopics(db)
  ]);
  const session = await getLivePreviewSession(db, parentData.user.id);
  const previewGroups = session
    ? await db.select({ id: stimulusGroups.id, name: stimulusGroups.name, caseId: stimulusGroups.caseId, caseTitle: cases.title, displayOrder: stimulusGroups.displayOrder })
        .from(stimulusGroups).innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
        .where(and(eq(cases.previewSessionId, session.id), eq(stimulusGroups.isActive, true), eq(cases.isActive, true)))
        .orderBy(asc(cases.title), asc(stimulusGroups.displayOrder), asc(stimulusGroups.name))
    : [];
  return {
    assets: pageData.rows,
    topics,
    stimulusGroups: previewGroups,
    filters,
    pagination: { totalCount: pageData.totalCount, totalPages: pageData.totalPages, page: pageData.page, pageSize: pageData.pageSize },
    queryContext,
    allMatchingIds: pageData.allMatchingIds,
    selectAllLimit: ASSET_LIBRARY_SELECT_ALL_LIMIT,
    bulkLimit: PREVIEW_IMAGE_BULK_LIMIT,
    workspaceBlocked: false
  };
}

export const actions = {
  bulkAddToStimulusGroup: async (event) => {
    let userId;
    try { userId = requirePreviewAdmin({ user: event.locals.user, env: event.platform?.env }); } catch { return fail(403, { error: 'Preview Admin access is required.' }); }
    if (!event.platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const db = createDb(event.platform.env.DB);
    const session = await getLivePreviewSession(db, userId);
    if (!session || session.status !== 'active' || Number(session.expiresAt) <= Date.now()) return fail(409, { error: 'The Preview workspace is expired or requires cleanup.' });
    const formData = await event.request.formData();
    const assetIds = formData.getAll('asset_id').filter((value) => typeof value === 'string');
    try {
      const result = await addPreviewAssetsToStimulusGroup(db, session.id, String(formData.get('group_id') ?? ''), assetIds);
      return { bulkSuccess: true, bulkMessage: result.addedCount ? `Added ${result.addedCount} image${result.addedCount === 1 ? '' : 's'} to the Preview alternative set.` : 'No relationship changes were needed; the selected images were already in the set.' };
    } catch (error) {
      const status = error instanceof PreviewWorkspaceError && error.code === 'NOT_OWNED' ? 403 : 400;
      return fail(status, { error: actionMessage(error) });
    }
  }
};
