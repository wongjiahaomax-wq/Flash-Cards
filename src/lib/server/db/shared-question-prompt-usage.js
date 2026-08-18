import { and, asc, eq, isNull } from 'drizzle-orm';

import {
  getQuestionPromptDetail,
  listQuestionLibrary,
  QuestionPromptInputError,
  updateQuestionPrompt
} from './question-library.js';
import { questionPrompts } from './schema.js';
import { sharedQuestions, tags } from './tag-schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/** @param {unknown} value */
function expectedCount(value) {
  if (value == null || value === '') return null;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new QuestionPromptInputError('The usage snapshot is invalid. Reload the prompt and try again.');
  }
  return count;
}

/** @param {unknown} value */
function confirmed(value) {
  return value === true || value === 'on' || value === 'true' || value === '1';
}

/** @param {LearningDb} db @param {string} promptId */
export async function listPromptSharedQuestionUsages(db, promptId) {
  return db.select({
    id: sharedQuestions.id,
    answerMd: sharedQuestions.answerMd,
    isActive: sharedQuestions.isActive,
    reuseScopeTagId: sharedQuestions.reuseScopeTagId,
    reuseScopeTagName: tags.name,
    reuseScopeTagIsActive: tags.isActive
  }).from(sharedQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
    .innerJoin(tags, eq(tags.id, sharedQuestions.reuseScopeTagId))
    .where(and(eq(sharedQuestions.questionPromptId, promptId), isNull(questionPrompts.previewSessionId)))
    .orderBy(asc(tags.name), asc(sharedQuestions.createdAt), asc(sharedQuestions.id));
}

/** @param {LearningDb} db */
async function listActiveSharedQuestionPromptUsages(db) {
  return db.select({
    id: sharedQuestions.id,
    promptId: sharedQuestions.questionPromptId,
    answerMd: sharedQuestions.answerMd
  }).from(sharedQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
    .where(and(
      eq(sharedQuestions.isActive, true),
      eq(questionPrompts.isActive, true),
      isNull(questionPrompts.previewSessionId)
    ))
    .orderBy(asc(sharedQuestions.questionPromptId), asc(sharedQuestions.createdAt), asc(sharedQuestions.id));
}

/**
 * Main Questions Library view with Shared Question usages folded into the same
 * usage/status model as Concept, Case, and stimulus usages.
 *
 * @param {LearningDb} db
 * @param {{ search?: string, topicId?: string, scope?: 'all'|'shared'|'case' }} [filters]
 */
export async function listQuestionLibraryWithShared(db, filters = {}) {
  const topicId = String(filters.topicId ?? '').trim();
  const search = String(filters.search ?? '').trim().toLocaleLowerCase();
  const scope = filters.scope === 'shared' || filters.scope === 'case' ? filters.scope : 'all';
  const [allRows, legacySearchRows, sharedUsageRows] = await Promise.all([
    listQuestionLibrary(db, { topicId, scope: 'all' }),
    search ? listQuestionLibrary(db, { search: filters.search, topicId, scope: 'all' }) : Promise.resolve([]),
    listActiveSharedQuestionPromptUsages(db)
  ]);

  const legacySearchIds = new Set(legacySearchRows.map((row) => row.id));
  /** @type {Map<string, { id: string, promptId: string, answerMd: string }[]>} */
  const sharedByPrompt = new Map();
  for (const usage of sharedUsageRows) {
    const current = sharedByPrompt.get(usage.promptId) ?? [];
    current.push(usage);
    sharedByPrompt.set(usage.promptId, current);
  }

  return allRows.flatMap((row) => {
    const sharedUsages = sharedByPrompt.get(row.id) ?? [];
    const sharedQuestionUsageCount = sharedUsages.length;
    const hasSharedUsage = row.hasSharedUsage || sharedQuestionUsageCount > 0;
    const hasCaseUsage = row.hasCaseUsage;
    const sharedSearchMatch = sharedUsages.some((usage) => usage.answerMd.toLocaleLowerCase().includes(search));

    if (search && !legacySearchIds.has(row.id) && !row.promptMd.toLocaleLowerCase().includes(search) && !sharedSearchMatch) return [];
    if (scope === 'shared' && !hasSharedUsage) return [];
    if (scope === 'case' && !hasCaseUsage) return [];

    return [{
      ...row,
      usageCount: row.usageCount + sharedQuestionUsageCount,
      sharedQuestionUsageCount,
      hasSharedUsage,
      scope: hasSharedUsage && hasCaseUsage
        ? 'Shared + Case-specific'
        : hasSharedUsage
          ? 'Shared'
          : hasCaseUsage
            ? 'Case-specific'
            : 'Unused'
    }];
  });
}

/** @param {LearningDb} db @param {string} promptId */
export async function getQuestionPromptDetailWithShared(db, promptId) {
  const [detail, sharedQuestionUsages] = await Promise.all([
    getQuestionPromptDetail(db, promptId),
    listPromptSharedQuestionUsages(db, promptId)
  ]);
  if (!detail) return null;
  const activeSharedCount = sharedQuestionUsages.filter((usage) => usage.isActive).length;
  return {
    ...detail,
    sharedQuestionUsages,
    usageCount: detail.usageCount + activeSharedCount,
    totalUsageCount: detail.totalUsageCount + sharedQuestionUsages.length
  };
}

/**
 * Preserve the Questions Library stale-edit/blast-radius contract while adding
 * active Shared Questions to the usage count. The underlying helper still
 * protects all pre-Stage-B relationships; this wrapper protects the combined
 * count and then submits the exact legacy count to that helper.
 *
 * @param {LearningDb} db
 * @param {{ promptId: string, promptMd: unknown, confirmSharedEdit?: unknown, expectedUsageCount?: unknown }} input
 */
export async function updateQuestionPromptWithSharedGuard(db, input) {
  const detail = await getQuestionPromptDetail(db, input.promptId);
  if (!detail) throw new QuestionPromptInputError('That Question Prompt no longer exists.');
  const sharedUsages = await listPromptSharedQuestionUsages(db, input.promptId);
  const activeSharedCount = sharedUsages.filter((usage) => usage.isActive).length;
  const combinedCount = detail.usageCount + activeSharedCount;
  const submittedCount = expectedCount(input.expectedUsageCount);
  if (submittedCount != null && submittedCount !== combinedCount) {
    throw new QuestionPromptInputError('This prompt usage changed while you were editing. Reload it before saving.');
  }
  if (combinedCount > 1 && !confirmed(input.confirmSharedEdit)) {
    throw new QuestionPromptInputError(
      `This prompt is currently used in ${combinedCount} places. Confirm the shared edit after reviewing its usages.`
    );
  }
  return updateQuestionPrompt(db, {
    ...input,
    expectedUsageCount: detail.usageCount,
    confirmSharedEdit: true
  });
}
