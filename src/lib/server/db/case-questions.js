import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import {
  assets,
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

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class CaseQuestionInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'CaseQuestionInputError';
  }
}

/** @param {string | null | undefined} value @param {string} label */
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new CaseQuestionInputError(`${label} is required.`);
  return text;
}

/** @param {LearningDb} db @param {string} caseId */
async function requireCaseContext(db, caseId) {
  const rows = await db
    .select({ caseId: cases.id, conceptId: caseConcepts.conceptId })
    .from(cases)
    .innerJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
    .innerJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(and(eq(cases.id, caseId), eq(cases.isActive, true), eq(concepts.isActive, true)))
    .limit(1);
  if (!rows[0]) throw new CaseQuestionInputError('The selected Case or its primary topic is missing or inactive.');
  return rows[0];
}

/** @param {LearningDb} db @param {string} caseId */
async function loadCaseQuestionRows(db, caseId) {
  return db
    .select({
      caseId: caseQuestions.caseId,
      questionPromptId: caseQuestions.questionPromptId,
      promptMd: questionPrompts.promptMd,
      answerMd: caseQuestions.answerMd,
      createdAt: caseQuestions.createdAt,
      isActive: caseQuestions.isActive
    })
    .from(caseQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
    .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.isActive, true)))
    .orderBy(asc(caseQuestions.createdAt), asc(caseQuestions.questionPromptId));
}

/** @param {LearningDb} db @param {string} caseId */
export async function listCaseQuestions(db, caseId) {
  const context = await requireCaseContext(db, caseId);
  const rows = await loadCaseQuestionRows(db, caseId);
  const promptIds = rows.map((row) => row.questionPromptId);
  const reusableRows = promptIds.length
    ? await db
        .select({ questionPromptId: conceptQuestions.questionPromptId })
        .from(conceptQuestions)
        .where(
          and(
            eq(conceptQuestions.conceptId, context.conceptId),
            eq(conceptQuestions.isActive, true),
            inArray(conceptQuestions.questionPromptId, promptIds)
          )
        )
    : [];
  const reusable = new Set(reusableRows.map((row) => row.questionPromptId));
  return rows.map((row) => ({ ...row, reusableForTopic: reusable.has(row.questionPromptId) }));
}

/** @param {LearningDb} db @param {string} promptMd */
async function findOrCreatePrompt(db, promptMd) {
  const existing = await db
    .select({ id: questionPrompts.id, isActive: questionPrompts.isActive })
    .from(questionPrompts)
    .where(eq(questionPrompts.promptMd, promptMd))
    .orderBy(asc(questionPrompts.createdAt), asc(questionPrompts.id))
    .limit(1);
  if (existing[0]) {
    if (!existing[0].isActive) {
      await db
        .update(questionPrompts)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(questionPrompts.id, existing[0].id));
    }
    return existing[0].id;
  }

  const id = crypto.randomUUID();
  await db.insert(questionPrompts).values({ id, promptMd, isActive: true });
  return id;
}

/** @param {unknown} value */
function isChecked(value) {
  return value === true || value === 'on' || value === 'true' || value === '1';
}

/** @param {LearningDb} db @param {string} caseId */
async function nextQuestionTime(db, caseId) {
  const rows = await db
    .select({ createdAt: caseQuestions.createdAt })
    .from(caseQuestions)
    .where(eq(caseQuestions.caseId, caseId))
    .orderBy(desc(caseQuestions.createdAt))
    .limit(1);
  const latest = rows[0]?.createdAt instanceof Date ? rows[0].createdAt.getTime() : Number(rows[0]?.createdAt ?? 0);
  return new Date(Math.max(Date.now(), Number.isFinite(latest) ? latest + 1 : 0));
}

/** @param {LearningDb} db @param {string} optionId */
async function nextStimulusOptionQuestionTime(db, optionId) {
  const rows = await db
    .select({ createdAt: stimulusOptionQuestions.createdAt })
    .from(stimulusOptionQuestions)
    .where(eq(stimulusOptionQuestions.stimulusGroupOptionId, optionId))
    .orderBy(desc(stimulusOptionQuestions.createdAt))
    .limit(1);
  const latest = rows[0]?.createdAt instanceof Date ? rows[0].createdAt.getTime() : Number(rows[0]?.createdAt ?? 0);
  return new Date(Math.max(Date.now(), Number.isFinite(latest) ? latest + 1 : 0));
}

/** @param {LearningDb} db @param {string} conceptId @param {string} promptId @param {string} answerMd */
async function saveReusableTopicQuestion(db, conceptId, promptId, answerMd) {
  const existing = await db
    .select({ id: conceptQuestions.id })
    .from(conceptQuestions)
    .where(and(eq(conceptQuestions.conceptId, conceptId), eq(conceptQuestions.questionPromptId, promptId)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(conceptQuestions)
      .set({ answerMd, isActive: true, updatedAt: new Date() })
      .where(eq(conceptQuestions.id, existing[0].id));
    return;
  }
  await db.insert(conceptQuestions).values({
    id: crypto.randomUUID(),
    conceptId,
    questionPromptId: promptId,
    answerMd,
    inheritToDescendants: false,
    isActive: true
  });
}

/** @param {LearningDb} db @param {string} caseId @param {string} promptId */
async function removeReusableTopicQuestionIfUnused(db, caseId, promptId) {
  const context = await requireCaseContext(db, caseId);
  const otherUses = await db
    .select({ caseId: caseQuestions.caseId })
    .from(caseQuestions)
    .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
    .innerJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
    .where(
      and(
        eq(caseQuestions.questionPromptId, promptId),
        eq(caseQuestions.isActive, true),
        eq(cases.isActive, true),
        eq(caseConcepts.conceptId, context.conceptId)
      )
    );
  if (otherUses.some((row) => row.caseId !== caseId)) return;
  await db
    .delete(conceptQuestions)
    .where(and(eq(conceptQuestions.conceptId, context.conceptId), eq(conceptQuestions.questionPromptId, promptId)));
}

/**
 * Add or edit a Case question. The Case row is always saved; when requested,
 * its answer is also upserted as a primary-Concept question.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, originalPromptId?: string | null, promptMd: string, answerMd: string, reusableForTopic?: unknown }} input
 */
export async function saveCaseQuestion(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const promptMd = requiredText(input.promptMd, 'Question prompt');
  const answerMd = requiredText(input.answerMd, 'Question answer');
  const context = await requireCaseContext(db, caseId);
  const originalPromptId = input.originalPromptId ? String(input.originalPromptId).trim() : null;
  const promptId = await findOrCreatePrompt(db, promptMd);
  const current = originalPromptId
    ? (await db
        .select({ questionPromptId: caseQuestions.questionPromptId, createdAt: caseQuestions.createdAt })
        .from(caseQuestions)
        .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, originalPromptId)))
        .limit(1))[0]
    : null;
  const target =
    promptId !== originalPromptId
      ? (await db
          .select({ questionPromptId: caseQuestions.questionPromptId })
          .from(caseQuestions)
          .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, promptId)))
          .limit(1))[0]
      : null;
  if (!current && originalPromptId) throw new CaseQuestionInputError('That Case question no longer exists.');
  if (target) throw new CaseQuestionInputError('That prompt is already used by another question in this Case.');

  if (current && originalPromptId) {
    await db
      .update(caseQuestions)
      .set({ questionPromptId: promptId, answerMd, isActive: true, updatedAt: new Date() })
      .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, originalPromptId)));
    if (originalPromptId !== promptId) await removeReusableTopicQuestionIfUnused(db, caseId, originalPromptId);
  } else {
    await db.insert(caseQuestions).values({
      id: crypto.randomUUID(),
      caseId,
      questionPromptId: promptId,
      answerMd,
      isActive: true,
      createdAt: await nextQuestionTime(db, caseId)
    });
  }

  if (isChecked(input.reusableForTopic)) {
    await saveReusableTopicQuestion(db, context.conceptId, promptId, answerMd);
  } else {
    await removeReusableTopicQuestionIfUnused(db, caseId, promptId);
  }
  return promptId;
}

/**
 * Move an active Case question to one exact image in an active Alternative image set.
 * The prompt is intentionally reused; the answer remains on the destination
 * relationship so other uses of the same wording are unaffected.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, promptId: string, optionId: string }} input
 */
export async function moveCaseQuestionToStimulusOption(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const promptId = requiredText(input.promptId, 'Case question');
  const optionId = requiredText(input.optionId, 'Specific image');
  const context = await requireCaseContext(db, caseId);

  const question = (
    await db
      .select({
        id: caseQuestions.id,
        questionPromptId: caseQuestions.questionPromptId,
        answerMd: caseQuestions.answerMd
      })
      .from(caseQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
      .where(
        and(
          eq(caseQuestions.caseId, caseId),
          eq(caseQuestions.questionPromptId, promptId),
          eq(caseQuestions.isActive, true),
          eq(questionPrompts.isActive, true)
        )
      )
      .limit(1)
  )[0];
  if (!question) throw new CaseQuestionInputError('That Case question no longer exists or is inactive.');

  const target = (
    await db
      .select({
        id: stimulusGroupOptions.id,
        groupId: stimulusGroupOptions.stimulusGroupId,
        caseId: stimulusGroups.caseId,
        assetId: stimulusGroupOptions.assetId
      })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
      .where(eq(stimulusGroupOptions.id, optionId))
      .limit(1)
  )[0];
  if (!target || target.caseId !== caseId) {
    throw new CaseQuestionInputError('Choose an image from this Case.');
  }
  const [optionStatus, groupStatus, caseStatus, assetStatus] = await Promise.all([
    db.select({ isActive: stimulusGroupOptions.isActive }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.id, target.id)).limit(1),
    db.select({ isActive: stimulusGroups.isActive }).from(stimulusGroups).where(eq(stimulusGroups.id, target.groupId)).limit(1),
    db.select({ isActive: cases.isActive, previewSessionId: cases.previewSessionId }).from(cases).where(eq(cases.id, target.caseId)).limit(1),
    db.select({ isActive: assets.isActive, type: assets.type }).from(assets).where(eq(assets.id, target.assetId)).limit(1)
  ]);
  if (
    !optionStatus[0]?.isActive ||
    !groupStatus[0]?.isActive ||
    !caseStatus[0]?.isActive ||
    caseStatus[0]?.previewSessionId ||
    !assetStatus[0]?.isActive ||
    assetStatus[0]?.type !== 'image'
  ) {
    throw new CaseQuestionInputError('The selected image is missing or inactive.');
  }

  const duplicate = (
    await db
      .select({ id: stimulusOptionQuestions.id, isActive: stimulusOptionQuestions.isActive })
      .from(stimulusOptionQuestions)
      .where(
        and(
          eq(stimulusOptionQuestions.stimulusGroupOptionId, optionId),
          eq(stimulusOptionQuestions.questionPromptId, promptId)
        )
      )
      .limit(1)
  )[0];
  if (duplicate?.isActive === true) {
    throw new CaseQuestionInputError('That image already has an active question with this prompt.');
  }

  const createdAt = await nextStimulusOptionQuestionTime(db, optionId);
  const destination = duplicate
    ? db
        .update(stimulusOptionQuestions)
        .set({ answerMd: question.answerMd, isActive: true, createdAt, updatedAt: new Date() })
        .where(eq(stimulusOptionQuestions.id, duplicate.id))
    : db.insert(stimulusOptionQuestions).values({
        id: crypto.randomUUID(),
        stimulusGroupOptionId: optionId,
        questionPromptId: promptId,
        answerMd: question.answerMd,
        isActive: true,
        createdAt
      });

  const otherCaseUses = await db
    .select({ caseId: caseQuestions.caseId })
    .from(caseQuestions)
    .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
    .innerJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
    .where(
      and(
        eq(caseQuestions.questionPromptId, promptId),
        eq(caseQuestions.isActive, true),
        eq(cases.isActive, true),
        eq(caseConcepts.conceptId, context.conceptId)
      )
    );
  const removeTopicUse = otherCaseUses.some((row) => row.caseId !== caseId)
    ? null
    : db
        .delete(conceptQuestions)
        .where(and(eq(conceptQuestions.conceptId, context.conceptId), eq(conceptQuestions.questionPromptId, promptId)));

  const writes = /** @type {any[]} */ ([
    destination,
    db
      .update(caseQuestions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(caseQuestions.id, question.id))
  ]);
  if (removeTopicUse) writes.push(removeTopicUse);
  if (typeof db.batch === 'function') await db.batch(/** @type {[any, ...any[]]} */ (writes));
  else for (const write of writes) await write;
  return promptId;
}

/** @param {LearningDb} db @param {string} caseId @param {string} promptId */
export async function removeCaseQuestion(db, caseId, promptId) {
  await requireCaseContext(db, caseId);
  const existing = await db
    .select({ questionPromptId: caseQuestions.questionPromptId })
    .from(caseQuestions)
    .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, promptId)))
    .limit(1);
  if (!existing[0]) throw new CaseQuestionInputError('That Case question no longer exists.');
  const result = await db
    .delete(caseQuestions)
    .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, promptId)));
  return result;
}

/** @param {LearningDb} db @param {string} caseId @param {string} promptId @param {'up' | 'down'} direction */
export async function moveCaseQuestion(db, caseId, promptId, direction) {
  await requireCaseContext(db, caseId);
  const rows = await loadCaseQuestionRows(db, caseId);
  const currentIndex = rows.findIndex((row) => row.questionPromptId === promptId);
  if (currentIndex < 0) throw new CaseQuestionInputError('That Case question no longer exists.');
  const nextIndex = direction === 'up' ? currentIndex - 1 : direction === 'down' ? currentIndex + 1 : -1;
  if (nextIndex < 0 || nextIndex >= rows.length) return false;
  const orderedIds = rows.map((row) => row.questionPromptId);
  [orderedIds[currentIndex], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[currentIndex]];
  const base = Date.now();
  for (const [index, id] of orderedIds.entries()) {
    await db
      .update(caseQuestions)
      .set({ createdAt: new Date(base + index), updatedAt: new Date() })
      .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, id)));
  }
  return true;
}
