import { json } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { cleanupPreviewWorkspace, getLivePreviewSession } from '$lib/server/db/preview-workspace.js';
import { requirePreviewAdmin } from '$lib/server/preview-auth.js';

export async function POST({ locals, platform }) {
  const env = platform?.env;
  let userId;
  try {
    userId = requirePreviewAdmin({ user: locals.user, env });
  } catch {
    return json({ error: 'Preview Admin access is required.' }, { status: 403 });
  }
  if (!env?.DB || !env?.MEDIA) return json({ error: 'Preview storage bindings are not configured.' }, { status: 503 });

  const db = createDb(env.DB);
  const session = await getLivePreviewSession(db, userId);
  if (!session) return json({ ok: true, alreadyClean: true });

  try {
    const result = await cleanupPreviewWorkspace({
      db,
      bucket: env.MEDIA,
      previewSessionId: session.id,
      userId
    });
    return json({ ok: true, ...result });
  } catch (cause) {
    return json(
      {
        error: cause instanceof Error ? cause.message : 'Preview cleanup failed. The workspace is retained for retry.'
      },
      { status: 500 }
    );
  }
}
