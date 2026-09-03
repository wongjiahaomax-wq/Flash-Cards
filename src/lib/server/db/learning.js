import { and, eq, isNull } from 'drizzle-orm';

import { caseConcepts, cases } from './schema.js';
import { listActiveConceptTaxonomy } from './concept-taxonomy-compat.ts';
import { resolveCaseStudyCandidates } from '../learning/study-routes.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/**
 * Read-only compatibility surface for Topic-scoped learner-content discovery.
 *
 * The legacy `reviews`, `review_questions`, and `review_assets` persistence
 * model was retired by the FSRS learner runtime cutover. This module must not
 * create, reveal, complete, or resume learner Reviews. Active Review creation
 * and completion are owned by the dedicated FSRS/Free services.
 *
 * @param {LearningDb} db
 */
async function loadActiveCaseTopicRows(db) {
  const activeTopicIds = new Set(
    (await listActiveConceptTaxonomy(db))
      .filter((concept) => concept.kind === 'topic')
      .map((concept) => concept.id)
  );
  const rows = await db
    .select({
      id: cases.id,
      title: cases.title,
      vignetteMd: cases.vignetteMd,
      isActive: cases.isActive,
      conceptId: caseConcepts.conceptId,
      role: caseConcepts.role
    })
    .from(cases)
    .innerJoin(caseConcepts, eq(caseConcepts.caseId, cases.id))
    .where(and(eq(cases.isActive, true), isNull(cases.previewSessionId)));
  return rows.filter((row) => activeTopicIds.has(row.conceptId));
}

/** @param {LearningDb} db */
export async function listStudyConcepts(db) {
  const conceptRows = (await listActiveConceptTaxonomy(db))
    .filter((concept) => concept.kind === 'topic')
    .map((concept) => ({
      id: concept.id,
      name: concept.name,
      slug: concept.slug,
      description: concept.descriptionMd,
      parentId: concept.parentId
    }));
  const caseTopicRows = await loadActiveCaseTopicRows(db);
  return conceptRows
    .map((concept) => ({
      ...concept,
      caseCount: resolveCaseStudyCandidates({
        selectedConceptId: concept.id,
        concepts: conceptRows,
        rows: caseTopicRows
      }).length
    }))
    .filter((concept) => concept.caseCount > 0);
}

/** @param {LearningDb} db @param {string} conceptId */
export async function listEligibleCases(db, conceptId) {
  const conceptRows = (await listActiveConceptTaxonomy(db))
    .filter((concept) => concept.kind === 'topic')
    .map((concept) => ({ id: concept.id, parentId: concept.parentId }));
  return resolveCaseStudyCandidates({
    selectedConceptId: conceptId,
    concepts: conceptRows,
    rows: await loadActiveCaseTopicRows(db)
  });
}
