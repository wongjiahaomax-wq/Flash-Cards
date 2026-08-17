import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import {
  caseConcepts,
  cases,
  conceptQuestions,
  concepts,
  questionPrompts
} from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/** @param {unknown} value */
function cleanText(value) {
  return String(value ?? '').trim();
}

/**
 * List Topics with current active primary-Case and reusable-question counts.
 * Inactive Topics remain visible for administration, but their current counts
 * are zero by definition. Preview-owned records are excluded from normal Admin.
 *
 * @param {LearningDb} db
 * @param {{ search?: string }} [filters]
 */
export async function listTopicLibrary(db, filters = {}) {
  const [topicRows, caseRows, questionRows] = await Promise.all([
    db
      .select({
        id: concepts.id,
        name: concepts.name,
        slug: concepts.slug,
        descriptionMd: concepts.descriptionMd,
        parentId: concepts.parentId,
        isActive: concepts.isActive
      })
      .from(concepts)
      .orderBy(asc(concepts.name), asc(concepts.id)),
    db
      .select({ conceptId: caseConcepts.conceptId, caseId: cases.id })
      .from(caseConcepts)
      .innerJoin(cases, eq(cases.id, caseConcepts.caseId))
      .where(and(eq(caseConcepts.role, 'primary'), eq(cases.isActive, true), isNull(cases.previewSessionId))),
    db
      .select({ conceptId: conceptQuestions.conceptId, questionId: conceptQuestions.id })
      .from(conceptQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, conceptQuestions.questionPromptId))
      .innerJoin(concepts, eq(concepts.id, conceptQuestions.conceptId))
      .where(
        and(
          eq(conceptQuestions.isActive, true),
          eq(questionPrompts.isActive, true),
          isNull(questionPrompts.previewSessionId),
          eq(concepts.isActive, true)
        )
      )
  ]);

  const topicById = new Map(topicRows.map((topic) => [topic.id, topic]));
  const caseCounts = new Map();
  const questionCounts = new Map();
  for (const row of caseRows) caseCounts.set(row.conceptId, (caseCounts.get(row.conceptId) ?? 0) + 1);
  for (const row of questionRows) questionCounts.set(row.conceptId, (questionCounts.get(row.conceptId) ?? 0) + 1);

  const search = cleanText(filters.search).toLocaleLowerCase();
  return topicRows.flatMap((topic) => {
    if (search && !topic.name.toLocaleLowerCase().includes(search)) return [];
    const parent = topic.parentId ? topicById.get(topic.parentId) : null;
    return [{
      ...topic,
      parentName: parent?.name ?? null,
      activeCaseCount: topic.isActive ? (caseCounts.get(topic.id) ?? 0) : 0,
      activeSharedQuestionCount: topic.isActive ? (questionCounts.get(topic.id) ?? 0) : 0
    }];
  });
}

/**
 * Load one Topic with its directly related production primary Cases, Concept
 * Questions, parent, and direct children. Historical inactive production
 * relationships are retained on detail so administrators can understand
 * archived content; disposable Preview ownership never appears here.
 *
 * @param {LearningDb} db
 * @param {string} conceptId
 */
export async function getTopicDetail(db, conceptId) {
  const topicRows = await db
    .select({
      id: concepts.id,
      name: concepts.name,
      slug: concepts.slug,
      descriptionMd: concepts.descriptionMd,
      parentId: concepts.parentId,
      isActive: concepts.isActive
    })
    .from(concepts)
    .orderBy(asc(concepts.name), asc(concepts.id));

  const topic = topicRows.find((row) => row.id === conceptId);
  if (!topic) return null;

  const [caseRows, questionRows] = await Promise.all([
    db
      .select({
        caseId: sql.raw('"cases"."id"').as('case_id'),
        caseTitle: cases.title,
        caseIsActive: cases.isActive
      })
      .from(caseConcepts)
      .innerJoin(cases, eq(cases.id, caseConcepts.caseId))
      .where(and(eq(caseConcepts.conceptId, conceptId), eq(caseConcepts.role, 'primary'), isNull(cases.previewSessionId)))
      .orderBy(asc(cases.title), asc(cases.id)),
    db
      .select({
        usageId: sql.raw('"concept_questions"."id"').as('usage_id'),
        promptId: sql.raw('"question_prompts"."id"').as('prompt_id'),
        promptMd: questionPrompts.promptMd,
        promptIsActive: questionPrompts.isActive,
        answerMd: conceptQuestions.answerMd,
        inheritToDescendants: conceptQuestions.inheritToDescendants,
        usageIsActive: sql.raw('"concept_questions"."is_active"').as('usage_is_active')
      })
      .from(conceptQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, conceptQuestions.questionPromptId))
      .where(and(eq(conceptQuestions.conceptId, conceptId), isNull(questionPrompts.previewSessionId)))
      .orderBy(asc(questionPrompts.promptMd), asc(conceptQuestions.id))
  ]);

  const topicById = new Map(topicRows.map((row) => [row.id, row]));
  const parent = topic.parentId ? topicById.get(topic.parentId) ?? null : null;
  const children = topicRows
    .filter((row) => row.parentId === conceptId)
    .map((row) => ({ id: row.id, name: row.name, slug: row.slug, isActive: row.isActive }));

  return {
    ...topic,
    parent: parent ? { id: parent.id, name: parent.name, slug: parent.slug, isActive: parent.isActive } : null,
    children,
    cases: caseRows,
    questions: questionRows,
    activeCaseCount: topic.isActive ? caseRows.filter((row) => row.caseIsActive).length : 0,
    activeSharedQuestionCount: topic.isActive
      ? questionRows.filter((row) => row.usageIsActive && row.promptIsActive).length
      : 0
  };
}
