import { and, asc, eq, isNull } from 'drizzle-orm';

import { cases, questionPrompts, stimulusGroupOptions, stimulusGroupQuestions, stimulusGroups, stimulusOptionQuestions } from './schema.js';
import { StimulusGroupInputError } from './stimulus-family-error.js';
import { requireStimulusGroup } from './stimulus-family-eligibility.js';
import { optionalText, requiredText } from './stimulus-family-input.js';
import { ensurePromptIsNotUsedByAnotherGroup } from './stimulus-family-specificity.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/** @param {LearningDb} db @param {string} promptMd */
async function findOrCreatePrompt(db, promptMd) {
  const existing = (await db.select({ id: questionPrompts.id, isActive: questionPrompts.isActive }).from(questionPrompts).where(and(eq(questionPrompts.promptMd, promptMd), isNull(questionPrompts.previewSessionId))).orderBy(asc(questionPrompts.createdAt)).limit(1))[0];
  if (existing) {
    if (!existing.isActive) await db.update(questionPrompts).set({ isActive: true, updatedAt: new Date() }).where(eq(questionPrompts.id, existing.id));
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.insert(questionPrompts).values({ id, promptMd, isActive: true });
  return id;
}

/** @param {LearningDb} db @param {string} groupId @param {{ originalPromptId?: string|null, promptMd: unknown, answerMd: unknown }} input */
export async function saveStimulusGroupQuestion(db, groupId, input) {
  const group = await requireStimulusGroup(db, groupId);
  const promptMd = requiredText(input.promptMd, 'Question prompt');
  const answerMd = requiredText(input.answerMd, 'Question answer');
  const promptId = await findOrCreatePrompt(db, promptMd);
  if (group.isActive) await ensurePromptIsNotUsedByAnotherGroup(db, group.caseId, promptId, group.id);
  const original = optionalText(input.originalPromptId);
  const duplicate = (await db.select({ id: stimulusGroupQuestions.id, questionPromptId: stimulusGroupQuestions.questionPromptId }).from(stimulusGroupQuestions).where(and(eq(stimulusGroupQuestions.stimulusGroupId, groupId), eq(stimulusGroupQuestions.questionPromptId, promptId))).limit(1))[0];
  if (duplicate && promptId !== original) throw new StimulusGroupInputError('That prompt is already used by this Stimulus Group.');
  if (original) {
    const existing = (await db.select({ id: stimulusGroupQuestions.id }).from(stimulusGroupQuestions).where(and(eq(stimulusGroupQuestions.stimulusGroupId, groupId), eq(stimulusGroupQuestions.questionPromptId, original))).limit(1))[0];
    if (!existing) throw new StimulusGroupInputError('That Stimulus Group question no longer exists.');
    await db.update(stimulusGroupQuestions).set({ questionPromptId: promptId, answerMd, isActive: true, updatedAt: new Date() }).where(eq(stimulusGroupQuestions.id, existing.id));
  } else {
    await db.insert(stimulusGroupQuestions).values({ id: crypto.randomUUID(), stimulusGroupId: groupId, questionPromptId: promptId, answerMd, isActive: true });
  }
  return promptId;
}

/** @param {LearningDb} db @param {string} optionId @param {{ originalPromptId?: string|null, promptMd: unknown, answerMd: unknown }} input */
export async function saveStimulusOptionQuestion(db, optionId, input) {
  const option = (await db.select({ id: stimulusGroupOptions.id, groupId: stimulusGroupOptions.stimulusGroupId, isActive: stimulusGroupOptions.isActive, groupIsActive: stimulusGroups.isActive }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).innerJoin(cases, eq(cases.id, stimulusGroups.caseId)).where(and(eq(stimulusGroupOptions.id, optionId), eq(stimulusGroupOptions.removedFromCase, false), eq(cases.isActive, true), isNull(cases.previewSessionId))).limit(1))[0];
  if (!option) throw new StimulusGroupInputError('The selected Stimulus Option is missing or inactive.');
  const group = await requireStimulusGroup(db, option.groupId);
  const promptMd = requiredText(input.promptMd, 'Question prompt');
  const answerMd = requiredText(input.answerMd, 'Question answer');
  const promptId = await findOrCreatePrompt(db, promptMd);
  if (option.groupIsActive && option.isActive) await ensurePromptIsNotUsedByAnotherGroup(db, group.caseId, promptId, group.id);
  const original = optionalText(input.originalPromptId);
  const duplicate = (await db.select({ id: stimulusOptionQuestions.id, questionPromptId: stimulusOptionQuestions.questionPromptId }).from(stimulusOptionQuestions).where(and(eq(stimulusOptionQuestions.stimulusGroupOptionId, option.id), eq(stimulusOptionQuestions.questionPromptId, promptId))).limit(1))[0];
  if (duplicate && promptId !== original) throw new StimulusGroupInputError('That prompt is already used by this Stimulus Option.');
  if (original) {
    const existing = (await db.select({ id: stimulusOptionQuestions.id }).from(stimulusOptionQuestions).where(and(eq(stimulusOptionQuestions.stimulusGroupOptionId, option.id), eq(stimulusOptionQuestions.questionPromptId, original))).limit(1))[0];
    if (!existing) throw new StimulusGroupInputError('That Stimulus Option question no longer exists.');
    await db.update(stimulusOptionQuestions).set({ questionPromptId: promptId, answerMd, isActive: true, updatedAt: new Date() }).where(eq(stimulusOptionQuestions.id, existing.id));
  } else {
    await db.insert(stimulusOptionQuestions).values({ id: crypto.randomUUID(), stimulusGroupOptionId: option.id, questionPromptId: promptId, answerMd, isActive: true });
  }
  return promptId;
}

/** @param {LearningDb} db @param {string} groupId @param {string} promptId */
export async function removeStimulusGroupQuestion(db, groupId, promptId) {
  await requireStimulusGroup(db, groupId);
  await db.update(stimulusGroupQuestions).set({ isActive: false, updatedAt: new Date() }).where(and(eq(stimulusGroupQuestions.stimulusGroupId, groupId), eq(stimulusGroupQuestions.questionPromptId, promptId)));
}

/** @param {LearningDb} db @param {string} optionId @param {string} promptId */
export async function removeStimulusOptionQuestion(db, optionId, promptId) {
  const option = (await db.select({ groupId: stimulusGroupOptions.stimulusGroupId }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.id, optionId)).limit(1))[0];
  if (!option) throw new StimulusGroupInputError('The selected Stimulus Option is missing or inactive.');
  await requireStimulusGroup(db, option.groupId);
  await db.update(stimulusOptionQuestions).set({ isActive: false, updatedAt: new Date() }).where(and(eq(stimulusOptionQuestions.stimulusGroupOptionId, optionId), eq(stimulusOptionQuestions.questionPromptId, promptId)));
}
