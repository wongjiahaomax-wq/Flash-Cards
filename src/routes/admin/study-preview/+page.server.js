import { error } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import {
  listSystemStudySelectionSystems,
  resolveSystemStudySelection
} from '$lib/server/db/study-navigation.ts';
import { buildAdminStudyPreview, buildDirectAdminStudyPreview } from '$lib/server/learning/admin-study-preview.js';

/**
 * @param {{topics:{id:string}[],tags:{id:string}[]}} system
 * @returns {{routeType:'topic'|'tag',routeId:string}[]}
 */
function allRoutes(system) {
  return [
    ...system.topics.map((/** @type {{id:string}} */ topic) => ({ routeType: /** @type {'topic'} */ ('topic'), routeId: topic.id })),
    ...system.tags.map((/** @type {{id:string}} */ tag) => ({ routeType: /** @type {'tag'} */ ('tag'), routeId: tag.id }))
  ];
}

export async function load({ platform, url }) {
  if (!platform?.env?.DB) error(503, 'Admin Study Preview database is not configured.');
  const db = createDb(platform.env.DB);
  const requestedSystemId = String(url.searchParams.get('systemId') ?? '').trim();
  const requestedCaseId = String(url.searchParams.get('caseId') ?? '').trim();
  const directMode = url.searchParams.get('mode') === 'direct';

  if (directMode) {
    let preview = null;
    let directError = requestedCaseId ? null : 'Open this preview from a Production Case Editor so the exact Case can be resolved.';
    if (requestedCaseId) {
      try {
        preview = await buildDirectAdminStudyPreview({
          db,
          caseId: requestedCaseId,
          contentMode: 'original',
          rng: () => 0
        });
      } catch (cause) {
        directError = cause instanceof Error ? cause.message : 'This Case cannot be previewed under the current learner-content rules.';
      }
    }
    return {
      directMode: true,
      directCaseId: requestedCaseId,
      directBackHref: requestedCaseId ? `/admin/cases/${encodeURIComponent(requestedCaseId)}` : '/admin/cases',
      directError,
      preview,
      systems: [],
      selectedSystemId: '',
      contentMode: 'original',
      candidates: []
    };
  }

  const systems = await listSystemStudySelectionSystems(db);
  const selectedSystem = systems.find((system) => system.id === requestedSystemId) ?? null;
  const contentMode = url.searchParams.get('contentMode') === 'expanded' ? 'expanded' : 'original';

  if (!selectedSystem) {
    return { systems, selectedSystemId: '', contentMode, candidates: [], preview: null };
  }

  const routes = allRoutes(selectedSystem);
  const selection = await resolveSystemStudySelection(db, { systemId: selectedSystem.id, routes });
  const candidates = selection.candidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    vignetteMd: candidate.vignetteMd,
    studyConceptId: candidate.studyConceptId
  }));
  let preview = null;
  if (requestedCaseId) {
    preview = await buildAdminStudyPreview({
      db,
      systemId: selectedSystem.id,
      routes,
      caseId: requestedCaseId,
      contentMode,
      rng: () => 0
    });
  }

  return {
    systems,
    selectedSystemId: selectedSystem.id,
    selectedCaseId: requestedCaseId,
    contentMode,
    candidates,
    preview
  };
}
