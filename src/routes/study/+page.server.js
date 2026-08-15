import { error, redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { listStudyConcepts, startReview } from '$lib/server/db/learning.js';

export async function load({ platform }) {
  const database = platform?.env?.DB;
  if (!database) return { concepts: [], databaseConfigured: false };

  const db = createDb(database);
  return {
    concepts: await listStudyConcepts(db),
    databaseConfigured: true
  };
}

export const actions = {
  start: async ({ locals, platform, request }) => {
    if (!platform?.env?.DB || !locals.user) throw error(503, 'Study database is not configured.');
    const formData = await request.formData();
    const conceptId = formData.get('conceptId');
    if (typeof conceptId !== 'string' || !conceptId) throw error(400, 'A study topic is required.');
    const reviewId = await startReview({
      db: createDb(platform.env.DB),
      userId: locals.user.id,
      conceptId
    });
    if (!reviewId) throw error(404, 'No active study cases are available for this topic.');
    redirect(303, `/study/${reviewId}`);
  }
};
