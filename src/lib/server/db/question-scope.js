import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import {
  assets,
  caseAssets,
  caseConcepts,
  caseQuestions,
  cases,
  conceptQuestions,
  concepts,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroups,
  stimulusOptionQuestions
} from './schema.js';
import {
  ensurePromptIsNotUsedByAnotherGroup,
  saveStimulusOptionQuestion,
  StimulusGroupInputError
} from './stimulus-groups.js';
import { CaseQuestionInputError, moveCaseQuestionToStimulusOption, saveCaseQuestion } from './case-questions.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/** @param {unknown} value @param {string} label */
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new CaseQuestionInputError(`${label} is required.`);
  return text;
}

/** @param {unknown} value */
function checked(value) {
  return value === true || value === 'on' || value === 'true' || value === '1';
}

/** @param {string} target */
function parseTarget(target) {
  const separator = target.indexOf(':');
  if (separator < 1) throw new CaseQuestionInputError('Choose a specific image / stimulus.');
  const kind = target.slice(0, separator);
  const id = target.slice(separator + 1).trim();
  if (!id || !['fixed', 'option'].includes(kind)) throw new CaseQuestionInputError('Choose a specific image / stimulus.');
  return { kind, id };
}

/** @param {LearningDb} db */
function requireAtomicBatch(db) {
  if (typeof db.batch !== 'function') throw new CaseQuestionInputError('Atomic fixed-image question assignment requires D1 batch support.');
}

/** @param {LearningDb} db @param {string} caseId */
async function requireProductionCaseContext(db, caseId) {
  const row = (
    await db
      .select({ caseId: cases.id, conceptId: caseConcepts.conceptId })
      .from(cases)
      .innerJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
      .innerJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(and(eq(cases.id, caseId), eq(cases.isActive, true), isNull(cases.previewSessionId), eq(concepts.isActive, true)))
      .limit(1)
  )[0];
  if (!row) throw new CaseQuestionInputError('The selected Case or its primary topic is missing or inactive.');
  return row;
}

/** @param {LearningDb} db @param {string} caseId @param {string} optionId */
async function requireActiveOptionTarget(db, caseId, optionId) {
  const option = (
    await db
      .select({ id: stimulusGroupOptions.id, assetId: stimulusGroupOptions.assetId })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .where(and(
        eq(stimulusGroupOptions.id, optionId),
        eq(stimulusGroups.caseId, caseId),
        eq(stimulusGroupOptions.isActive, true),
        eq(stimulusGroupOptions.removedFromCase, false),
        eq(stimulusGroups.isActive, true)
      ))
      .limit(1)
  )[0];
  if (!option) throw new CaseQuestionInputError('Choose an active image from this Case.');

  const asset = (
    await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.id, option.assetId), eq(assets.isActive, true), eq(assets.type, 'image'), isNull(assets.previewSessionId)))
      .limit(1)
  )[0];
  if (!asset) throw new CaseQuestionInputError('The selected image is missing or inactive.');
  return option;
}

/** @param {LearningDb} db @param {string} promptMd */
async function findOrCreateProductionPrompt(db, promptMd) {
  const existing = (
    await db
      .select({ id: questionPrompts.id, isActive: questionPrompts.isActive, previewSessionId: questionPrompts.previewSessionId })
      .from(questionPrompts)
      .where(eq(questionPrompts.promptMd, promptMd))
      .orderBy(asc(questionPrompts.createdAt), asc(questionPrompts.id))
      .limit(1)
  )[0];
  if (existing && !existing.previewSessionId) {
    if (!existing.isActive) await db.update(questionPrompts).set({ isActive: true, updatedAt: new Date() }).where(eq(questionPrompts.id, existing.id));
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.insert(questionPrompts).values({ id, promptMd, previewSessionId: null, isActive: true });
  return id;
}

/** @param {LearningDb} db @param {string} optionId */
async function nextOptionQuestionTime(db, optionId) {
  const row = (
    await db.select({ createdAt: stimulusOptionQuestions.createdAt }).from(stimulusOptionQuestions).where(eq(stimulusOptionQuestions.stimulusGroupOptionId, optionId)).orderBy(desc(stimulusOptionQuestions.createdAt)).limit(1)
  )[0];
  const latest = row?.createdAt instanceof Date ? row.createdAt.getTime() : Number(row?.createdAt ?? 0);
  return new Date(Math.max(Date.now(), Number.isFinite(latest) ? latest + 1 : 0));
}

/** @param {string | null | undefined} filename @param {string} assetId */
function automaticGroupName(filename, assetId) {
  const cleaned = String(filename ?? '').trim().replace(/\.(png|jpe?g)$/i, '');
  return `Image-specific — ${cleaned || assetId.slice(0, 8)}`;
}

/** @param {LearningDb} db @param {string} caseId @param {string} assetId */
async function prepareFixedTarget(db, caseId, assetId) {
  await requireProductionCaseContext(db, caseId);
  const fixed = (
    await db
      .select({ captionMd: caseAssets.captionMd, originalFilename: assets.originalFilename, assetIsActive: assets.isActive, assetType: assets.type, assetPreviewSessionId: assets.previewSessionId })
      .from(caseAssets)
      .innerJoin(assets, eq(assets.id, caseAssets.assetId))
      .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)))
      .limit(1)
  )[0];
  if (!fixed || !fixed.assetIsActive || fixed.assetType !== 'image' || fixed.assetPreviewSessionId) throw new CaseQuestionInputError('Choose an active fixed image from this Case.');

  const duplicateOption = (
    await db.select({ id: stimulusGroupOptions.id }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusGroupOptions.assetId, assetId))).limit(1)
  )[0];
  if (duplicateOption) throw new CaseQuestionInputError('That image is already used as an alternative stimulus in this Case.');

  const lastGroup = (
    await db.select({ displayOrder: stimulusGroups.displayOrder }).from(stimulusGroups).where(eq(stimulusGroups.caseId, caseId)).orderBy(desc(stimulusGroups.displayOrder)).limit(1)
  )[0];
  const remaining = (
    await db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(eq(caseAssets.caseId, caseId)).orderBy(asc(caseAssets.displayOrder))
  ).filter((row) => row.assetId !== assetId);

  return {
    groupId: crypto.randomUUID(),
    optionId: crypto.randomUUID(),
    assetId,
    captionMd: fixed.captionMd,
    groupName: automaticGroupName(fixed.originalFilename, assetId),
    groupDisplayOrder: (lastGroup?.displayOrder ?? -1) + 1,
    remaining
  };
}

/** @param {LearningDb} db @param {string} caseId @param {Awaited<ReturnType<typeof prepareFixedTarget>>} prepared */
function fixedConversionWrites(db, caseId, prepared) {
  return [
    db.insert(stimulusGroups).values({ id: prepared.groupId, caseId, name: prepared.groupName, displayOrder: prepared.groupDisplayOrder, selectionCount: 1, specificQuestionMode: 'none', minimumSpecificQuestions: null, isActive: true }),
    db.insert(stimulusGroupOptions).values({ id: prepared.optionId, stimulusGroupId: prepared.groupId, assetId: prepared.assetId, displayOrder: 0, captionMd: prepared.captionMd, isActive: true }),
    db.delete(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, prepared.assetId))),
    ...prepared.remaining.map((row, index) => db.update(caseAssets).set({ displayOrder: index }).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, row.assetId))))
  ];
}

/** @param {LearningDb} db @param {{ caseId: unknown, scope: unknown, target?: unknown, promptMd: unknown, answerMd: unknown, reusableForTopic?: unknown }} input */
export async function saveQuestionAtScope(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const scope = requiredText(input.scope || 'case', 'Question scope');
  if (scope === 'case') {
    return saveCaseQuestion(db, { caseId, promptMd: requiredText(input.promptMd, 'Question prompt'), answerMd: requiredText(input.answerMd, 'Question answer'), reusableForTopic: input.reusableForTopic });
  }
  if (scope !== 'stimulus') throw new CaseQuestionInputError('Question scope must be this whole Case or a specific image / stimulus.');
  if (checked(input.reusableForTopic)) throw new CaseQuestionInputError('A stimulus-specific question cannot also be shared with the Topic.');

  const target = parseTarget(requiredText(input.target, 'Specific image'));
  const promptMd = requiredText(input.promptMd, 'Question prompt');
  const answerMd = requiredText(input.answerMd, 'Question answer');
  if (target.kind === 'option') {
    await requireProductionCaseContext(db, caseId);
    await requireActiveOptionTarget(db, caseId, target.id);
    try {
      return await saveStimulusOptionQuestion(db, target.id, { promptMd, answerMd });
    } catch (error) {
      if (error instanceof StimulusGroupInputError) throw new CaseQuestionInputError(error.message);
      throw error;
    }
  }

  const prepared = await prepareFixedTarget(db, caseId, target.id);
  requireAtomicBatch(db);
  const promptId = await findOrCreateProductionPrompt(db, promptMd);
  try {
    await ensurePromptIsNotUsedByAnotherGroup(db, caseId, promptId, prepared.groupId);
  } catch (error) {
    if (error instanceof StimulusGroupInputError) throw new CaseQuestionInputError(error.message);
    throw error;
  }
  /** @type {any[]} */
  const writes = [
    ...fixedConversionWrites(db, caseId, prepared),
    db.insert(stimulusOptionQuestions).values({ id: crypto.randomUUID(), stimulusGroupOptionId: prepared.optionId, questionPromptId: promptId, answerMd, isActive: true, createdAt: await nextOptionQuestionTime(db, prepared.optionId) })
  ];
  await db.batch(/** @type {[any, ...any[]]} */ (writes));
  return promptId;
}

/** @param {LearningDb} db @param {{ caseId: unknown, promptId: unknown, target: unknown }} input */
export async function moveCaseQuestionToStimulusTarget(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const promptId = requiredText(input.promptId, 'Case question');
  const target = parseTarget(requiredText(input.target, 'Specific image'));
  if (target.kind === 'option') return moveCaseQuestionToStimulusOption(db, { caseId, promptId, optionId: target.id });

  const context = await requireProductionCaseContext(db, caseId);
  const question = (
    await db.select({ id: caseQuestions.id, answerMd: caseQuestions.answerMd }).from(caseQuestions).innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId)).where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, promptId), eq(caseQuestions.isActive, true), eq(questionPrompts.isActive, true), isNull(questionPrompts.previewSessionId))).limit(1)
  )[0];
  if (!question) throw new CaseQuestionInputError('That Case question no longer exists or is inactive.');

  const prepared = await prepareFixedTarget(db, caseId, target.id);
  requireAtomicBatch(db);
  try {
    await ensurePromptIsNotUsedByAnotherGroup(db, caseId, promptId, prepared.groupId);
  } catch (error) {
    if (error instanceof StimulusGroupInputError) throw new CaseQuestionInputError(error.message);
    throw error;
  }

  const otherCaseUses = await db
    .select({ caseId: caseQuestions.caseId })
    .from(caseQuestions)
    .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
    .innerJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
    .where(and(eq(caseQuestions.questionPromptId, promptId), eq(caseQuestions.isActive, true), eq(cases.isActive, true), eq(caseConcepts.conceptId, context.conceptId)));

  /** @type {any[]} */
  const writes = [
    ...fixedConversionWrites(db, caseId, prepared),
    db.insert(stimulusOptionQuestions).values({ id: crypto.randomUUID(), stimulusGroupOptionId: prepared.optionId, questionPromptId: promptId, answerMd: question.answerMd, isActive: true, createdAt: await nextOptionQuestionTime(db, prepared.optionId) }),
    db.update(caseQuestions).set({ isActive: false, updatedAt: new Date() }).where(eq(caseQuestions.id, question.id))
  ];
  if (!otherCaseUses.some((row) => row.caseId !== caseId)) writes.push(db.delete(conceptQuestions).where(and(eq(conceptQuestions.conceptId, context.conceptId), eq(conceptQuestions.questionPromptId, promptId))));
  await db.batch(/** @type {[any, ...any[]]} */ (writes));
  return promptId;
}
