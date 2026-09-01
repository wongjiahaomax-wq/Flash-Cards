import { and, eq } from 'drizzle-orm';

import { reviewsWithRouteProvenance } from './contextual-schema.ts';

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
  studySelectionId?: string | null;
  caseTitleSnapshot: string;
  vignetteSnapshotMd: string | null;
  questionPoolMode: 'core' | 'expanded';
  status: string;
  rating: string | null;
};

/** Build the current-schema Review insert without executing it so callers can preserve their D1 batch boundary. */
export function buildReviewInsertWithOptionalRouteProvenance(
  db: import('./index.js').LearningDb,
  value: ReviewInsert
) {
  return db.insert(reviewsWithRouteProvenance).values({ ...value, studySelectionId: value.studySelectionId ?? null });
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
  studySelectionId: reviewsWithRouteProvenance.studySelectionId,
  questionPoolMode: reviewsWithRouteProvenance.questionPoolMode,
  title: reviewsWithRouteProvenance.caseTitleSnapshot,
  vignette: reviewsWithRouteProvenance.vignetteSnapshotMd,
  status: reviewsWithRouteProvenance.status,
  rating: reviewsWithRouteProvenance.rating,
  revealedAt: reviewsWithRouteProvenance.revealedAt,
  completedAt: reviewsWithRouteProvenance.completedAt
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
  studySelectionId: string | null;
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
  const rows = await db
    .select(reviewSelection)
    .from(reviewsWithRouteProvenance)
    .where(and(eq(reviewsWithRouteProvenance.id, reviewId), eq(reviewsWithRouteProvenance.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}
