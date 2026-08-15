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
 * Resolve the single attached Study Concept used for one Case route.
 *
 * Precedence:
 * 1. exact Case link to the explicitly selected Concept;
 * 2. Case primary/default Concept when it lies in the selected subtree;
 * 3. deepest matching secondary Concept in that subtree;
 * 4. stable Concept-ID tie-break.
 *
 * @param {{ selectedConceptId: string, distances: Map<string, number>, links: { conceptId: string, role: string }[] }} input
 */
export function resolveStudyConceptId({ selectedConceptId, distances, links }) {
  const exact = links.find((link) => link.conceptId === selectedConceptId && distances.has(link.conceptId));
  if (exact) return exact.conceptId;

  const primary = links.find((link) => link.role === 'primary');
  if (primary && distances.has(primary.conceptId)) return primary.conceptId;

  const matchingSecondary = links
    .filter((link) => link.role === 'secondary' && distances.has(link.conceptId))
    .sort((left, right) => {
      const depthDifference = (distances.get(right.conceptId) ?? 0) - (distances.get(left.conceptId) ?? 0);
      return depthDifference || left.conceptId.localeCompare(right.conceptId);
    });

  return matchingSecondary[0]?.conceptId ?? null;
}

/**
 * Deduplicate active Case/Topic relationship rows into one learner candidate per Case.
 * A canonical primary Concept remains required because every created Review snapshots it.
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
