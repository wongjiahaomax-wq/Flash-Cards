import { fail, redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import {
  cloneCaseToPreview,
  getLivePreviewSession,
  listPreviewCases,
  listProductionCasesForPreview,
  PreviewWorkspaceError
} from '$lib/server/db/preview-workspace.js';
import { requirePreviewAdmin } from '$lib/server/preview-auth.js';

function message(error) {
  return error instanceof Error ? error.message : 'Unable to update the Preview workspace.';
}

export async function load({ parent, platform, url }) {
  const parentData = await parent();
  const env = platform?.env;
  if (!env?.DB) return { sourceCases: [], previewCases: [], search: '', unavailable: true };

  const db = createDb(env.DB);
  const search = url.searchParams.get('q')?.trim() ?? '';
  const [sourceCases, previewCases] = await Promise.all([
    listProductionCasesForPreview(db, search),
    listPreviewCases(db, parentData.workspace.id)
  ]);

  return {
    sourceCases,
    previewCases,
    search,
    workspaceBlocked: parentData.workspace.status !== 'active' || Boolean(parentData.workspaceError)
  };
}

export const actions = {
  clone: async ({ request, locals, platform }) => {
    const env = platform?.env;
    let userId;
    try {
      userId = requirePreviewAdmin({ user: locals.user, env });
    } catch {
      return fail(403, { error: 'Preview Admin access is required.' });
    }
    if (!env?.DB) return fail(503, { error: 'The study database is not configured.' });

    const db = createDb(env.DB);
    const session = await getLivePreviewSession(db, userId);
    if (!session || session.status !== 'active' || Number(session.expiresAt) <= Date.now()) {
      return fail(409, { error: 'The Preview workspace is expired or requires cleanup. Reload the page before continuing.' });
    }

    const formData = await request.formData();
    const sourceCaseId = String(formData.get('source_case_id') ?? '').trim();
    let caseId;
    try {
      caseId = await cloneCaseToPreview(db, {
        previewSessionId: session.id,
        userId,
        sourceCaseId
      });
    } catch (error) {
      if (error instanceof PreviewWorkspaceError) {
        const status = error.code === 'NOT_OWNED' ? 403 : error.code === 'CLEANUP_REQUIRED' ? 409 : 400;
        return fail(status, { error: message(error) });
      }
      throw error;
    }
    redirect(303, `/preview-admin/cases/${encodeURIComponent(caseId)}`);
  }
};
