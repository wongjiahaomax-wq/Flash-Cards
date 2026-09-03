import { error, fail } from '@sveltejs/kit';

import { createAuth } from '$lib/server/auth.js';
import { removeUserWithBetterAuth } from '$lib/server/auth-config.js';
import { createDb } from '$lib/server/db/index.js';
import {
  LearnerAnalyticsError,
  getAdminLearnerTrendSeries,
  getLearnerAnalyticsDetail,
  listLearnerAnalyticsOverview
} from '$lib/server/db/fsrs-admin-analytics.ts';
import {
  LearnerAccountDeletionError,
  advanceLearnerAccountDeletion,
  beginLearnerAccountDeletion
} from '$lib/server/db/learner-account-deletion.ts';
import { isPreviewWorker, isProductionAdmin } from '$lib/server/preview-auth.js';

const MAX_DELETION_STEPS_PER_REQUEST = 8;

/** @param {App.Locals} locals @param {App.Platform | undefined} platform */
function requireAdminContext(locals, platform) {
  if (isPreviewWorker(platform?.env)) {
    error(403, 'Learner analytics are unavailable on the Preview Worker.');
  }
  if (!isProductionAdmin(locals.user)) {
    error(403, 'Production Admin access is required.');
  }
  if (!platform?.env?.DB) {
    error(503, 'Learner analytics require the application database.');
  }
  return {
    db: createDb(platform.env.DB),
    env: platform.env
  };
}

export async function load({ locals, platform, url }) {
  const { db } = requireAdminContext(locals, platform);
  const learners = await listLearnerAnalyticsOverview(db);
  const selectedUserId = url.searchParams.get('learner')?.trim() || learners[0]?.userId || null;
  const selectedExists = selectedUserId && learners.some((learner) => learner.userId === selectedUserId);

  const [trends, selected] = await Promise.all([
    getAdminLearnerTrendSeries(db),
    selectedExists ? getLearnerAnalyticsDetail(db, selectedUserId) : Promise.resolve(null)
  ]);

  return {
    learners,
    selectedUserId: selectedExists ? selectedUserId : null,
    selected,
    trends
  };
}

export const actions = {
  deleteLearner: async ({ locals, platform, request }) => {
    const { db, env } = requireAdminContext(locals, platform);
    const formData = await request.formData();
    const userId = typeof formData.get('userId') === 'string' ? String(formData.get('userId')).trim() : '';
    const confirmEmail = typeof formData.get('confirmEmail') === 'string'
      ? String(formData.get('confirmEmail')).trim()
      : '';

    try {
      const detail = await getLearnerAnalyticsDetail(db, userId, { historyLimit: 1 });
      if (!confirmEmail || confirmEmail.toLowerCase() !== detail.learner.email.toLowerCase()) {
        return fail(400, {
          deleted: false,
          deletionInProgress: false,
          userId,
          message: 'Enter the learner email exactly to confirm permanent account deletion.'
        });
      }

      await beginLearnerAccountDeletion({ db, userId });
      let progress = null;
      for (let step = 0; step < MAX_DELETION_STEPS_PER_REQUEST; step += 1) {
        progress = await advanceLearnerAccountDeletion({ db, userId });
        if (progress.deleted || progress.readyForIdentityDelete) break;
      }

      if (progress?.readyForIdentityDelete) {
        const auth = createAuth(env);
        await removeUserWithBetterAuth(auth, {
          userId,
          headers: request.headers
        });
        return {
          deleted: true,
          deletionInProgress: false,
          userId,
          message: `Deleted learner account ${detail.learner.email}.`
        };
      }

      return {
        deleted: false,
        deletionInProgress: true,
        userId,
        phase: progress?.phase ?? 'auth_verifications',
        message: 'Account access is revoked. Bounded learner-data deletion is still in progress; submit Continue deletion to advance it.'
      };
    } catch (cause) {
      if (cause instanceof LearnerAnalyticsError || cause instanceof LearnerAccountDeletionError) {
        return fail(cause.code === 'learner-not-found' ? 404 : 400, {
          deleted: false,
          deletionInProgress: false,
          userId,
          message: cause.message
        });
      }
      console.error('Learner account deletion failed after access-safe staging.', cause);
      return fail(500, {
        deleted: false,
        deletionInProgress: true,
        userId,
        message: 'Account deletion did not complete. If staging had started, access remains revoked and the operation is safe to retry.'
      });
    }
  }
};
