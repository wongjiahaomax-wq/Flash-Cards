import { and, asc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';

import { caseQuestions, cases, concepts, questionPrompts } from './schema.js';
import {
  caseQuestionTags,
  caseTags,
  sharedQuestions,
  sharedQuestionTags,
  systemTags,
  tags
} from './tag-schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export const TAG_WORKSPACE_SELECTOR_LIMIT = 60;
export const TAG_WORKSPACE_OVERVIEW_LIMIT = 60;

/** @param {unknown} value */
function cleanSearch(value) {
  return String(value ?? '').trim();
}

/** @param {{ tagId: string, count: number }[]} rows */
function countMap(rows) {
  return new Map(rows.map((row) => [row.tagId, Number(row.count)]));
}

/**
 * Tag-library rows with corpus-derived usage represented by grouped counts
 * rather than materializing complete assignment collections.
 *
 * @param {LearningDb} db
 * @param {{ search?: string }} [filters]
 */
export async function listTagWorkspaceTags(db, filters = {}) {
  const search = cleanSearch(filters.search);
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

  const tagRowsPromise = search
    ? baseTagQuery.where(like(tags.name, `%${search}%`)).orderBy(asc(tags.name), asc(tags.id))
    : baseTagQuery.orderBy(asc(tags.name), asc(tags.id));

  const countExpression = sql`count(*)`.mapWith(Number).as('usage_count');
  const [tagRows, caseCountRows, questionCountRows, sharedReuseRows, sharedDescriptiveRows] = await Promise.all([
    tagRowsPromise,
    db
      .select({ tagId: caseTags.tagId, count: countExpression })
      .from(caseTags)
      .innerJoin(tags, eq(tags.id, caseTags.tagId))
      .innerJoin(cases, eq(cases.id, caseTags.caseId))
      .where(and(eq(tags.isActive, true), eq(cases.isActive, true), isNull(cases.previewSessionId)))
      .groupBy(caseTags.tagId),
    db
      .select({ tagId: caseQuestionTags.tagId, count: countExpression })
      .from(caseQuestionTags)
      .innerJoin(tags, eq(tags.id, caseQuestionTags.tagId))
      .innerJoin(caseQuestions, eq(caseQuestions.id, caseQuestionTags.caseQuestionId))
      .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
      .where(and(
        eq(tags.isActive, true),
        eq(caseQuestions.isActive, true),
        eq(cases.isActive, true),
        isNull(cases.previewSessionId),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId)
      ))
      .groupBy(caseQuestionTags.tagId),
    db
      .select({ tagId: sharedQuestions.reuseScopeTagId, count: countExpression })
      .from(sharedQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
      .innerJoin(tags, eq(tags.id, sharedQuestions.reuseScopeTagId))
      .where(and(
        eq(sharedQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId),
        eq(tags.isActive, true)
      ))
      .groupBy(sharedQuestions.reuseScopeTagId),
    db
      .select({ tagId: sharedQuestionTags.tagId, count: countExpression })
      .from(sharedQuestionTags)
      .innerJoin(sharedQuestions, eq(sharedQuestions.id, sharedQuestionTags.sharedQuestionId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
      .innerJoin(tags, eq(tags.id, sharedQuestionTags.tagId))
      .where(and(
        eq(sharedQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId),
        eq(tags.isActive, true)
      ))
      .groupBy(sharedQuestionTags.tagId)
  ]);

  const caseCounts = countMap(caseCountRows);
  const questionCounts = countMap(questionCountRows);
  const sharedReuseCounts = countMap(sharedReuseRows);
  const sharedDescriptiveCounts = countMap(sharedDescriptiveRows);

  return tagRows.map((tag) => ({
    ...tag,
    activeCaseCount: caseCounts.get(tag.id) ?? 0,
    activeCaseQuestionCount: questionCounts.get(tag.id) ?? 0,
    activeSharedReuseScopeCount: sharedReuseCounts.get(tag.id) ?? 0,
    activeSharedDescriptiveCount: sharedDescriptiveCounts.get(tag.id) ?? 0
  }));
}

/**
 * Bounded/searchable active Production Case options for Tag assignment.
 * @param {LearningDb} db
 * @param {{ search?: string }} [filters]
 */
export async function listTagWorkspaceCaseOptions(db, filters = {}) {
  const search = cleanSearch(filters.search);
  const conditions = [eq(cases.isActive, true), isNull(cases.previewSessionId)];
  if (search) conditions.push(like(cases.title, `%${search}%`));
  return db
    .select({ id: cases.id, title: cases.title })
    .from(cases)
    .where(and(...conditions))
    .orderBy(asc(cases.title), asc(cases.id))
    .limit(TAG_WORKSPACE_SELECTOR_LIMIT);
}

/**
 * Bounded/searchable active Production Case Question options for Tag assignment.
 * Only identifying context needed by the selector is returned; answer content is
 * deliberately excluded.
 *
 * @param {LearningDb} db
 * @param {{ search?: string }} [filters]
 */
export async function listTagWorkspaceCaseQuestionOptions(db, filters = {}) {
  const search = cleanSearch(filters.search);
  const conditions = [
    eq(caseQuestions.isActive, true),
    eq(cases.isActive, true),
    isNull(cases.previewSessionId),
    eq(questionPrompts.isActive, true),
    isNull(questionPrompts.previewSessionId)
  ];
  if (search) {
    const searchCondition = or(
      like(cases.title, `%${search}%`),
      like(questionPrompts.promptMd, `%${search}%`)
    );
    if (searchCondition) conditions.push(searchCondition);
  }
  return db
    .select({
      id: caseQuestions.id,
      caseId: caseQuestions.caseId,
      caseTitle: cases.title,
      promptId: caseQuestions.questionPromptId,
      promptMd: questionPrompts.promptMd
    })
    .from(caseQuestions)
    .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
    .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
    .where(and(...conditions))
    .orderBy(asc(cases.title), asc(questionPrompts.promptMd), asc(caseQuestions.id))
    .limit(TAG_WORKSPACE_SELECTOR_LIMIT);
}

/**
 * Production Case↔Tag curation rows. Selecting a Tag pushes the exact Tag
 * predicate into SQL; the all-Tag overview is bounded.
 *
 * @param {LearningDb} db
 * @param {{ tagId?: string }} [filters]
 */
export async function listTagWorkspaceCaseAssignments(db, filters = {}) {
  const tagId = cleanSearch(filters.tagId);
  const conditions = [isNull(cases.previewSessionId)];
  if (tagId) conditions.push(eq(caseTags.tagId, tagId));
  const query = db
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
    .where(and(...conditions))
    .orderBy(asc(cases.title), asc(tags.name));
  return tagId ? query : query.limit(TAG_WORKSPACE_OVERVIEW_LIMIT);
}

/**
 * Production Case Question↔Tag curation rows. Selecting a Tag pushes the exact
 * Tag predicate into SQL; the all-Tag overview is bounded.
 *
 * @param {LearningDb} db
 * @param {{ tagId?: string }} [filters]
 */
export async function listTagWorkspaceQuestionAssignments(db, filters = {}) {
  const tagId = cleanSearch(filters.tagId);
  const conditions = [isNull(cases.previewSessionId), isNull(questionPrompts.previewSessionId)];
  if (tagId) conditions.push(eq(caseQuestionTags.tagId, tagId));
  const query = db
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
    .where(and(...conditions))
    .orderBy(asc(cases.title), asc(questionPrompts.promptMd), asc(tags.name));
  return tagId ? query : query.limit(TAG_WORKSPACE_OVERVIEW_LIMIT);
}

/**
 * Shared Question Tag usage for the workspace. Selected-Tag reads are exact in
 * SQL. The all-Tag overview bounds each relationship source before merge.
 *
 * @param {LearningDb} db
 * @param {{ tagId?: string }} [filters]
 */
export async function listTagWorkspaceSharedQuestionUsages(db, filters = {}) {
  const tagId = cleanSearch(filters.tagId);
  const reuseConditions = [isNull(questionPrompts.previewSessionId)];
  const descriptiveConditions = [isNull(questionPrompts.previewSessionId)];
  if (tagId) {
    reuseConditions.push(eq(sharedQuestions.reuseScopeTagId, tagId));
    descriptiveConditions.push(eq(sharedQuestionTags.tagId, tagId));
  }

  const reuseQuery = db.select({
    sharedQuestionId: sharedQuestions.id,
    promptMd: questionPrompts.promptMd,
    sharedQuestionIsActive: sharedQuestions.isActive,
    tagId: sharedQuestions.reuseScopeTagId,
    tagName: tags.name,
    tagIsActive: tags.isActive
  }).from(sharedQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
    .innerJoin(tags, eq(tags.id, sharedQuestions.reuseScopeTagId))
    .where(and(...reuseConditions))
    .orderBy(asc(questionPrompts.promptMd), asc(tags.name), asc(sharedQuestions.id));

  const descriptiveQuery = db.select({
    sharedQuestionId: sharedQuestions.id,
    promptMd: questionPrompts.promptMd,
    sharedQuestionIsActive: sharedQuestions.isActive,
    tagId: sharedQuestionTags.tagId,
    tagName: tags.name,
    tagIsActive: tags.isActive
  }).from(sharedQuestionTags)
    .innerJoin(sharedQuestions, eq(sharedQuestions.id, sharedQuestionTags.sharedQuestionId))
    .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
    .innerJoin(tags, eq(tags.id, sharedQuestionTags.tagId))
    .where(and(...descriptiveConditions))
    .orderBy(asc(questionPrompts.promptMd), asc(tags.name), asc(sharedQuestions.id));

  const [reuseRows, descriptiveRows] = await Promise.all([
    tagId ? reuseQuery : reuseQuery.limit(TAG_WORKSPACE_OVERVIEW_LIMIT),
    tagId ? descriptiveQuery : descriptiveQuery.limit(TAG_WORKSPACE_OVERVIEW_LIMIT)
  ]);
  return [
    ...reuseRows.map((row) => ({ ...row, usageType: 'reuse_scope' })),
    ...descriptiveRows.map((row) => ({ ...row, usageType: 'descriptive' }))
  ]
    .sort((left, right) => left.promptMd.localeCompare(right.promptMd) || left.tagName.localeCompare(right.tagName))
    .slice(0, tagId ? undefined : TAG_WORKSPACE_OVERVIEW_LIMIT);
}

/**
 * System exposure rows for the curation section. Selected-Tag reads are exact;
 * the all-Tag overview is bounded.
 *
 * @param {LearningDb} db
 * @param {{ tagId?: string }} [filters]
 */
export async function listTagWorkspaceSystemExposures(db, filters = {}) {
  const tagId = cleanSearch(filters.tagId);
  const baseQuery = db
    .select({
      systemId: concepts.id,
      systemName: concepts.name,
      systemIsActive: concepts.isActive,
      tagId: tags.id,
      tagName: tags.name,
      tagIsActive: tags.isActive,
      displayOrder: systemTags.displayOrder
    })
    .from(systemTags)
    .innerJoin(concepts, eq(concepts.id, systemTags.systemConceptId))
    .innerJoin(tags, eq(tags.id, systemTags.tagId));
  const query = tagId
    ? baseQuery.where(eq(systemTags.tagId, tagId))
    : baseQuery;
  const ordered = query.orderBy(asc(concepts.name), asc(systemTags.displayOrder), asc(tags.name), asc(tags.id));
  return tagId ? ordered : ordered.limit(TAG_WORKSPACE_OVERVIEW_LIMIT);
}

/**
 * System exposure enrichment only for Tag rows visible in the Tag library.
 * @param {LearningDb} db
 * @param {string[]} tagIds
 */
export async function listTagWorkspaceSystemsForTags(db, tagIds) {
  const ids = [...new Set(tagIds.map((id) => String(id).trim()).filter(Boolean))];
  if (!ids.length) return [];
  return db
    .select({
      systemId: concepts.id,
      systemName: concepts.name,
      systemIsActive: concepts.isActive,
      tagId: tags.id,
      tagName: tags.name,
      tagIsActive: tags.isActive,
      displayOrder: systemTags.displayOrder
    })
    .from(systemTags)
    .innerJoin(concepts, eq(concepts.id, systemTags.systemConceptId))
    .innerJoin(tags, eq(tags.id, systemTags.tagId))
    .where(inArray(systemTags.tagId, ids))
    .orderBy(asc(concepts.name), asc(systemTags.displayOrder), asc(tags.name), asc(tags.id));
}
