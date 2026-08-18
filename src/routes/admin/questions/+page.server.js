import { isNull } from 'drizzle-orm';

import { createDb } from '$lib/server/db/index.js';
import { listAdminConcepts } from '$lib/server/db/admin-content.js';
import { questionPrompts } from '$lib/server/db/schema.js';
import { listQuestionLibraryWithShared } from '$lib/server/db/shared-question-prompt-usage.js';
import { listActiveTags, listCurrentPromptTagAssignments } from '$lib/server/db/tag-library.js';

export async function load({ platform, url }) {
  const filters = {
    search: url.searchParams.get('q')?.trim() ?? '',
    topicId: url.searchParams.get('topic')?.trim() ?? '',
    scope: /** @type {'all' | 'shared' | 'case'} */ (url.searchParams.get('scope') ?? 'all'),
    tagId: url.searchParams.get('tag')?.trim() ?? ''
  };

  if (!platform?.env?.DB) {
    return { questions: [], topics: [], tags: [], filters };
  }

  const db = createDb(platform.env.DB);
  const [questionRows, topics, tags, assignments, productionPromptRows] = await Promise.all([
    listQuestionLibraryWithShared(db, filters),
    listAdminConcepts(db),
    listActiveTags(db),
    listCurrentPromptTagAssignments(db),
    db.select({ id: questionPrompts.id }).from(questionPrompts).where(isNull(questionPrompts.previewSessionId))
  ]);
  const productionPromptIds = new Set(productionPromptRows.map((row) => row.id));

  const tagsByPrompt = new Map();
  for (const assignment of assignments) {
    if (!productionPromptIds.has(assignment.promptId)) continue;
    const current = tagsByPrompt.get(assignment.promptId) ?? new Map();
    current.set(assignment.tagId, assignment.tagName);
    tagsByPrompt.set(assignment.promptId, current);
  }

  const questions = questionRows
    .filter((question) => productionPromptIds.has(question.id))
    .map((question) => ({
      ...question,
      tags: [...(tagsByPrompt.get(question.id) ?? new Map()).entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name))
    }));

  return {
    questions: filters.tagId
      ? questions.filter((question) => question.tags.some((tag) => tag.id === filters.tagId))
      : questions,
    topics,
    tags,
    filters
  };
}
