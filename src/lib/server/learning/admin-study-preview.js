import { buildActiveReviewSnapshot } from '../db/active-review-content.js';
import { loadStudyNavigationSnapshot } from '../db/study-navigation.ts';
import {
  buildSystemStudyNavigation,
  normalizeSystemStudySelectionRoutes,
  resolveSystemStudySelectionCandidates
} from './system-study-routes.ts';

export class AdminStudyPreviewUnavailableError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AdminStudyPreviewUnavailableError';
  }
}

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
  const navigation = await loadStudyNavigationSnapshot(input.db);
  const routes = normalizeSystemStudySelectionRoutes({
    ...navigation,
    systemId: input.systemId,
    routes: input.routes
  });
  const selection = {
    systemId: input.systemId,
    routes,
    candidates: resolveSystemStudySelectionCandidates({
      ...navigation,
      systemId: input.systemId,
      routes
    })
  };
  return buildAdminStudyPreviewFromSelection(input, selection);
}

/**
 * @param {{
 *   db: import('../db/index.js').LearningDb,
 *   caseId: string,
 *   contentMode: 'original'|'expanded',
 *   rng?: () => number
 * }} input
 * @param {{systemId:string,routes:readonly {routeType:'topic'|'tag',routeId:string}[],candidates:readonly any[]}} selection
 */
async function buildAdminStudyPreviewFromSelection(input, selection) {
  const candidate = selection.candidates.find((item) => item.id === input.caseId);
  if (!candidate) throw new AdminStudyPreviewUnavailableError('The selected Case is not eligible in this System scope.');
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
  const navigation = await loadStudyNavigationSnapshot(input.db);
  const systems = buildSystemStudyNavigation(navigation);
  for (const system of systems) {
    const candidateRoutes = allRoutes(system);
    const routes = normalizeSystemStudySelectionRoutes({
      ...navigation,
      systemId: system.id,
      routes: candidateRoutes
    });
    const selection = {
      systemId: system.id,
      routes,
      candidates: resolveSystemStudySelectionCandidates({
        ...navigation,
        systemId: system.id,
        routes
      })
    };
    if (!selection.candidates.some((candidate) => candidate.id === input.caseId)) continue;
    return buildAdminStudyPreviewFromSelection({
      db: input.db,
      caseId: input.caseId,
      contentMode: input.contentMode,
      rng: input.rng
    }, selection);
  }
  throw new AdminStudyPreviewUnavailableError('This Case is not currently eligible for learner study preview.');
}
