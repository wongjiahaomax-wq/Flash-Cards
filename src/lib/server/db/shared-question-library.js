import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { questionPrompts } from './schema.js';
import { sharedQuestions, sharedQuestionTags, tags } from './tag-schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class SharedQuestionInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SharedQuestionInputError';
  }
}

/** @param {unknown} value @param {string} label */
function requiredId(value, label) {
  const id = String(value ?? '').trim();
  if (!id) throw new SharedQuestionInputError(`${label} is required.`);
  return id;
}

/** @param {unknown} value @param {string} label */
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new SharedQuestionInputError(`${label} is required.`);
  return text;
}

/** @param {unknown} value */
function booleanValue(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

/** @param {unknown} values */
function uniqueIds(values) {
  const source = Array.isArray(values) ? values : values == null ? [] : [values];
  return [...new Set(source.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

/** @param {LearningDb} db @param {string} tagId */
async function requireActiveTag(db, tagId) {
  const row = await db.select({ id: tags.id }).from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.isActive, true))).limit(1);
  if (!row[0]) throw new SharedQuestionInputError('The selected Reuse Scope Tag is missing or inactive.');
}

/** @param {LearningDb} db @param {string[]} tagIds */
async function requireActiveDescriptiveTags(db, tagIds) {
  if (!tagIds.length) return;
  const rows = await db.select({ id: tags.id }).from(tags)
    .where(and(inArray(tags.id, tagIds), eq(tags.isActive, true)));
  if (rows.length !== tagIds.length) {
    throw new SharedQuestionInputError('Every descriptive Tag must exist and be active.');
  }
}

/** @param {LearningDb} db @param {string} promptId */
async function requireActiveProductionPrompt(db, promptId) {
  const row = await db.select({ id: questionPrompts.id }).from(questionPrompts)
    .where(and(eq(questionPrompts.id, promptId), eq(questionPrompts.isActive, true), isNull(questionPrompts.previewSessionId)))
    .limit(1);
  if (!row[0]) throw new SharedQuestionInputError('The selected Question Prompt is missing, inactive, or Preview-owned.');
}

/** @param {LearningDb} db @param {string} promptId @param {string|null} exceptId */
async function requirePromptAvailable(db, promptId, exceptId = null) {
  const rows = await db.select({ id: sharedQuestions.id }).from(sharedQuestions)
    .where(and(eq(sharedQuestions.questionPromptId, promptId), eq(sharedQuestions.isActive, true)));
  if (rows.some((row) => row.id !== exceptId)) {
    throw new SharedQuestionInputError('This Question Prompt already has an active Shared Question.');
  }
}

/** @param {LearningDb} db */
export async function listSharedQuestionPromptChoices(db) {
  return db.select({ id: questionPrompts.id, promptMd: questionPrompts.promptMd })
    .from(questionPrompts)
    .where(and(eq(questionPrompts.isActive, true), isNull(questionPrompts.previewSessionId)))
    .orderBy(asc(questionPrompts.promptMd), asc(questionPrompts.id));
}

/** @param {LearningDb} db */
export async function listSharedQuestions(db) {
  const [rows, tagRows] = await Promise.all([
    db.select({
      id: sharedQuestions.id,
      questionPromptId: sharedQuestions.questionPromptId,
      promptMd: questionPrompts.promptMd,
      answerMd: sharedQuestions.answerMd,
      reuseScopeTagId: sharedQuestions.reuseScopeTagId,
      reuseScopeTagName: tags.name,
      reuseScopeTagIsActive: tags.isActive,
      isActive: sharedQuestions.isActive,
      updatedAt: sharedQuestions.updatedAt
    }).from(sharedQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
      .innerJoin(tags, eq(tags.id, sharedQuestions.reuseScopeTagId))
      .where(isNull(questionPrompts.previewSessionId))
      .orderBy(asc(questionPrompts.promptMd), asc(sharedQuestions.id)),
    db.select({
      sharedQuestionId: sharedQuestionTags.sharedQuestionId,
      tagId: sharedQuestionTags.tagId,
      tagName: tags.name,
      tagIsActive: tags.isActive
    }).from(sharedQuestionTags)
      .innerJoin(tags, eq(tags.id, sharedQuestionTags.tagId))
      .orderBy(asc(tags.name), asc(tags.id))
  ]);
  return rows.map((row) => ({
    ...row,
    descriptiveTags: tagRows.filter((tag) => tag.sharedQuestionId === row.id)
  }));
}

/** @param {LearningDb} db @param {string} id */
export async function getSharedQuestion(db, id) {
  return (await listSharedQuestions(db)).find((row) => row.id === id) ?? null;
}

/**
 * @param {LearningDb} db
 * @param {{ questionPromptId?: unknown, promptMd?: unknown, answerMd: unknown, reuseScopeTagId: unknown, descriptiveTagIds?: unknown[] }} input
 */
export async function createSharedQuestion(db, input) {
  const answerMd = requiredText(input.answerMd, 'Answer');
  const reuseScopeTagId = requiredId(input.reuseScopeTagId, 'Reuse Scope Tag');
  const descriptiveTagIds = uniqueIds(input.descriptiveTagIds);
  await requireActiveTag(db, reuseScopeTagId);
  await requireActiveDescriptiveTags(db, descriptiveTagIds);

  let questionPromptId = String(input.questionPromptId ?? '').trim();
  const promptMd = String(input.promptMd ?? '').trim();
  if (questionPromptId && promptMd) {
    throw new SharedQuestionInputError('Choose an existing Question Prompt or provide new wording, not both.');
  }
  const writes = [];
  if (questionPromptId) {
    await requireActiveProductionPrompt(db, questionPromptId);
  } else {
    const wording = requiredText(promptMd, 'New Question Prompt wording');
    questionPromptId = crypto.randomUUID();
    writes.push(db.insert(questionPrompts).values({
      id: questionPromptId,
      promptMd: wording,
      previewSessionId: null,
      isActive: true
    }));
  }
  await requirePromptAvailable(db, questionPromptId);

  const id = crypto.randomUUID();
  writes.push(db.insert(sharedQuestions).values({
    id,
    questionPromptId,
    answerMd,
    reuseScopeTagId,
    isActive: true
  }));
  if (descriptiveTagIds.length) {
    writes.push(db.insert(sharedQuestionTags).values(
      descriptiveTagIds.map((tagId) => ({ sharedQuestionId: id, tagId }))
    ));
  }
  if (typeof db.batch === 'function') await db.batch(writes);
  else for (const write of writes) await write;
  return id;
}

/**
 * @param {LearningDb} db
 * @param {{ id: unknown, questionPromptId: unknown, answerMd: unknown, reuseScopeTagId: unknown, descriptiveTagIds?: unknown[] }} input
 */
export async function updateSharedQuestion(db, input) {
  const id = requiredId(input.id, 'Shared Question');
  const questionPromptId = requiredId(input.questionPromptId, 'Question Prompt');
  const answerMd = requiredText(input.answerMd, 'Answer');
  const reuseScopeTagId = requiredId(input.reuseScopeTagId, 'Reuse Scope Tag');
  const descriptiveTagIds = uniqueIds(input.descriptiveTagIds);
  const current = await db.select({ id: sharedQuestions.id, isActive: sharedQuestions.isActive })
    .from(sharedQuestions).where(eq(sharedQuestions.id, id)).limit(1);
  if (!current[0]) throw new SharedQuestionInputError('Shared Question not found.');
  await requireActiveProductionPrompt(db, questionPromptId);
  await requireActiveTag(db, reuseScopeTagId);
  await requireActiveDescriptiveTags(db, descriptiveTagIds);
  if (current[0].isActive) await requirePromptAvailable(db, questionPromptId, id);

  const writes = [
    db.update(sharedQuestions).set({
      questionPromptId,
      answerMd,
      reuseScopeTagId,
      updatedAt: new Date()
    }).where(eq(sharedQuestions.id, id)),
    db.delete(sharedQuestionTags).where(eq(sharedQuestionTags.sharedQuestionId, id))
  ];
  if (descriptiveTagIds.length) {
    writes.push(db.insert(sharedQuestionTags).values(
      descriptiveTagIds.map((tagId) => ({ sharedQuestionId: id, tagId }))
    ));
  }
  if (typeof db.batch === 'function') await db.batch(writes);
  else for (const write of writes) await write;
}

/** @param {LearningDb} db @param {{ id: unknown, isActive: unknown }} input */
export async function setSharedQuestionActive(db, input) {
  const id = requiredId(input.id, 'Shared Question');
  const isActive = booleanValue(input.isActive);
  const current = await db.select({
    id: sharedQuestions.id,
    questionPromptId: sharedQuestions.questionPromptId,
    reuseScopeTagId: sharedQuestions.reuseScopeTagId
  }).from(sharedQuestions).where(eq(sharedQuestions.id, id)).limit(1);
  if (!current[0]) throw new SharedQuestionInputError('Shared Question not found.');
  if (isActive) {
    await requireActiveProductionPrompt(db, current[0].questionPromptId);
    await requireActiveTag(db, current[0].reuseScopeTagId);
    await requirePromptAvailable(db, current[0].questionPromptId, id);
  }
  await db.update(sharedQuestions).set({ isActive, updatedAt: new Date() }).where(eq(sharedQuestions.id, id));
}
