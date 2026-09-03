import { buildActiveReviewSnapshot } from '../db/active-review-content.js';
import { resolveSystemStudySelection } from '../db/study-navigation.ts';

/**
 * Read-only Admin Study Preview built on the same content-resolution boundary as
 * active learner Reviews, without creating learner profiles, preferences,
 * active Reviews, events, encounters, aggregates, or completion receipts.
 *
 * @param {{
 *   db: import('../db/index.js').LearningDb,
 *   systemId: string,
 *   routes: readonly {routeType:'topic'|'tag',routeId:string}[],
 *   caseId: string,
 *   contentMode: 'original'|'expanded',
 *   rng?: () => number
 * }} input
 */
export async function buildAdminStudyPreview(input) {
  const selection = await resolveSystemStudySelection(input.db, {
    systemId: input.systemId,
    routes: input.routes
  });
  const candidate = selection.candidates.find((item) => item.id === input.caseId);
  if (!candidate) throw new Error('The selected Case is not eligible in this System scope.');
  const snapshot = await buildActiveReviewSnapshot({
    db: input.db,
    caseId: candidate.id,
    studyConceptId: candidate.studyConceptId,
    contentMode: input.contentMode,
    rng: input.rng ?? (() => 0)
  });
  return {
    systemId: selection.systemId,
    routes: selection.routes,
    candidate: {
      id: candidate.id,
      title: candidate.title,
      studyConceptId: candidate.studyConceptId
    },
    snapshot: {
      ...snapshot,
      assets: snapshot.assets.map((asset) => ({
        ...asset,
        imageUrl: `/api/assets/${encodeURIComponent(asset.assetId)}/image`
      }))
    }
  };
}
