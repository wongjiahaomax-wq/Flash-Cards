import { and, asc, eq, isNull } from 'drizzle-orm';

import {
  getQuestionPromptDetail,
  listQuestionLibrary,
  QuestionPromptInputError,
  updateQuestionPrompt
} from './question-library.js';
import { assetQuestions, questionPrompts } from './schema.js';
import { sharedQuestions, tags } from './tag-schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/** @param {unknown} value */
function expectedCount(value) {
  if (value == null || value === '') return null;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) throw new QuestionPromptInputError('The usage snapshot is invalid. Reload the prompt and try again.');
  return count;
}

/** @param {unknown} value */
function confirmed(value) { return value === true || value === 'on' || value === 'true' || value === '1'; }

/** @param {LearningDb} db @param {string} promptId */
export async function listPromptSharedQuestionUsages(db, promptId) {
  return db.select({ id: sharedQuestions.id, answerMd: sharedQuestions.answerMd, isActive: sharedQuestions.isActive, reuseScopeTagId: sharedQuestions.reuseScopeTagId, reuseScopeTagName: tags.name, reuseScopeTagIsActive: tags.isActive }).from(sharedQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
    .innerJoin(tags, eq(tags.id, sharedQuestions.reuseScopeTagId))
    .where(and(eq(sharedQuestions.questionPromptId, promptId), isNull(questionPrompts.previewSessionId)))
    .orderBy(asc(tags.name), asc(sharedQuestions.createdAt), asc(sharedQuestions.id));
}

/** @param {LearningDb} db @param {string} promptId */
export async function listPromptAssetQuestionUsages(db, promptId) {
  return db.select({ id: assetQuestions.id, assetId: assetQuestions.assetId, answerMd: assetQuestions.answerMd, isActive: assetQuestions.isActive })
    .from(assetQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, assetQuestions.questionPromptId))
    .where(and(eq(assetQuestions.questionPromptId, promptId), isNull(questionPrompts.previewSessionId)))
    .orderBy(asc(assetQuestions.createdAt), asc(assetQuestions.id));
}

/** @param {LearningDb} db */
async function listActiveSharedQuestionPromptUsages(db) {
  return db.select({ id: sharedQuestions.id, promptId: sharedQuestions.questionPromptId, answerMd: sharedQuestions.answerMd }).from(sharedQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
    .where(and(eq(sharedQuestions.isActive, true), eq(questionPrompts.isActive, true), isNull(questionPrompts.previewSessionId)))
    .orderBy(asc(sharedQuestions.questionPromptId), asc(sharedQuestions.createdAt), asc(sharedQuestions.id));
}

/** @param {LearningDb} db */
async function listActiveAssetQuestionPromptUsages(db) {
  return db.select({ id: assetQuestions.id, promptId: assetQuestions.questionPromptId, answerMd: assetQuestions.answerMd }).from(assetQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, assetQuestions.questionPromptId))
    .where(and(eq(assetQuestions.isActive, true), eq(questionPrompts.isActive, true), isNull(questionPrompts.previewSessionId)))
    .orderBy(asc(assetQuestions.questionPromptId), asc(assetQuestions.createdAt), asc(assetQuestions.id));
}

/** @param {LearningDb} db @param {{ search?: string, topicId?: string, scope?: 'all'|'shared'|'case' }} [filters] */
export async function listQuestionLibraryWithShared(db, filters = {}) {
  const topicId = String(filters.topicId ?? '').trim();
  const search = String(filters.search ?? '').trim().toLocaleLowerCase();
  const scope = filters.scope === 'shared' || filters.scope === 'case' ? filters.scope : 'all';
  const [allRows, legacySearchRows, sharedUsageRows, assetUsageRows] = await Promise.all([
    listQuestionLibrary(db, { topicId, scope: 'all' }),
    search ? listQuestionLibrary(db, { search: filters.search, topicId, scope: 'all' }) : Promise.resolve([]),
    listActiveSharedQuestionPromptUsages(db),
    listActiveAssetQuestionPromptUsages(db)
  ]);
  const legacySearchIds = new Set(legacySearchRows.map((row) => row.id));
  /** @param {{ promptId: string, answerMd: string }[]} rows */
  const byPrompt = (rows) => {
    const map = new Map();
    for (const usage of rows) { const current = map.get(usage.promptId) ?? []; current.push(usage); map.set(usage.promptId, current); }
    return map;
  };
  const sharedByPrompt = byPrompt(sharedUsageRows);
  const assetByPrompt = byPrompt(assetUsageRows);
  return allRows.flatMap((row) => {
    const sharedUsages = sharedByPrompt.get(row.id) ?? [];
    const assetUsages = assetByPrompt.get(row.id) ?? [];
    const reusableUsageCount = sharedUsages.length + assetUsages.length;
    const hasSharedUsage = row.hasSharedUsage || reusableUsageCount > 0;
    const hasCaseUsage = row.hasCaseUsage;
    const reusableSearchMatch = [...sharedUsages, ...assetUsages].some((usage) => usage.answerMd.toLocaleLowerCase().includes(search));
    if (search && !legacySearchIds.has(row.id) && !row.promptMd.toLocaleLowerCase().includes(search) && !reusableSearchMatch) return [];
    if (scope === 'shared' && !hasSharedUsage) return [];
    if (scope === 'case' && !hasCaseUsage) return [];
    return [{ ...row, usageCount: row.usageCount + reusableUsageCount, sharedQuestionUsageCount: sharedUsages.length, assetQuestionUsageCount: assetUsages.length, hasSharedUsage, scope: hasSharedUsage && hasCaseUsage ? 'Shared + Case-specific' : hasSharedUsage ? 'Shared' : hasCaseUsage ? 'Case-specific' : 'Unused' }];
  });
}

/** @param {LearningDb} db @param {string} promptId */
export async function getQuestionPromptDetailWithShared(db, promptId) {
  const [detail, sharedQuestionUsages, assetQuestionUsages] = await Promise.all([getQuestionPromptDetail(db, promptId), listPromptSharedQuestionUsages(db, promptId), listPromptAssetQuestionUsages(db, promptId)]);
  if (!detail) return null;
  const activeReusableCount = [...sharedQuestionUsages, ...assetQuestionUsages].filter((usage) => usage.isActive).length;
  return { ...detail, sharedQuestionUsages, assetQuestionUsages, usageCount: detail.usageCount + activeReusableCount, totalUsageCount: detail.totalUsageCount + sharedQuestionUsages.length + assetQuestionUsages.length };
}

/** @param {LearningDb} db @param {{ promptId: string, promptMd: unknown, confirmSharedEdit?: unknown, expectedUsageCount?: unknown }} input */
export async function updateQuestionPromptWithSharedGuard(db, input) {
  const detail = await getQuestionPromptDetail(db, input.promptId);
  if (!detail) throw new QuestionPromptInputError('That Question Prompt no longer exists.');
  const [sharedUsages, assetUsages] = await Promise.all([listPromptSharedQuestionUsages(db, input.promptId), listPromptAssetQuestionUsages(db, input.promptId)]);
  const activeReusableCount = [...sharedUsages, ...assetUsages].filter((usage) => usage.isActive).length;
  const combinedCount = detail.usageCount + activeReusableCount;
  const submittedCount = expectedCount(input.expectedUsageCount);
  if (submittedCount != null && submittedCount !== combinedCount) throw new QuestionPromptInputError('This prompt usage changed while you were editing. Reload it before saving.');
  if (combinedCount > 1 && !confirmed(input.confirmSharedEdit)) throw new QuestionPromptInputError(`This prompt is currently used in ${combinedCount} places. Confirm the shared edit after reviewing its usages.`);
  return updateQuestionPrompt(db, { ...input, expectedUsageCount: detail.usageCount, confirmSharedEdit: true });
}
