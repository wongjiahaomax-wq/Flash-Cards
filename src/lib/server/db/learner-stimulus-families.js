import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import {
  assetQuestions,
  assets,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups,
  stimulusOptionAssetQuestions,
  stimulusOptionQuestions
} from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */
/** @typedef {import('../learning/question-pool-mode.ts').QuestionPoolMode} QuestionPoolMode */

/**
 * Select one current learner option for a Family. Curated Families use the
 * Original for Core and a non-Original Alternative for Expanded when one is
 * available. Legacy NULL-Original Families deliberately retain random choice.
 *
 * @template T
 * @param {{ originalOptionId: string | null }} group
 * @param {T[]} options
 * @param {QuestionPoolMode} questionPoolMode
 * @param {() => number} rng
 * @returns {T | null}
 */
function selectStimulusOption(group, options, questionPoolMode, rng) {
  if (options.length === 0) return null;
  const original = group.originalOptionId
    ? options.find((option) => /** @type {{ id?: string }} */ (option).id === group.originalOptionId) ?? null
    : null;
  let pool = options;
  if (original && questionPoolMode === 'core') return original;
  if (original && questionPoolMode === 'expanded') {
    const alternatives = options.filter((option) => /** @type {{ id?: string }} */ (option).id !== group.originalOptionId);
    pool = alternatives.length > 0 ? alternatives : [original];
  }
  const boundedRandom = Math.min(Math.max(rng(), 0), 0.9999999999999999);
  return pool[Math.floor(boundedRandom * pool.length)] ?? null;
}

/**
 * Learner-purpose Stimulus Family read/selection adapter. This module owns only
 * current selection-oriented reads. Review writes and generic question-pool
 * resolution remain in `learning.js` / learner policy modules.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, questionPoolMode: QuestionPoolMode, rng: () => number, prompts: Map<string, string>, fixedAssetCount: number }} input
 */
export async function loadLearnerStimulusFamilies(db, input) {
  const { caseId, questionPoolMode, rng, prompts, fixedAssetCount } = input;
  const groupRows = await db
    .select({
      id: stimulusGroups.id,
      name: stimulusGroups.name,
      displayOrder: stimulusGroups.displayOrder,
      selectionCount: stimulusGroups.selectionCount,
      originalOptionId: stimulusGroups.originalOptionId,
      specificQuestionMode: stimulusGroups.specificQuestionMode,
      minimumSpecificQuestions: stimulusGroups.minimumSpecificQuestions
    })
    .from(stimulusGroups)
    .where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusGroups.isActive, true)))
    .orderBy(asc(stimulusGroups.displayOrder), asc(stimulusGroups.id));
  const groupIds = groupRows.map((group) => group.id);
  const optionRows = groupIds.length
    ? await db
        .select({
          id: stimulusGroupOptions.id,
          stimulusGroupId: stimulusGroupOptions.stimulusGroupId,
          assetId: stimulusGroupOptions.assetId,
          displayOrder: stimulusGroupOptions.displayOrder,
          captionMd: stimulusGroupOptions.captionMd,
          storageKey: assets.storageKey,
          altText: assets.altText,
          sourceLabel: assets.sourceLabel,
          sourceUrl: assets.sourceUrl
        })
        .from(stimulusGroupOptions)
        .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
        .where(and(
          inArray(stimulusGroupOptions.stimulusGroupId, groupIds),
          eq(stimulusGroupOptions.isActive, true),
          eq(stimulusGroupOptions.removedFromCase, false),
          eq(assets.isActive, true),
          isNull(assets.previewSessionId)
        ))
        .orderBy(asc(stimulusGroupOptions.displayOrder), asc(stimulusGroupOptions.id))
    : [];

  /** @type {{ group: typeof groupRows[number], option: typeof optionRows[number] }[]} */
  const selectedOptions = [];
  for (const group of groupRows) {
    if (group.selectionCount !== 1) throw new Error('Only one option per Stimulus Group is supported.');
    const options = optionRows.filter((option) => option.stimulusGroupId === group.id);
    const option = selectStimulusOption(group, options, questionPoolMode, rng);
    if (option) selectedOptions.push({ group, option });
  }

  const selectedOptionIds = selectedOptions.map(({ option }) => option.id);
  const [groupQuestionRows, optionQuestionRows, reusableRows] = await Promise.all([
    groupIds.length
      ? db
          .select({
            stimulusGroupId: stimulusGroupQuestions.stimulusGroupId,
            questionPromptId: stimulusGroupQuestions.questionPromptId,
            answerMd: stimulusGroupQuestions.answerMd,
            isActive: stimulusGroupQuestions.isActive
          })
          .from(stimulusGroupQuestions)
          .where(and(inArray(stimulusGroupQuestions.stimulusGroupId, groupIds), eq(stimulusGroupQuestions.isActive, true)))
      : [],
    selectedOptionIds.length
      ? db
          .select({
            stimulusGroupOptionId: stimulusOptionQuestions.stimulusGroupOptionId,
            questionPromptId: stimulusOptionQuestions.questionPromptId,
            answerMd: stimulusOptionQuestions.answerMd,
            isActive: stimulusOptionQuestions.isActive
          })
          .from(stimulusOptionQuestions)
          .where(and(inArray(stimulusOptionQuestions.stimulusGroupOptionId, selectedOptionIds), eq(stimulusOptionQuestions.isActive, true)))
      : [],
    selectedOptionIds.length
      ? db
          .select({
            stimulusGroupOptionId: stimulusOptionAssetQuestions.stimulusGroupOptionId,
            assetQuestionId: assetQuestions.id,
            assetId: assetQuestions.assetId,
            questionPromptId: assetQuestions.questionPromptId,
            answerMd: assetQuestions.answerMd,
            isActive: assetQuestions.isActive
          })
          .from(stimulusOptionAssetQuestions)
          .innerJoin(assetQuestions, eq(assetQuestions.id, stimulusOptionAssetQuestions.assetQuestionId))
          .where(and(inArray(stimulusOptionAssetQuestions.stimulusGroupOptionId, selectedOptionIds), eq(assetQuestions.isActive, true)))
      : []
  ]);

  const stimulusGroupQuestionsForReview = groupQuestionRows
    .filter((question) => prompts.has(question.questionPromptId) && selectedOptions.some(({ group }) => group.id === question.stimulusGroupId))
    .map((question) => ({ ...question, promptMd: prompts.get(question.questionPromptId) ?? '', stimulusGroupId: question.stimulusGroupId }));
  const reusableAssetQuestions = reusableRows.flatMap((question) => {
    const selected = selectedOptions.find(({ option }) => option.id === question.stimulusGroupOptionId);
    if (!selected || selected.option.assetId !== question.assetId || !prompts.has(question.questionPromptId)) return [];
    return [{
      ...question,
      promptMd: prompts.get(question.questionPromptId) ?? '',
      sourceAssetQuestionId: question.assetQuestionId,
      stimulusGroupId: selected.group.id,
      stimulusOptionId: selected.option.id
    }];
  });
  const stimulusOptionQuestionsForReview = optionQuestionRows.flatMap((question) => {
    const selected = selectedOptions.find(({ option }) => option.id === question.stimulusGroupOptionId);
    if (!selected || !prompts.has(question.questionPromptId)) return [];
    return [{
      ...question,
      promptMd: prompts.get(question.questionPromptId) ?? '',
      stimulusGroupId: selected.group.id,
      stimulusOptionId: selected.option.id
    }];
  });

  return {
    stimulusGroupQuestions: stimulusGroupQuestionsForReview,
    reusableAssetQuestions,
    stimulusOptionQuestions: stimulusOptionQuestionsForReview,
    assets: selectedOptions.map(({ group, option }) => ({
      assetId: option.assetId,
      storageKey: option.storageKey,
      altText: option.altText,
      sourceLabel: option.sourceLabel,
      sourceUrl: option.sourceUrl,
      captionMd: option.captionMd,
      displayOrder: fixedAssetCount + group.displayOrder,
      stimulusGroupId: group.id,
      stimulusOptionId: option.id
    })),
    groupCoverage: selectedOptions.map(({ group }) => ({
      groupId: group.id,
      mode: /** @type {'none'|'minimum'|'all'} */ (group.specificQuestionMode),
      minimum: group.minimumSpecificQuestions ?? 0
    }))
  };
}
