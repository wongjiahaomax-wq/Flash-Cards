/**
 * @typedef {{ id: string, parentId: string | null }} ConceptNode
 * @typedef {{ id: string, title?: string, vignetteMd?: string | null, isActive?: boolean, conceptId: string, role: string }} CaseTopicRow
 */

/**
 * Return active descendant distances from one selected Concept.
 * The selected Concept is distance 0. An empty map means the selected Concept
 * is not present in the supplied active Concept list.
 *
 * @param {string} rootId
 * @param {ConceptNode[]} concepts
 */
export function descendantDistances(rootId, concepts) {
  if (!concepts.some((concept) => concept.id === rootId)) return new Map();

  const distances = new Map([[rootId, 0]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const concept of concepts) {
      if (!concept.parentId || !distances.has(concept.parentId) || distances.has(concept.id)) continue;
      distances.set(concept.id, (distances.get(concept.parentId) ?? 0) + 1);
      changed = true;
    }
  }
  return distances;
}

/**
 * Resolve the canonical Topic used for one Case route.
 *
 * Current Case behavior has exactly one learner-routable Topic relationship:
 * the canonical primary Topic. Legacy secondary relationships are historical
 * compatibility data only and never change current learner eligibility or the
 * direct reusable Topic-question context.
 *
 * @param {{ selectedConceptId: string, distances: Map<string, number>, links: { conceptId: string, role: string }[] }} input
 */
export function resolveStudyConceptId({ distances, links }) {
  const primary = links.find((link) => link.role === 'primary');
  return primary && distances.has(primary.conceptId) ? primary.conceptId : null;
}

/**
 * Deduplicate active Case/Topic relationship rows into one learner candidate per Case.
 * A canonical primary Concept remains required because every created Review snapshots it.
 * Legacy secondary rows are deliberately ignored for current learner routing.
 *
 * @param {{ selectedConceptId: string, concepts: ConceptNode[], rows: CaseTopicRow[] }} input
 */
export function resolveCaseStudyCandidates({ selectedConceptId, concepts, rows }) {
  const distances = descendantDistances(selectedConceptId, concepts);
  if (distances.size === 0) return [];

  /** @type {Map<string, CaseTopicRow[]>} */
  const rowsByCase = new Map();
  for (const row of rows) {
    if (row.isActive === false) continue;
    const caseRows = rowsByCase.get(row.id) ?? [];
    caseRows.push(row);
    rowsByCase.set(row.id, caseRows);
  }

  const candidates = [];
  for (const [caseId, caseRows] of rowsByCase) {
    const links = caseRows.map((row) => ({ conceptId: row.conceptId, role: row.role }));
    const primaryConceptId = links.find((link) => link.role === 'primary')?.conceptId ?? null;
    if (!primaryConceptId) continue;

    const studyConceptId = resolveStudyConceptId({ selectedConceptId, distances, links });
    if (!studyConceptId) continue;

    const representative = caseRows[0];
    candidates.push({
      id: caseId,
      title: representative.title,
      vignetteMd: representative.vignetteMd,
      isActive: representative.isActive,
      primaryConceptId,
      studyConceptId
    });
  }

  return candidates.sort((left, right) => left.id.localeCompare(right.id));
}