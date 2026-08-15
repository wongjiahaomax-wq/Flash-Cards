import { createDb } from '$lib/server/db/index.js';
import { listTopicLibrary } from '$lib/server/db/topic-library.js';

export async function load({ platform, url }) {
  const filters = { search: url.searchParams.get('q')?.trim() ?? '' };
  if (!platform?.env?.DB) return { topics: [], filters };
  return { topics: await listTopicLibrary(createDb(platform.env.DB), filters), filters };
}
