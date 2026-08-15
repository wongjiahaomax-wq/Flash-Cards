import { createDb } from '$lib/server/db/index.js';
import { getTopicDetail } from '$lib/server/db/topic-library.js';

export async function load({ platform, params }) {
  if (!platform?.env?.DB) return { topic: null };
  return { topic: await getTopicDetail(createDb(platform.env.DB), params.conceptId) };
}
