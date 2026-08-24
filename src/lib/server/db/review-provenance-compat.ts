import { and, eq } from 'drizzle-orm';

import { reviewsWithRouteProvenance } from './contextual-schema.ts';
import { pre0015Reviews } from './pre-0015-compat-schema.ts';

function missingProvenanceColumn(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      current instanceof Error
      && /no such column:.*(study_system_concept_id|route_type|study_tag_id|navigation_route_type|navigation_route_id)|has no column named (study_system_concept_id|route_type|study_tag_id|navigation_route_type|navigation_route_id)/i.test(current.message)
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
  navigationRouteType: 'all' | 'topic' | 'tag' | null;
  navigationRouteId: string | null;
  caseTitleSnapshot: string;
  vignetteSnapshotMd: string | null;
  questionPoolMode: 'core' | 'expanded';
  status: string;
  rating: string | null;
};

/**
 * Build (without executing) the Review insert while preserving the caller's
 * D1 batch boundary. Established Topic Reviews use the compatibility-only
 * pre-0015 shape; System routes require migration 0015 and use the canonical
 * post-0015 Review schema.
 */
export function buildReviewInsertWithOptionalRouteProvenance(
  db: import('./index.js').LearningDb,
  value: ReviewInsert
) {
  if (
    value.studySystemConceptId
    || value.routeType !== 'topic'
    || value.studyTagId
    || value.navigationRouteType
    || value.navigationRouteId
  ) {
    return db.insert(reviewsWithRouteProvenance).values(value);
  }
  const {
    studySystemConceptId: _studySystemConceptId,
    routeType: _routeType,
    studyTagId: _studyTagId,
    navigationRouteType: _navigationRouteType,
    navigationRouteId: _navigationRouteId,
    ...legacyValue
  } = value;
  return db.insert(pre0015Reviews).values(legacyValue);
}

const reviewSelection = {
  id: reviewsWithRouteProvenance.id,
  caseId: reviewsWithRouteProvenance.caseId,
  primaryConceptId: reviewsWithRouteProvenance.primaryConceptId,
  studyConceptId: reviewsWithRouteProvenance.studyConceptId,
  studySystemConceptId: reviewsWithRouteProvenance.studySystemConceptId,
  routeType: reviewsWithRouteProvenance.routeType,
  studyTagId: reviewsWithRouteProvenance.studyTagId,
  navigationRouteType: reviewsWithRouteProvenance.navigationRouteType,
  navigationRouteId: reviewsWithRouteProvenance.navigationRouteId,
  questionPoolMode: reviewsWithRouteProvenance.questionPoolMode,
  title: reviewsWithRouteProvenance.caseTitleSnapshot,
  vignette: reviewsWithRouteProvenance.vignetteSnapshotMd,
  status: reviewsWithRouteProvenance.status,
  rating: reviewsWithRouteProvenance.rating,
  revealedAt: reviewsWithRouteProvenance.revealedAt,
  completedAt: reviewsWithRouteProvenance.completedAt
};

const legacyReviewSelection = {
  id: pre0015Reviews.id,
  caseId: pre0015Reviews.caseId,
  primaryConceptId: pre0015Reviews.primaryConceptId,
  studyConceptId: pre0015Reviews.studyConceptId,
  questionPoolMode: pre0015Reviews.questionPoolMode,
  title: pre0015Reviews.caseTitleSnapshot,
  vignette: pre0015Reviews.vignetteSnapshotMd,
  status: pre0015Reviews.status,
  rating: pre0015Reviews.rating,
  revealedAt: pre0015Reviews.revealedAt,
  completedAt: pre0015Reviews.completedAt
};

type ReviewWithOptionalRouteProvenance = {
  id: string;
  caseId: string;
  primaryConceptId: string;
  studyConceptId: string;
  studySystemConceptId: string | null;
  routeType: 'topic' | 'tag';
  studyTagId: string | null;
  navigationRouteType: 'all' | 'topic' | 'tag' | null;
  navigationRouteId: string | null;
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
      .from(pre0015Reviews)
      .where(and(eq(pre0015Reviews.id, reviewId), eq(pre0015Reviews.userId, userId)))
      .limit(1);
    const row = rows[0];
    return row
      ? {
          ...row,
          studySystemConceptId: null,
          routeType: 'topic',
          studyTagId: null,
          navigationRouteType: null,
          navigationRouteId: null
        }
      : null;
  }
}
