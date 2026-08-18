import { and, asc, eq, isNull } from 'drizzle-orm';

import {
  getQuestionPromptDetail,
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
