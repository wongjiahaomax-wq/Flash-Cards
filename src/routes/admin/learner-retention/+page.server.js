import { error, fail } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import {
  LearnerRetentionError,
  listLearnerDetailedHistoryRetention,
  setLearnerDetailedHistoryRetention
} from '$lib/server/db/fsrs-retention-admin.js';
import { isPreviewWorker, isProductionAdmin } from '$lib/server/preview-auth.js';

/**
 * @param {{ user?: { role?: unknown } | null }} locals
 * @param {{ env?: ({ PREVIEW_MODE?: unknown, DB?: D1Database } & Record<string, unknown>) } | null | undefined} platform
 */
function requireAdminDb(locals, platform) {
  if (isPreviewWorker(platform?.env)) {
    error(403, 'Learner retention administration is unavailable on the Preview Worker.');
  }
  if (!isProductionAdmin(locals.user)) {
    error(403, 'Production Admin access is required.');
  }
  if (!platform?.env?.DB) {
    error(503, 'Learner retention administration requires the application database.');
  }
  return createDb(platform.env.DB);
}

export async function load({ locals, platform }) {
  const db = requireAdminDb(locals, platform);
  return {
    learners: await listLearnerDetailedHistoryRetention(db)
  };
}

export const actions = {
  default: async ({ locals, platform, request }) => {
    const db = requireAdminDb(locals, platform);
    const formData = await request.formData();
    const userId = formData.get('userId');
    const retention = formData.get('retention');

    try {
      const result = await setLearnerDetailedHistoryRetention({
        db,
        userId: typeof userId === 'string' ? userId : '',
        retention
      });
      return {
        saved: true,
        userId: result.userId,
        retention: result.retention,
        message: 'Detailed Scheduled-history retention updated.'
      };
    } catch (cause) {
      if (cause instanceof LearnerRetentionError) {
        return fail(cause.code === 'learner-not-found' ? 404 : 400, {
          saved: false,
          userId: typeof userId === 'string' ? userId : '',
          retention: typeof retention === 'string' ? retention : '',
          message: cause.message
        });
      }
      throw cause;
    }
  }
};
