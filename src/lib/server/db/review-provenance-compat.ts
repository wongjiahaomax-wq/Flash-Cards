import { and, eq } from 'drizzle-orm';

import { reviews } from './schema.js';

function missingProvenanceColumn(error: unknown) {
  return error instanceof Error && /no such column:.*(study_system_concept_id|route_type|study_tag_id)|has no column named (study_system_concept_id|route_type|study_tag_id)/i.test(error.message);
}

type ReviewInsert = {
  id: string;
  userId: string;
  caseId: string;
  primaryConceptId: string;
  studyConceptId: string;
  studySystemConceptId: string | null;
  routeType: 'topic' | 'tag';
  studyTagId: string | null;
  caseTitleSnapshot: string;
  vignetteSnapshotMd: string | null;
  questionPoolMode: 'core' | 'expanded';
  status: string;
  rating: string | null;
};

/**
 * Migration 0015 is additive. This fallback keeps the pre-0015 Topic-review
 * shape readable during tests/rollback windows without inventing System/Tag
 * provenance that the older schema cannot represent.
 */
export async function insertReviewWithOptionalRouteProvenance(
  db: import('./index.js').LearningDb,
  value: ReviewInsert
) {
  try {
    await db.insert(reviews).values(value);
  } catch (error) {
    if (!missingProvenanceColumn(error)) throw error;
    if (value.studySystemConceptId || value.routeType !== 'topic' || value.studyTagId) {
      throw new Error('System-routed Reviews require migration 0015.');
    }
    const {
      studySystemConceptId: _studySystemConceptId,
      routeType: _routeType,
      studyTagId: _studyTagId,
      ...legacyValue
    } = value;
    await db.insert(reviews).values(legacyValue);
  }
}

const reviewSelection = {
  id: reviews.id,
  caseId: reviews.caseId,
  primaryConceptId: reviews.primaryConceptId,
  studyConceptId: reviews.studyConceptId,
  studySystemConceptId: reviews.studySystemConceptId,
  routeType: reviews.routeType,
  studyTagId: reviews.studyTagId,
  questionPoolMode: reviews.questionPoolMode,
  title: reviews.caseTitleSnapshot,
  vignette: reviews.vignetteSnapshotMd,
  status: reviews.status,
  rating: reviews.rating,
  revealedAt: reviews.revealedAt,
  completedAt: reviews.completedAt
};

const legacyReviewSelection = {
  id: reviews.id,
  caseId: reviews.caseId,
  primaryConceptId: reviews.primaryConceptId,
  studyConceptId: reviews.studyConceptId,
  questionPoolMode: reviews.questionPoolMode,
  title: reviews.caseTitleSnapshot,
  vignette: reviews.vignetteSnapshotMd,
  status: reviews.status,
  rating: reviews.rating,
  revealedAt: reviews.revealedAt,
  completedAt: reviews.completedAt
};

export async function readReviewWithOptionalRouteProvenance(
  db: import('./index.js').LearningDb,
  reviewId: string,
  userId: string
) {
  try {
    const rows = await db
      .select(reviewSelection)
      .from(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    if (!missingProvenanceColumn(error)) throw error;
    const rows = await db
      .select(legacyReviewSelection)
      .from(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row ? { ...row, studySystemConceptId: null, routeType: 'topic' as const, studyTagId: null } : null;
  }
}
