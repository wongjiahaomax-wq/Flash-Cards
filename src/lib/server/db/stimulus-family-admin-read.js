import { and, asc, eq, inArray } from 'drizzle-orm';

import {
  assets,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups,
  stimulusOptionQuestions
} from './schema.js';
import { requireStimulusProductionCase } from './stimulus-family-eligibility.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/** @param {LearningDb} db @param {string} caseId */
export async function getAdminStimulusData(db, caseId) {
  await requireStimulusProductionCase(db, caseId);
  const groups = await db.select().from(stimulusGroups).where(eq(stimulusGroups.caseId, caseId)).orderBy(asc(stimulusGroups.displayOrder), asc(stimulusGroups.createdAt));
  if (!groups.length) return [];
  const groupIds = groups.map((group) => group.id);
  const options = await db
    .select({
      id: stimulusGroupOptions.id,
      stimulusGroupId: stimulusGroupOptions.stimulusGroupId,
      assetId: stimulusGroupOptions.assetId,
      displayOrder: stimulusGroupOptions.displayOrder,
      captionMd: stimulusGroupOptions.captionMd,
      isActive: stimulusGroupOptions.isActive,
      removedFromCase: stimulusGroupOptions.removedFromCase,
      storageKey: assets.storageKey,
      mimeType: assets.mimeType,
      originalFilename: assets.originalFilename,
      altText: assets.altText,
      assetIsActive: assets.isActive
    })
    .from(stimulusGroupOptions)
    .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
    .where(and(inArray(stimulusGroupOptions.stimulusGroupId, groupIds), eq(stimulusGroupOptions.removedFromCase, false)))
    .orderBy(asc(stimulusGroupOptions.displayOrder), asc(stimulusGroupOptions.createdAt));
  const groupQuestions = await db
    .select({ id: stimulusGroupQuestions.id, stimulusGroupId: stimulusGroupQuestions.stimulusGroupId, questionPromptId: stimulusGroupQuestions.questionPromptId, promptMd: questionPrompts.promptMd, answerMd: stimulusGroupQuestions.answerMd, isActive: stimulusGroupQuestions.isActive })
    .from(stimulusGroupQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusGroupQuestions.questionPromptId))
    .where(inArray(stimulusGroupQuestions.stimulusGroupId, groupIds))
    .orderBy(asc(stimulusGroupQuestions.createdAt));
  const optionIds = options.map((option) => option.id);
  const optionQuestions = optionIds.length
    ? await db
        .select({ id: stimulusOptionQuestions.id, stimulusGroupOptionId: stimulusOptionQuestions.stimulusGroupOptionId, questionPromptId: stimulusOptionQuestions.questionPromptId, promptMd: questionPrompts.promptMd, answerMd: stimulusOptionQuestions.answerMd, isActive: stimulusOptionQuestions.isActive })
        .from(stimulusOptionQuestions)
        .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusOptionQuestions.questionPromptId))
        .where(inArray(stimulusOptionQuestions.stimulusGroupOptionId, optionIds))
        .orderBy(asc(stimulusOptionQuestions.createdAt))
    : [];
  return groups.map((group) => ({
    ...group,
    options: options.filter((option) => option.stimulusGroupId === group.id),
    questions: groupQuestions.filter((question) => question.stimulusGroupId === group.id).map((question) => ({ ...question, scope: 'group' })),
    optionQuestions: optionQuestions.filter((question) => options.find((option) => option.id === question.stimulusGroupOptionId)?.stimulusGroupId === group.id).map((question) => ({ ...question, scope: 'option' }))
  }));
}
