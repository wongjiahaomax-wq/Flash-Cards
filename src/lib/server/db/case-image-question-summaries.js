import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  assetQuestions,
  assets,
  questionPrompts,
  stimulusOptionAssetQuestions
} from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/**
 * @typedef {{ assetId: string, stimulusOptionId: string | null }} ImageQuestionContext
 * @typedef {{ id: string, assetId: string, promptMd: string, answerMd: string }} ActiveReusableQuestion
 * @typedef {{ stimulusOptionId: string, assetQuestionId: string }} ActiveReusableOptIn
 */

/**
 * Pure count/model helper used by the Case editor and focused tests.
 * Reusable totals include only already-filtered active Asset Questions with
 * active Prompts. An opt-in counts as used only for the exact stimulus option.
 * Fixed images pass stimulusOptionId=null and therefore have zero used rows.
 *
 * @param {ImageQuestionContext[]} contexts
 * @param {ActiveReusableQuestion[]} questions
 * @param {ActiveReusableOptIn[]} optIns
 */
export function buildCaseImageQuestionSummaries(contexts, questions, optIns) {
  /** @type {Map<string, ActiveReusableQuestion[]>} */
  const questionsByAsset = new Map();
  for (const question of questions) {
    const list = questionsByAsset.get(question.assetId) ?? [];
    list.push(question);
    questionsByAsset.set(question.assetId, list);
  }

  /** @type {Map<string, Set<string>>} */
  const usedByOption = new Map();
  for (const optIn of optIns) {
    const ids = usedByOption.get(optIn.stimulusOptionId) ?? new Set();
    ids.add(optIn.assetQuestionId);
    usedByOption.set(optIn.stimulusOptionId, ids);
  }

  return contexts.map((context) => {
    const reusableQuestions = questionsByAsset.get(context.assetId) ?? [];
    const usedIds = context.stimulusOptionId ? (usedByOption.get(context.stimulusOptionId) ?? new Set()) : new Set();
    const rows = reusableQuestions.map((question) => ({ ...question, usedInCase: usedIds.has(question.id) }));
    const used = rows.filter((question) => question.usedInCase).length;
    return {
      assetId: context.assetId,
      stimulusOptionId: context.stimulusOptionId,
      total: rows.length,
      used,
      available: rows.length - used,
      questions: rows
    };
  });
}

/**
 * Load the smallest production-only reusable-question model needed by Case
 * image cards. Archive/reactivation is relationship-preserving: dormant opt-in
 * rows remain in D1, but inactive Asset Questions or Prompts disappear from
 * visible counts until reactivated.
 *
 * @param {LearningDb} db
 * @param {ImageQuestionContext[]} contexts
 */
export async function listCaseImageQuestionSummaries(db, contexts) {
  const normalizedContexts = contexts
    .map((context) => ({ assetId: String(context.assetId ?? '').trim(), stimulusOptionId: context.stimulusOptionId ? String(context.stimulusOptionId).trim() : null }))
    .filter((context) => context.assetId);
  if (!normalizedContexts.length) return [];

  const assetIds = [...new Set(normalizedContexts.map((context) => context.assetId))];
  const optionIds = [...new Set(normalizedContexts.flatMap((context) => context.stimulusOptionId ? [context.stimulusOptionId] : []))];

  const questions = await db.select({
    id: assetQuestions.id,
    assetId: assetQuestions.assetId,
    promptMd: questionPrompts.promptMd,
    answerMd: assetQuestions.answerMd
  })
    .from(assetQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, assetQuestions.questionPromptId))
    .innerJoin(assets, eq(assets.id, assetQuestions.assetId))
    .where(and(
      inArray(assetQuestions.assetId, assetIds),
      eq(assetQuestions.isActive, true),
      eq(questionPrompts.isActive, true),
      isNull(questionPrompts.previewSessionId),
      isNull(assets.previewSessionId)
    ));

  const optIns = optionIds.length
    ? await db.select({
        stimulusOptionId: stimulusOptionAssetQuestions.stimulusGroupOptionId,
        assetQuestionId: stimulusOptionAssetQuestions.assetQuestionId
      })
        .from(stimulusOptionAssetQuestions)
        .innerJoin(assetQuestions, eq(assetQuestions.id, stimulusOptionAssetQuestions.assetQuestionId))
        .innerJoin(questionPrompts, eq(questionPrompts.id, assetQuestions.questionPromptId))
        .where(and(
          inArray(stimulusOptionAssetQuestions.stimulusGroupOptionId, optionIds),
          eq(assetQuestions.isActive, true),
          eq(questionPrompts.isActive, true),
          isNull(questionPrompts.previewSessionId)
        ))
    : [];

  return buildCaseImageQuestionSummaries(normalizedContexts, questions, optIns);
}
