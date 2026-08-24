import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { listConceptTaxonomy } from './concept-taxonomy-compat.ts';
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
 * Compatibility read model for callers that still expect the original Topic
 * Library shape and primary-Case counts. New System-aware Admin surfaces use
 * taxonomy-admin-read.ts directly.
 *
 * @param {LearningDb} db
 * @param {{ search?: string }} [filters]
 */
export async function listTopicLibrary(db, filters = {}) {
  const [conceptRows, caseRows, questionRows] = await Promise.all([
    listConceptTaxonomy(db),
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

  const topicRows = conceptRows.filter((concept) => concept.kind === 'topic');
  const conceptById = new Map(conceptRows.map((concept) => [concept.id, concept]));
  const caseCounts = new Map();
  const questionCounts = new Map();
  for (const row of caseRows) caseCounts.set(row.conceptId, (caseCounts.get(row.conceptId) ?? 0) + 1);
  for (const row of questionRows) questionCounts.set(row.conceptId, (questionCounts.get(row.conceptId) ?? 0) + 1);

  const search = cleanText(filters.search).toLocaleLowerCase();
  return topicRows.flatMap((topic) => {
    if (search && !topic.name.toLocaleLowerCase().includes(search)) return [];
    const parent = topic.parentId ? conceptById.get(topic.parentId) : null;
    return [{
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      descriptionMd: topic.descriptionMd,
      parentId: topic.parentId,
      isActive: topic.isActive,
      parentName: parent?.name ?? null,
      activeCaseCount: topic.isActive ? (caseCounts.get(topic.id) ?? 0) : 0,
      activeSharedQuestionCount: topic.isActive ? (questionCounts.get(topic.id) ?? 0) : 0
    }];
  });
}

/**
 * Compatibility detail model retaining directly related production primary
 * Cases and reusable Topic Questions. New System-aware detail surfaces use
 * getTaxonomyDetail instead.
 *
 * @param {LearningDb} db
 * @param {string} conceptId
 */
export async function getTopicDetail(db, conceptId) {
  const conceptRows = await listConceptTaxonomy(db);
  const topic = conceptRows.find((row) => row.id === conceptId && row.kind === 'topic');
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

  const conceptById = new Map(conceptRows.map((row) => [row.id, row]));
  const parent = topic.parentId ? conceptById.get(topic.parentId) ?? null : null;
  const children = conceptRows
    .filter((row) => row.kind === 'topic' && row.parentId === conceptId)
    .map((row) => ({ id: row.id, name: row.name, slug: row.slug, isActive: row.isActive }));

  return {
    id: topic.id,
    name: topic.name,
    slug: topic.slug,
    descriptionMd: topic.descriptionMd,
    parentId: topic.parentId,
    isActive: topic.isActive,
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
