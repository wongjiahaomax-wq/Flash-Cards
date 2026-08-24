import { error, fail, redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { listStudyConcepts, startReview, startSystemReview } from '$lib/server/db/learning.js';
import { listStudySystems, StudyNavigationInputError } from '$lib/server/db/study-navigation.ts';
import { QuestionPoolUnavailableError, isQuestionPoolMode } from '$lib/server/learning/question-pool-mode';
import { systemStudyNavigationEnabled } from '$lib/server/learning/system-review-navigation.ts';
import { isPreviewOnlyAdmin, isPreviewWorker } from '$lib/server/preview-auth.js';

/** @param {App.Locals['user']} user @param {App.Platform | undefined} platform */
function assertLearnerStudyAccess(user, platform) {
  if (isPreviewWorker(platform?.env) || isPreviewOnlyAdmin(user)) {
    throw error(403, 'Learner Study is unavailable for Preview-only Admin.');
  }
}

/**
 * @param {unknown} value
 * @returns {{ routeType: import('$lib/server/learning/system-study-routes.ts').SystemRouteType, routeId: string | null } | null}
 */
function parseSystemRoute(value) {
  if (value === 'all') return { routeType: 'all', routeId: null };
  if (typeof value !== 'string') return null;
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const routeType = value.slice(0, separator);
  const routeId = value.slice(separator + 1).trim();
  if ((routeType !== 'topic' && routeType !== 'tag') || !routeId) return null;
  return { routeType, routeId };
}

export async function load({ locals, platform }) {
  assertLearnerStudyAccess(locals.user, platform);
  const enabled = systemStudyNavigationEnabled(platform?.env);
  const database = platform?.env?.DB;
  if (!database) return { concepts: [], systems: [], systemNavigationEnabled: enabled, databaseConfigured: false };

  const db = createDb(database);
  if (enabled) {
    return {
      concepts: [],
      systems: await listStudySystems(db),
      systemNavigationEnabled: true,
      databaseConfigured: true
    };
  }
  return {
    concepts: await listStudyConcepts(db),
    systems: [],
    systemNavigationEnabled: false,
    databaseConfigured: true
  };
}

export const actions = {
  start: async ({ locals, platform, request }) => {
    assertLearnerStudyAccess(locals.user, platform);
    if (!platform?.env?.DB || !locals.user) throw error(503, 'Study database is not configured.');
    const formData = await request.formData();
    const conceptId = formData.get('conceptId');
    const questionPoolMode = formData.get('questionPoolMode');
    if (typeof conceptId !== 'string' || !conceptId) throw error(400, 'A study topic is required.');
    if (!isQuestionPoolMode(questionPoolMode)) throw error(400, 'Choose Original questions or Expanded Learning.');

    let reviewId;
    try {
      reviewId = await startReview({
        db: createDb(platform.env.DB),
        userId: locals.user.id,
        conceptId,
        questionPoolMode
      });
    } catch (cause) {
      if (cause instanceof QuestionPoolUnavailableError) {
        return fail(400, { message: cause.message, conceptId, questionPoolMode });
      }
      throw cause;
    }
    if (!reviewId) throw error(404, 'No active study cases are available for this topic.');
    redirect(303, `/study/${reviewId}`);
  },

  startSystem: async ({ locals, platform, request }) => {
    assertLearnerStudyAccess(locals.user, platform);
    if (!systemStudyNavigationEnabled(platform?.env)) throw error(404, 'System study navigation is not enabled.');
    if (!platform?.env?.DB || !locals.user) throw error(503, 'Study database is not configured.');
    const formData = await request.formData();
    const systemId = formData.get('systemId');
    const routeValue = formData.get('route');
    const questionPoolMode = formData.get('questionPoolMode');
    const route = parseSystemRoute(routeValue);
    if (typeof systemId !== 'string' || !systemId) throw error(400, 'A study System is required.');
    if (!route) throw error(400, 'Choose All, a Topic, or a Tag within this System.');
    if (!isQuestionPoolMode(questionPoolMode)) throw error(400, 'Choose Original questions or Expanded Learning.');

    let reviewId;
    try {
      reviewId = await startSystemReview({
        db: createDb(platform.env.DB),
        userId: locals.user.id,
        systemId,
        routeType: route.routeType,
        routeId: route.routeId,
        questionPoolMode
      });
    } catch (cause) {
      if (cause instanceof QuestionPoolUnavailableError || cause instanceof StudyNavigationInputError) {
        return fail(400, { message: cause.message, systemId, route: routeValue, questionPoolMode });
      }
      throw cause;
    }
    if (!reviewId) throw error(404, 'No active study cases are available for this System route.');
    redirect(303, `/study/${reviewId}`);
  }
};
