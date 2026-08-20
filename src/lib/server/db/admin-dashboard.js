import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { assets, caseConcepts, caseQuestions, cases, concepts, questionPrompts } from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

const rowCount = sql`count(*)`.mapWith(Number);

/**
 * Dashboard-only production read model.
 *
 * Count semantics intentionally preserve the previous dashboard behavior:
 * - Cases: active production Cases only.
 * - Questions: production-owned Case Question rows regardless of active/archive flags.
 * - Assets: production-owned Asset rows regardless of active/archive flags.
 * - Topics: active Topics only.
 *
 * @param {LearningDb} db
 * @param {{ caseLimit?: number }} [options]
 */
export async function getAdminDashboardSummary(db, options = {}) {
  const caseLimit = Number.isInteger(options.caseLimit) && options.caseLimit > 0 ? options.caseLimit : 6;
  const productionCase = and(eq(cases.isActive, true), isNull(cases.previewSessionId));

  const [caseCountRows, questionCountRows, assetCountRows, topicCountRows, dashboardCases] = await Promise.all([
    db.select({ count: rowCount }).from(cases).where(productionCase),
    db
      .select({ count: rowCount })
      .from(caseQuestions)
      .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
      .where(and(isNull(cases.previewSessionId), isNull(questionPrompts.previewSessionId))),
    db.select({ count: rowCount }).from(assets).where(isNull(assets.previewSessionId)),
    db.select({ count: rowCount }).from(concepts).where(eq(concepts.isActive, true)),
    db
      .select({ id: cases.id, title: cases.title, conceptName: concepts.name })
      .from(cases)
      .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
      .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(productionCase)
      .orderBy(asc(cases.title))
      .limit(caseLimit)
  ]);

  return {
    caseCount: caseCountRows[0]?.count ?? 0,
    questionCount: questionCountRows[0]?.count ?? 0,
    assetCount: assetCountRows[0]?.count ?? 0,
    topicCount: topicCountRows[0]?.count ?? 0,
    dashboardCases
  };
}
