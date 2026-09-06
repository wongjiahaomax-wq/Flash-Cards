import { error, fail } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { ensureLearnerPreferences } from '$lib/server/db/fsrs-bootstrap.js';
import { setExpandedLearningPreference } from '$lib/server/db/learner-preferences.js';
import { learnerStudyAccessError } from '$lib/server/learning/learner-study-runtime.js';

/** @param {App.Locals} locals @param {App.Platform | undefined} platform */
function context(locals, platform) {
  const access = learnerStudyAccessError(locals.user, platform?.env);
  if (access) error(access.status, access.message);
  if (!locals.user || !platform?.env?.DB) error(503, 'Study database is not configured.');
  return { user: locals.user, db: createDb(platform.env.DB) };
}

export async function load({ locals, platform }) {
  const { user, db } = context(locals, platform);
  const preferences = await ensureLearnerPreferences(db, user.id);
  return { preferences: { expandedLearning: Boolean(preferences.expandedLearning) } };
}

export const actions = {
  preference: async ({ locals, platform, request }) => {
    const { user, db } = context(locals, platform);
    const formData = await request.formData();
    const expandedLearning = formData.get('expandedLearning') === 'on';
    await setExpandedLearningPreference({ db, userId: user.id, expandedLearning });
    return {
      preferenceSaved: true,
      message: expandedLearning ? 'Expanded Learning enabled.' : 'Expanded Learning disabled.'
    };
  }
};
