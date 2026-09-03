import { error } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import {
  listSystemStudySelectionSystems,
  resolveSystemStudySelection
} from '$lib/server/db/study-navigation.ts';
import { buildAdminStudyPreview } from '$lib/server/learning/admin-study-preview.js';

/** @param {any} system */
function allRoutes(system) {
  return [
    ...system.topics.map((topic) => ({ routeType: 'topic', routeId: topic.id })),
    ...system.tags.map((tag) => ({ routeType: 'tag', routeId: tag.id }))
  ];
}

export async function load({ platform, url }) {
  if (!platform?.env?.DB) error(503, 'Admin Study Preview database is not configured.');
  const db = createDb(platform.env.DB);
  const systems = await listSystemStudySelectionSystems(db);
  const requestedSystemId = String(url.searchParams.get('systemId') ?? '').trim();
  const selectedSystem = systems.find((system) => system.id === requestedSystemId) ?? null;
  const contentMode = url.searchParams.get('contentMode') === 'expanded' ? 'expanded' : 'original';
  const requestedCaseId = String(url.searchParams.get('caseId') ?? '').trim();

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
