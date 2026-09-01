import { error, fail, redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { listStudySystems } from '$lib/server/db/study-navigation.ts';
import { startSystemStudyFromForm } from '$lib/server/learning/start-system-study.ts';
import { isPreviewWorker, isProductionAdmin } from '$lib/server/preview-auth.js';

/** @param {App.Locals['user']} user @param {App.Platform | undefined} platform */
function assertAdminPreviewActionAccess(user, platform) {
  if (isPreviewWorker(platform?.env) || !isProductionAdmin(user)) {
    throw error(403, 'Production Admin access is required for learner study preview.');
  }
  const database = platform?.env?.DB;
  if (!database || !user) throw error(503, 'Study database is not configured.');
  return { database, user };
}

export async function load({ platform }) {
  const database = platform?.env?.DB;
  if (!database) return { systems: [], databaseConfigured: false };
  return {
    systems: await listStudySystems(createDb(database)),
    databaseConfigured: true
  };
}

export const actions = {
  startSystemSelection: async ({ locals, platform, request }) => {
    const context = assertAdminPreviewActionAccess(locals.user, platform);
    const result = await startSystemStudyFromForm({
      db: createDb(context.database),
      userId: context.user.id,
      formData: await request.formData()
    });
    if (!result.ok) return fail(result.status, result.form);
    redirect(303, `/study/${result.reviewId}`);
  }
};
