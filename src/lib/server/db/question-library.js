import { and, asc, eq, sql } from 'drizzle-orm';

import {
  caseConcepts,
  caseQuestions,
  cases,
  conceptQuestions,
  concepts,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups,
  stimulusOptionQuestions
} from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class QuestionPromptInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'QuestionPromptInputError';
  }
}

/** @param {unknown} value */
function cleanText(value) {
  return String(value ?? '').trim();
}

/** @param {unknown} value */
function isConfirmed(value) {
  return value === true || value === 'on' || value === 'true' || value === '1';
}

/** @param {unknown} value */
function expectedCount(value) {
  if (value == null || value === '') return null;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new QuestionPromptInputError('The usage snapshot is invalid. Reload the prompt and try again.');
  }
  return count;
}

function activeConceptUsageCondition() {
  return and(
    eq(questionPrompts.isActive, true),
    eq(conceptQuestions.isActive, true),
    eq(concepts.isActive, true)
  );
}

function activeCaseUsageCondition() {
  return and(
    eq(questionPrompts.isActive, true),
    eq(caseQuestions.isActive, true),
    eq(cases.isActive, true)
  );
}

function activeStimulusGroupUsageCondition() {
  return and(eq(questionPrompts.isActive, true), eq(stimulusGroupQuestions.isActive, true), eq(stimulusGroups.isActive, true), eq(cases.isActive, true));
}

function activeStimulusOptionUsageCondition() {
  return and(eq(questionPrompts.isActive, true), eq(stimulusOptionQuestions.isActive, true), eq(stimulusGroupOptions.isActive, true), eq(stimulusGroups.isActive, true), eq(cases.isActive, true));
}

/**
 * Load active relationship rows so list filtering and usage labels use the
 * same definition of a current Question usage.
 *
 * @param {LearningDb} db
 */
async function loadActiveUsageRows(db) {
  const [conceptUsageRows, caseUsageRows, groupUsageRows, optionUsageRows] = await Promise.all([
    db
      .select({
        promptId: conceptQuestions.questionPromptId,
        answerMd: conceptQuestions.answerMd,
        conceptId: concepts.id,
        conceptName: concepts.name,
        inheritToDescendants: conceptQuestions.inheritToDescendants
      })
      .from(conceptQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, conceptQuestions.questionPromptId))
      .innerJoin(concepts, eq(concepts.id, conceptQuestions.conceptId))
      .where(activeConceptUsageCondition())
      .orderBy(asc(concepts.name), asc(conceptQuestions.createdAt)),
    db
      .select({
        promptId: caseQuestions.questionPromptId,
        answerMd: caseQuestions.answerMd,
        caseId: sql.raw('"cases"."id"').as('case_id'),
        caseTitle: cases.title,
        caseIsActive: cases.isActive,
        conceptId: sql.raw('"concepts"."id"').as('concept_id'),
        conceptName: concepts.name
      })
      .from(caseQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
      .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
      .leftJoin(
        caseConcepts,
        and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary'))
      )
      .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(activeCaseUsageCondition())
      .orderBy(asc(cases.title), asc(caseQuestions.createdAt)),
    db
      .select({ promptId: stimulusGroupQuestions.questionPromptId, answerMd: stimulusGroupQuestions.answerMd, caseId: cases.id, caseTitle: cases.title, conceptId: concepts.id, conceptName: concepts.name, stimulusGroupId: stimulusGroups.id, stimulusGroupName: stimulusGroups.name })
      .from(stimulusGroupQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusGroupQuestions.questionPromptId))
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupQuestions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
      .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(activeStimulusGroupUsageCondition())
      .orderBy(asc(cases.title), asc(stimulusGroupQuestions.createdAt)),
    db
      .select({ promptId: stimulusOptionQuestions.questionPromptId, answerMd: stimulusOptionQuestions.answerMd, caseId: cases.id, caseTitle: cases.title, conceptId: concepts.id, conceptName: concepts.name, stimulusGroupId: stimulusGroups.id, stimulusGroupName: stimulusGroups.name, stimulusOptionId: stimulusGroupOptions.id, stimulusOptionAssetId: stimulusGroupOptions.assetId })
      .from(stimulusOptionQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusOptionQuestions.questionPromptId))
      .innerJoin(stimulusGroupOptions, eq(stimulusGroupOptions.id, stimulusOptionQuestions.stimulusGroupOptionId))
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
      .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(activeStimulusOptionUsageCondition())
      .orderBy(asc(cases.title), asc(stimulusOptionQuestions.createdAt))
  ]);

  return { conceptUsageRows, caseUsageRows, groupUsageRows, optionUsageRows };
}

/**
 * List active Question Prompts with their current active usage summary.
 * Search covers prompt text and both relationship answer fields.
 *
 * @param {LearningDb} db
 * @param {{ search?: string, topicId?: string, scope?: 'all' | 'shared' | 'case' }} [filters]
 */
export async function listQuestionLibrary(db, filters = {}) {
  const [promptRows, usageRows] = await Promise.all([
    db
      .select({
        id: questionPrompts.id,
        promptMd: questionPrompts.promptMd,
        isActive: questionPrompts.isActive,
        updatedAt: questionPrompts.updatedAt
      })
      .from(questionPrompts)
      .where(eq(questionPrompts.isActive, true))
      .orderBy(asc(questionPrompts.promptMd), asc(questionPrompts.id)),
    loadActiveUsageRows(db)
  ]);

  const usageByPrompt = new Map();
  for (const row of promptRows) {
    usageByPrompt.set(row.id, { conceptUsages: [], caseUsages: [], groupUsages: [], optionUsages: [] });
  }
  for (const row of usageRows.conceptUsageRows) {
    usageByPrompt.get(row.promptId)?.conceptUsages.push(row);
  }
  for (const row of usageRows.caseUsageRows) {
    usageByPrompt.get(row.promptId)?.caseUsages.push(row);
  }
  for (const row of usageRows.groupUsageRows) usageByPrompt.get(row.promptId)?.groupUsages.push(row);
  for (const row of usageRows.optionUsageRows) usageByPrompt.get(row.promptId)?.optionUsages.push(row);

  const search = cleanText(filters.search).toLocaleLowerCase();
  const topicId = cleanText(filters.topicId);
  const scope = filters.scope === 'shared' || filters.scope === 'case' ? filters.scope : 'all';

  return promptRows.flatMap((prompt) => {
    const usages = usageByPrompt.get(prompt.id) ?? { conceptUsages: [], caseUsages: [], groupUsages: [], optionUsages: [] };
    const allUsages = [...usages.conceptUsages, ...usages.caseUsages, ...usages.groupUsages, ...usages.optionUsages];
    const searchableText = [prompt.promptMd, ...allUsages.map((usage) => usage.answerMd)]
      .join('\n')
      .toLocaleLowerCase();
    const topicIds = new Set(
      allUsages.map((usage) => usage.conceptId).filter((value) => typeof value === 'string')
    );
    const topicNames = [...new Set(allUsages.map((usage) => usage.conceptName).filter(Boolean))].sort();
    const hasSharedUsage = usages.conceptUsages.length > 0;
    const hasCaseUsage = usages.caseUsages.length > 0 || usages.groupUsages.length > 0 || usages.optionUsages.length > 0;

    if (search && !searchableText.includes(search)) return [];
    if (topicId && !topicIds.has(topicId)) return [];
    if (scope === 'shared' && !hasSharedUsage) return [];
    if (scope === 'case' && !hasCaseUsage) return [];

    return [{
      id: prompt.id,
      promptMd: prompt.promptMd,
      isActive: prompt.isActive,
      updatedAt: prompt.updatedAt,
      usageCount: allUsages.length,
      conceptUsageCount: usages.conceptUsages.length,
      caseUsageCount: usages.caseUsages.length,
      stimulusGroupUsageCount: usages.groupUsages.length,
      stimulusOptionUsageCount: usages.optionUsages.length,
      hasSharedUsage,
      hasCaseUsage,
      scope: hasSharedUsage && hasCaseUsage
        ? 'Shared + Case-specific'
        : hasSharedUsage
          ? 'Shared'
          : hasCaseUsage
            ? 'Case-specific'
            : 'Unused',
      topicNames
    }];
  });
}

/**
 * Return all relationship usages for one prompt. Inactive rows are retained
 * here so an administrator can understand historical/archived associations.
 *
 * @param {LearningDb} db
 * @param {string} promptId
 */
export async function getQuestionPromptDetail(db, promptId) {
  const prompt = (
    await db
      .select({
        id: questionPrompts.id,
        promptMd: questionPrompts.promptMd,
        isActive: questionPrompts.isActive,
        updatedAt: questionPrompts.updatedAt
      })
      .from(questionPrompts)
      .where(eq(questionPrompts.id, promptId))
      .limit(1)
  )[0];

  if (!prompt) return null;

  const [conceptUsages, caseUsages, stimulusGroupUsages, stimulusOptionUsages, usageCount] = await Promise.all([
    db
      .select({
        id: sql.raw('"concept_questions"."id"').as('usage_id'),
        conceptId: sql.raw('"concepts"."id"').as('concept_id'),
        conceptName: concepts.name,
        answerMd: conceptQuestions.answerMd,
        inheritToDescendants: conceptQuestions.inheritToDescendants,
        isActive: sql.raw('"concept_questions"."is_active"').as('usage_is_active'),
        conceptIsActive: sql.raw('"concepts"."is_active"').as('concept_is_active')
      })
      .from(conceptQuestions)
      .innerJoin(concepts, eq(concepts.id, conceptQuestions.conceptId))
      .where(eq(conceptQuestions.questionPromptId, promptId))
      .orderBy(asc(concepts.name), asc(conceptQuestions.createdAt)),
    db
      .select({
        id: sql.raw('"case_questions"."id"').as('usage_id'),
        caseId: sql.raw('"cases"."id"').as('case_id'),
        caseTitle: cases.title,
        caseIsActive: sql.raw('"cases"."is_active"').as('case_is_active'),
        conceptId: sql.raw('"concepts"."id"').as('concept_id'),
        conceptName: concepts.name,
        answerMd: caseQuestions.answerMd,
        isActive: sql.raw('"case_questions"."is_active"').as('usage_is_active')
      })
      .from(caseQuestions)
      .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
      .leftJoin(
        caseConcepts,
        and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary'))
      )
      .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(eq(caseQuestions.questionPromptId, promptId))
      .orderBy(asc(cases.title), asc(caseQuestions.createdAt)),
    db
      .select({ id: stimulusGroupQuestions.id, groupId: stimulusGroups.id, groupName: stimulusGroups.name, caseId: cases.id, caseTitle: cases.title, conceptId: concepts.id, conceptName: concepts.name, answerMd: stimulusGroupQuestions.answerMd, isActive: stimulusGroupQuestions.isActive, groupIsActive: stimulusGroups.isActive, caseIsActive: cases.isActive })
      .from(stimulusGroupQuestions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupQuestions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
      .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(eq(stimulusGroupQuestions.questionPromptId, promptId))
      .orderBy(asc(cases.title), asc(stimulusGroupQuestions.createdAt)),
    db
      .select({ id: stimulusOptionQuestions.id, optionId: stimulusGroupOptions.id, assetId: stimulusGroupOptions.assetId, groupId: stimulusGroups.id, groupName: stimulusGroups.name, caseId: cases.id, caseTitle: cases.title, conceptId: concepts.id, conceptName: concepts.name, answerMd: stimulusOptionQuestions.answerMd, isActive: stimulusOptionQuestions.isActive, optionIsActive: stimulusGroupOptions.isActive, groupIsActive: stimulusGroups.isActive, caseIsActive: cases.isActive })
      .from(stimulusOptionQuestions)
      .innerJoin(stimulusGroupOptions, eq(stimulusGroupOptions.id, stimulusOptionQuestions.stimulusGroupOptionId))
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
      .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(eq(stimulusOptionQuestions.questionPromptId, promptId))
      .orderBy(asc(cases.title), asc(stimulusOptionQuestions.createdAt)),
    countActivePromptUsages(db, promptId)
  ]);

  return {
    ...prompt,
    conceptUsages,
    caseUsages,
    stimulusGroupUsages,
    stimulusOptionUsages,
    usageCount,
    totalUsageCount: conceptUsages.length + caseUsages.length + stimulusGroupUsages.length + stimulusOptionUsages.length
  };
}

/** @param {LearningDb} db @param {string} promptId */
async function countActivePromptUsages(db, promptId) {
  const [conceptRows, caseRows, groupRows, optionRows] = await Promise.all([
    db
      .select({ id: conceptQuestions.id })
      .from(conceptQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, conceptQuestions.questionPromptId))
      .innerJoin(concepts, eq(concepts.id, conceptQuestions.conceptId))
      .where(
        and(eq(conceptQuestions.questionPromptId, promptId), activeConceptUsageCondition())
      ),
    db
      .select({ id: caseQuestions.id })
      .from(caseQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
      .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
      .where(and(eq(caseQuestions.questionPromptId, promptId), activeCaseUsageCondition())),
    db
      .select({ id: stimulusGroupQuestions.id })
      .from(stimulusGroupQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusGroupQuestions.questionPromptId))
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupQuestions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(eq(stimulusGroupQuestions.questionPromptId, promptId), activeStimulusGroupUsageCondition())),
    db
      .select({ id: stimulusOptionQuestions.id })
      .from(stimulusOptionQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusOptionQuestions.questionPromptId))
      .innerJoin(stimulusGroupOptions, eq(stimulusGroupOptions.id, stimulusOptionQuestions.stimulusGroupOptionId))
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(eq(stimulusOptionQuestions.questionPromptId, promptId), activeStimulusOptionUsageCondition()))
  ]);
  return conceptRows.length + caseRows.length + groupRows.length + optionRows.length;
}

/**
 * Update only reusable prompt wording. Relationship answers are never changed
 * here. Multi-use prompts require explicit confirmation, and the submitted
 * count protects against saving against a stale usage view.
 *
 * @param {LearningDb} db
 * @param {{ promptId: string, promptMd: unknown, confirmSharedEdit?: unknown, expectedUsageCount?: unknown }} input
 */
export async function updateQuestionPrompt(db, input) {
  const promptId = cleanText(input.promptId);
  const promptMd = cleanText(input.promptMd);
  if (!promptId) throw new QuestionPromptInputError('Question Prompt is required.');
  if (!promptMd) throw new QuestionPromptInputError('Question prompt text is required.');

  const existing = (
    await db.select({ id: questionPrompts.id }).from(questionPrompts).where(eq(questionPrompts.id, promptId)).limit(1)
  )[0];
  if (!existing) throw new QuestionPromptInputError('That Question Prompt no longer exists.');

  const usageCount = await countActivePromptUsages(db, promptId);
  const submittedCount = expectedCount(input.expectedUsageCount);
  if (submittedCount != null && submittedCount !== usageCount) {
    throw new QuestionPromptInputError('This prompt usage changed while you were editing. Reload it before saving.');
  }
  if (usageCount > 1 && !isConfirmed(input.confirmSharedEdit)) {
    throw new QuestionPromptInputError(
      'This prompt is currently used in ' +
        usageCount +
        ' places. Confirm the shared edit after reviewing its usages.'
    );
  }

  await db.update(questionPrompts).set({ promptMd, updatedAt: new Date() }).where(eq(questionPrompts.id, promptId));
  return { promptId, usageCount };
}
