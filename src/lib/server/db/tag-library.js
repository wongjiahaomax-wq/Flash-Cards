import { and, asc, eq, like, sql } from 'drizzle-orm';

import { caseQuestions, cases, questionPrompts } from './schema.js';
import { caseQuestionTags, caseTags, tags } from './tag-schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class TagInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'TagInputError';
  }
}

/** @param {unknown} value @param {string} label */
function requiredId(value, label) {
  const id = String(value ?? '').trim();
  if (!id) throw new TagInputError(`${label} is required.`);
  return id;
}

/** @param {unknown} value */
function cleanTagName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new TagInputError('Tag name is required.');
  if (name.length > 120) throw new TagInputError('Tag name must be 120 characters or fewer.');
  return name;
}

/** @param {string} name */
function normalizedTagName(name) {
  return name.normalize('NFKC').toLowerCase();
}

/** @param {unknown} value */
function booleanValue(value) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

/**
 * Return canonical Tags with current active usage counts.
 *
 * @param {LearningDb} db
 * @param {{ search?: string, activeOnly?: boolean }} [filters]
 */
export async function listTags(db, filters = {}) {
  const search = String(filters.search ?? '').trim();
  const activeOnly = Boolean(filters.activeOnly);
  const where = activeOnly && search
    ? and(eq(tags.isActive, true), like(tags.name, `%${search}%`))
    : activeOnly
      ? eq(tags.isActive, true)
      : search
        ? like(tags.name, `%${search}%`)
        : undefined;

  const baseTagQuery = db
    .select({
      id: tags.id,
      name: tags.name,
      normalizedName: tags.normalizedName,
      isActive: tags.isActive,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt
    })
    .from(tags);

  const tagRowsPromise = where
    ? baseTagQuery.where(where).orderBy(asc(tags.name), asc(tags.id))
    : baseTagQuery.orderBy(asc(tags.name), asc(tags.id));

  const [tagRows, activeCaseRows, activeQuestionRows] = await Promise.all([
    tagRowsPromise,
    db
      .select({ tagId: caseTags.tagId, caseId: caseTags.caseId })
      .from(caseTags)
      .innerJoin(tags, eq(tags.id, caseTags.tagId))
      .innerJoin(cases, eq(cases.id, caseTags.caseId))
      .where(and(eq(tags.isActive, true), eq(cases.isActive, true))),
    db
      .select({ tagId: caseQuestionTags.tagId, caseQuestionId: caseQuestionTags.caseQuestionId })
      .from(caseQuestionTags)
      .innerJoin(tags, eq(tags.id, caseQuestionTags.tagId))
      .innerJoin(caseQuestions, eq(caseQuestions.id, caseQuestionTags.caseQuestionId))
      .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
      .where(
        and(
          eq(tags.isActive, true),
          eq(caseQuestions.isActive, true),
          eq(cases.isActive, true),
          eq(questionPrompts.isActive, true)
        )
      )
  ]);

  const caseCounts = new Map();
  for (const row of activeCaseRows) {
    caseCounts.set(row.tagId, (caseCounts.get(row.tagId) ?? 0) + 1);
  }
  const questionCounts = new Map();
  for (const row of activeQuestionRows) {
    questionCounts.set(row.tagId, (questionCounts.get(row.tagId) ?? 0) + 1);
  }

  return tagRows.map((tag) => ({
    ...tag,
    activeCaseCount: caseCounts.get(tag.id) ?? 0,
    activeCaseQuestionCount: questionCounts.get(tag.id) ?? 0
  }));
}

/** @param {LearningDb} db */
export async function listActiveTags(db) {
  return listTags(db, { activeOnly: true });
}

/** @param {LearningDb} db @param {unknown} name */
export async function createTag(db, name) {
  const cleanName = cleanTagName(name);
  const normalizedName = normalizedTagName(cleanName);
  const existing = await db
    .select({ id: tags.id, isActive: tags.isActive })
    .from(tags)
    .where(eq(tags.normalizedName, normalizedName))
    .limit(1);
  if (existing[0]) {
    throw new TagInputError(existing[0].isActive
      ? 'A Tag with this canonical name already exists.'
      : 'This Tag already exists but is inactive. Reactivate it instead of creating a duplicate.');
  }

  const id = crypto.randomUUID();
  try {
    await db.insert(tags).values({ id, name: cleanName, normalizedName, isActive: true });
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new TagInputError('A Tag with this canonical name already exists.');
    }
    throw error;
  }
  return { id, name: cleanName };
}

/** @param {LearningDb} db @param {{ tagId: unknown, name: unknown }} input */
export async function renameTag(db, input) {
  const tagId = requiredId(input.tagId, 'Tag');
  const name = cleanTagName(input.name);
  const normalizedName = normalizedTagName(name);
  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.normalizedName, normalizedName))
    .limit(1);
  if (existing[0] && existing[0].id !== tagId) {
    throw new TagInputError('A Tag with this canonical name already exists.');
  }

  const target = await db.select({ id: tags.id }).from(tags).where(eq(tags.id, tagId)).limit(1);
  if (!target[0]) throw new TagInputError('The selected Tag does not exist.');

  try {
    await db
      .update(tags)
      .set({ name, normalizedName, updatedAt: new Date() })
      .where(eq(tags.id, tagId));
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new TagInputError('A Tag with this canonical name already exists.');
    }
    throw error;
  }
}

/** @param {LearningDb} db @param {{ tagId: unknown, isActive: unknown }} input */
export async function setTagActive(db, input) {
  const tagId = requiredId(input.tagId, 'Tag');
  const target = await db.select({ id: tags.id }).from(tags).where(eq(tags.id, tagId)).limit(1);
  if (!target[0]) throw new TagInputError('The selected Tag does not exist.');
  await db
    .update(tags)
    .set({ isActive: booleanValue(input.isActive), updatedAt: new Date() })
    .where(eq(tags.id, tagId));
}

/** @param {LearningDb} db @param {string} tagId */
async function requireActiveTag(db, tagId) {
  const row = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.isActive, true)))
    .limit(1);
  if (!row[0]) throw new TagInputError('The selected Tag is missing or inactive.');
}

/** @param {LearningDb} db @param {string} caseId */
async function requireActiveCase(db, caseId) {
  const row = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.isActive, true)))
    .limit(1);
  if (!row[0]) throw new TagInputError('The selected Case is missing or inactive.');
}

/** @param {LearningDb} db @param {string} caseQuestionId */
async function requireActiveCaseQuestion(db, caseQuestionId) {
  const row = await db
    .select({ id: caseQuestions.id })
    .from(caseQuestions)
    .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
    .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
    .where(
      and(
        eq(caseQuestions.id, caseQuestionId),
        eq(caseQuestions.isActive, true),
        eq(cases.isActive, true),
        eq(questionPrompts.isActive, true)
      )
    )
    .limit(1);
  if (!row[0]) throw new TagInputError('The selected Case Question is missing or inactive.');
}

/** @param {LearningDb} db @param {{ caseId: unknown, tagId: unknown }} input */
export async function addCaseTag(db, input) {
  const caseId = requiredId(input.caseId, 'Case');
  const tagId = requiredId(input.tagId, 'Tag');
  await Promise.all([requireActiveCase(db, caseId), requireActiveTag(db, tagId)]);
  try {
    await db.insert(caseTags).values({ caseId, tagId });
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new TagInputError('That Tag is already attached to this Case.');
    }
    throw error;
  }
}

/** @param {LearningDb} db @param {{ caseId: unknown, tagId: unknown }} input */
export async function removeCaseTag(db, input) {
  const caseId = requiredId(input.caseId, 'Case');
  const tagId = requiredId(input.tagId, 'Tag');
  await db.delete(caseTags).where(and(eq(caseTags.caseId, caseId), eq(caseTags.tagId, tagId)));
}

/** @param {LearningDb} db @param {{ caseQuestionId: unknown, tagId: unknown }} input */
export async function addCaseQuestionTag(db, input) {
  const caseQuestionId = requiredId(input.caseQuestionId, 'Case Question');
  const tagId = requiredId(input.tagId, 'Tag');
  await Promise.all([requireActiveCaseQuestion(db, caseQuestionId), requireActiveTag(db, tagId)]);
  try {
    await db.insert(caseQuestionTags).values({ caseQuestionId, tagId });
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new TagInputError('That Tag is already attached to this Case Question.');
    }
    throw error;
  }
}

/** @param {LearningDb} db @param {{ caseQuestionId: unknown, tagId: unknown }} input */
export async function removeCaseQuestionTag(db, input) {
  const caseQuestionId = requiredId(input.caseQuestionId, 'Case Question');
  const tagId = requiredId(input.tagId, 'Tag');
  await db
    .delete(caseQuestionTags)
    .where(and(eq(caseQuestionTags.caseQuestionId, caseQuestionId), eq(caseQuestionTags.tagId, tagId)));
}

/** Current active Case↔Tag relationships for Case library filtering. @param {LearningDb} db */
export async function listCurrentCaseTagAssignments(db) {
  return db
    .select({
      caseId: caseTags.caseId,
      tagId: caseTags.tagId,
      tagName: tags.name
    })
    .from(caseTags)
    .innerJoin(tags, eq(tags.id, caseTags.tagId))
    .innerJoin(cases, eq(cases.id, caseTags.caseId))
    .where(and(eq(tags.isActive, true), eq(cases.isActive, true)))
    .orderBy(asc(tags.name), asc(caseTags.caseId));
}

/** Current active Case Question Tags keyed to prompt usage for Question filtering. @param {LearningDb} db */
export async function listCurrentPromptTagAssignments(db) {
  return db
    .select({
      promptId: caseQuestions.questionPromptId,
      caseQuestionId: caseQuestionTags.caseQuestionId,
      tagId: caseQuestionTags.tagId,
      tagName: tags.name
    })
    .from(caseQuestionTags)
    .innerJoin(tags, eq(tags.id, caseQuestionTags.tagId))
    .innerJoin(caseQuestions, eq(caseQuestions.id, caseQuestionTags.caseQuestionId))
    .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
    .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
    .where(
      and(
        eq(tags.isActive, true),
        eq(caseQuestions.isActive, true),
        eq(cases.isActive, true),
        eq(questionPrompts.isActive, true)
      )
    )
    .orderBy(asc(tags.name), asc(caseQuestionTags.caseQuestionId));
}

/** @param {LearningDb} db */
export async function listTaggableCases(db) {
  return db
    .select({ id: cases.id, title: cases.title })
    .from(cases)
    .where(eq(cases.isActive, true))
    .orderBy(asc(cases.title), asc(cases.id));
}

/** @param {LearningDb} db */
export async function listTaggableCaseQuestions(db) {
  return db
    .select({
      id: caseQuestions.id,
      caseId: caseQuestions.caseId,
      caseTitle: cases.title,
      promptId: caseQuestions.questionPromptId,
      promptMd: questionPrompts.promptMd,
      answerMd: caseQuestions.answerMd
    })
    .from(caseQuestions)
    .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
    .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
    .where(
      and(
        eq(caseQuestions.isActive, true),
        eq(cases.isActive, true),
        eq(questionPrompts.isActive, true)
      )
    )
    .orderBy(asc(cases.title), asc(questionPrompts.promptMd), asc(caseQuestions.id));
}

/** All Case assignments, including inactive Tags/Cases for safe curation. @param {LearningDb} db */
export async function listCaseTagAssignments(db) {
  return db
    .select({
      caseId: caseTags.caseId,
      caseTitle: cases.title,
      caseIsActive: sql`${cases.isActive}`.as('case_is_active'),
      tagId: caseTags.tagId,
      tagName: tags.name,
      tagIsActive: sql`${tags.isActive}`.as('tag_is_active')
    })
    .from(caseTags)
    .innerJoin(cases, eq(cases.id, caseTags.caseId))
    .innerJoin(tags, eq(tags.id, caseTags.tagId))
    .orderBy(asc(cases.title), asc(tags.name));
}

/** All Case Question assignments, including inactive rows for safe curation. @param {LearningDb} db */
export async function listCaseQuestionTagAssignments(db) {
  return db
    .select({
      caseQuestionId: caseQuestionTags.caseQuestionId,
      caseQuestionIsActive: sql`${caseQuestions.isActive}`.as('case_question_is_active'),
      caseId: caseQuestions.caseId,
      caseTitle: cases.title,
      caseIsActive: sql`${cases.isActive}`.as('case_is_active'),
      promptId: caseQuestions.questionPromptId,
      promptMd: questionPrompts.promptMd,
      promptIsActive: sql`${questionPrompts.isActive}`.as('prompt_is_active'),
      tagId: caseQuestionTags.tagId,
      tagName: tags.name,
      tagIsActive: sql`${tags.isActive}`.as('tag_is_active')
    })
    .from(caseQuestionTags)
    .innerJoin(caseQuestions, eq(caseQuestions.id, caseQuestionTags.caseQuestionId))
    .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
    .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
    .innerJoin(tags, eq(tags.id, caseQuestionTags.tagId))
    .orderBy(asc(cases.title), asc(questionPrompts.promptMd), asc(tags.name));
}
