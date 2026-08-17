import { error, redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { ensurePreviewWorkspace, getLivePreviewSession } from '$lib/server/db/preview-workspace.js';
import { isPreviewAdmin, isPreviewWorker } from '$lib/server/preview-auth.js';

export async function load({ locals, platform, url }) {
  const env = platform?.env;
  if (!isPreviewWorker(env)) error(404, 'Preview Admin is only available on the Preview Worker.');

  if (!locals.user) {
    const destination = encodeURIComponent(url.pathname + url.search);
    redirect(303, `/sign-in?redirect=${destination}`);
  }
  if (!isPreviewAdmin(locals.user)) redirect(303, '/study');
  if (!env?.DB || !env?.MEDIA) error(503, 'Preview storage bindings are not configured.');

  const db = createDb(env.DB);
  let workspace = null;
  let workspaceError = null;
  try {
    workspace = await ensurePreviewWorkspace({ db, bucket: env.MEDIA, userId: locals.user.id });
  } catch (cause) {
    workspace = await getLivePreviewSession(db, locals.user.id);
    workspaceError = cause instanceof Error ? cause.message : 'Preview workspace cleanup failed.';
  }

  if (!workspace) error(503, 'Unable to establish a Preview workspace.');

  return {
    user: locals.user,
    previewMode: true,
    workspace: {
      id: workspace.id,
      status: workspace.status,
      expiresAt: workspace.expiresAt,
      lastError: workspace.lastError ?? workspaceError
    },
    workspaceError
  };
}
