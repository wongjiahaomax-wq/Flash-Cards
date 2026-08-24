import { and, eq } from 'drizzle-orm';

import { reviewsWithRouteProvenance } from './contextual-schema.ts';
import { reviews } from './schema.js';

function missingProvenanceColumn(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      current instanceof Error
      && /no such column:.*(study_system_concept_id|route_type|study_tag_id)|has no column named (study_system_concept_id|route_type|study_tag_id)/i.test(current.message)
    ) {
      return true;
    }
    if (typeof current !== 'object' || current === null || !('cause' in current)) break;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
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
 * Build (without executing) the Review insert while preserving the caller's
 * D1 batch boundary. Established Topic Reviews use the pre-0015 table shape;
 * migrated databases supply the additive route defaults. System/Tag routes use
 * the 0015 overlay and therefore intentionally require migration 0015.
 */
export function buildReviewInsertWithOptionalRouteProvenance(
  db: import('./index.js').LearningDb,
  value: ReviewInsert
) {
  if (value.studySystemConceptId || value.routeType !== 'topic' || value.studyTagId) {
    return db.insert(reviewsWithRouteProvenance).values(value);
  }
  const {
    studySystemConceptId: _studySystemConceptId,
    routeType: _routeType,
    studyTagId: _studyTagId,
    ...legacyValue
  } = value;
  return db.insert(reviews).values(legacyValue);
}

const reviewSelection = {
  id: reviewsWithRouteProvenance.id,
  caseId: reviewsWithRouteProvenance.caseId,
  primaryConceptId: reviewsWithRouteProvenance.primaryConceptId,
  studyConceptId: reviewsWithRouteProvenance.studyConceptId,
  studySystemConceptId: reviewsWithRouteProvenance.studySystemConceptId,
  routeType: reviewsWithRouteProvenance.routeType,
  studyTagId: reviewsWithRouteProvenance.studyTagId,
  questionPoolMode: reviewsWithRouteProvenance.questionPoolMode,
  title: reviewsWithRouteProvenance.caseTitleSnapshot,
  vignette: reviewsWithRouteProvenance.vignetteSnapshotMd,
  status: reviewsWithRouteProvenance.status,
  rating: reviewsWithRouteProvenance.rating,
  revealedAt: reviewsWithRouteProvenance.revealedAt,
  completedAt: reviewsWithRouteProvenance.completedAt
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

type ReviewWithOptionalRouteProvenance = {
  id: string;
  caseId: string;
  primaryConceptId: string;
  studyConceptId: string;
  studySystemConceptId: string | null;
  routeType: 'topic' | 'tag';
  studyTagId: string | null;
  questionPoolMode: string;
  title: string;
  vignette: string | null;
  status: string;
  rating: string | null;
  revealedAt: Date | null;
  completedAt: Date | null;
};

export async function readReviewWithOptionalRouteProvenance(
  db: import('./index.js').LearningDb,
  reviewId: string,
  userId: string
): Promise<ReviewWithOptionalRouteProvenance | null> {
  try {
    const rows = await db
      .select(reviewSelection)
      .from(reviewsWithRouteProvenance)
      .where(and(eq(reviewsWithRouteProvenance.id, reviewId), eq(reviewsWithRouteProvenance.userId, userId)))
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
    return row ? { ...row, studySystemConceptId: null, routeType: 'topic', studyTagId: null } : null;
  }
}