import { buildActiveReviewSnapshot } from '../db/active-review-content.js';
import {
  listSystemStudySelectionSystems,
  resolveSystemStudySelection
} from '../db/study-navigation.ts';

/** @param {{topics:{id:string}[],tags:{id:string}[]}} system */
function allRoutes(system) {
  return [
    ...system.topics.map((topic) => ({ routeType: /** @type {'topic'} */ ('topic'), routeId: topic.id })),
    ...system.tags.map((tag) => ({ routeType: /** @type {'tag'} */ ('tag'), routeId: tag.id }))
  ];
}

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

/**
 * Resolve one exact Case through the same current System/Topic/Tag candidate
 * boundary used by the generic Admin Study Preview, without requiring Admin to
 * choose a System or route first.
 *
 * @param {{
 *   db: import('../db/index.js').LearningDb,
 *   caseId: string,
 *   contentMode: 'original'|'expanded',
 *   rng?: () => number
 * }} input
 */
export async function buildDirectAdminStudyPreview(input) {
  const systems = await listSystemStudySelectionSystems(input.db);
  for (const system of systems) {
    const routes = allRoutes(system);
    const selection = await resolveSystemStudySelection(input.db, {
      systemId: system.id,
      routes
    });
    if (!selection.candidates.some((candidate) => candidate.id === input.caseId)) continue;
    return buildAdminStudyPreview({
      db: input.db,
      systemId: system.id,
      routes,
      caseId: input.caseId,
      contentMode: input.contentMode,
      rng: input.rng
    });
  }
  throw new Error('This Case is not currently eligible for learner study preview.');
}
