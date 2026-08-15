import { createDb } from '$lib/server/db/index.js';
import { listAdminConcepts } from '$lib/server/db/admin-content.js';
import { listQuestionLibrary } from '$lib/server/db/question-library.js';

export async function load({ platform, url }) {
  if (!platform?.env?.DB) {
    return { questions: [], topics: [], filters: { search: '', topicId: '', scope: 'all' } };
  }

  const db = createDb(platform.env.DB);
  const filters = {
    search: url.searchParams.get('q')?.trim() ?? '',
    topicId: url.searchParams.get('topic')?.trim() ?? '',
    scope: /** @type {'all' | 'shared' | 'case'} */ (url.searchParams.get('scope') ?? 'all')
  };

  return {
    questions: await listQuestionLibrary(db, filters),
    topics: await listAdminConcepts(db),
    filters
  };
}
