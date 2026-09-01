import { resolveCaseStudyCandidates } from './study-routes.js';
import { conceptBreadcrumb, descendantTopicIds, systemAncestorId, type TaxonomyNode } from './taxonomy-graph.ts';

export type SystemRouteType = 'all' | 'topic' | 'tag';
export type SystemStudySelectionRouteType = Exclude<SystemRouteType, 'all'>;

export type SystemStudySelectionRoute = {
  routeType: SystemStudySelectionRouteType;
  routeId: string;
};

export type SystemStudySelectionErrorCode =
  | 'invalid-system'
  | 'empty-selection'
  | 'invalid-route'
  | 'route-not-in-system';

export class SystemStudySelectionError extends Error {
  readonly code: SystemStudySelectionErrorCode;

  constructor(code: SystemStudySelectionErrorCode, message: string) {
    super(message);
    this.name = 'SystemStudySelectionError';
    this.code = code;
  }
}

export type CaseTopicRow = {
  id: string;
  title?: string;
  vignetteMd?: string | null;
  isActive?: boolean;
  conceptId: string;
  role: string;
};

export type CaseTagRow = {
  caseId: string;
  tagId: string;
  tagName: string;
};

export type SystemTagRow = {
  systemConceptId: string;
  tagId: string;
  tagName: string;
  displayOrder: number;
};

export type SystemStudyCandidate = {
  id: string;
  title?: string;
  vignetteMd?: string | null;
  isActive?: boolean;
  primaryConceptId: string;
  studyConceptId: string;
  studySystemConceptId: string;
  routeType: 'topic' | 'tag';
  studyTagId: string | null;
  routeLabel: string;
};

export type SystemNavigationInput = {
  concepts: TaxonomyNode[];
  caseTopicRows: CaseTopicRow[];
  caseTagRows: CaseTagRow[];
  systemTagRows: SystemTagRow[];
};

function activeNodes(nodes: TaxonomyNode[]) {
  return nodes.filter((node) => node.isActive !== false);
}

function conceptName(id: string, nodes: TaxonomyNode[]) {
  return nodes.find((node) => node.id === id)?.name ?? id;
}

function systemExists(systemId: string, nodes: TaxonomyNode[]) {
  return nodes.some((node) => node.id === systemId && node.kind === 'system' && node.isActive !== false);
}

function curatedTagsForSystem(systemId: string, rows: SystemTagRow[]) {
  return rows
    .filter((row) => row.systemConceptId === systemId)
    .sort((left, right) =>
      left.displayOrder - right.displayOrder
      || left.tagName.localeCompare(right.tagName)
      || left.tagId.localeCompare(right.tagId)
    );
}

function topicCandidates(systemId: string, selectedConceptId: string, input: SystemNavigationInput) {
  const nodes = activeNodes(input.concepts);
  const validTopics = new Set(descendantTopicIds(systemId, nodes, true));
  if (!validTopics.has(selectedConceptId)) return [];

  return resolveCaseStudyCandidates({
    selectedConceptId,
    concepts: nodes,
    rows: input.caseTopicRows
  }).flatMap((candidate) => {
    if (!validTopics.has(candidate.studyConceptId)) return [];
    return [{
      ...candidate,
      studySystemConceptId: systemId,
      routeType: 'topic' as const,
      studyTagId: null,
      routeLabel: conceptName(candidate.studyConceptId, nodes)
    }];
  });
}

function nativeSystemCandidates(systemId: string, input: SystemNavigationInput) {
  const nodes = activeNodes(input.concepts);
  const validTopics = new Set(descendantTopicIds(systemId, nodes, true));
  return resolveCaseStudyCandidates({
    selectedConceptId: systemId,
    concepts: nodes,
    rows: input.caseTopicRows
  }).flatMap((candidate) => {
    if (!validTopics.has(candidate.studyConceptId)) return [];
    return [{
      ...candidate,
      studySystemConceptId: systemId,
      routeType: 'topic' as const,
      studyTagId: null,
      routeLabel: conceptName(candidate.studyConceptId, nodes)
    }];
  });
}

function exactTopicCandidates(systemId: string, selectedConceptId: string, input: SystemNavigationInput) {
  const nodes = activeNodes(input.concepts);
  const validTopics = new Set(descendantTopicIds(systemId, nodes, true));
  if (!validTopics.has(selectedConceptId) || systemAncestorId(selectedConceptId, nodes) !== systemId) return [];

  return nativeSystemCandidates(systemId, input)
    .filter((candidate) => candidate.studyConceptId === selectedConceptId);
}

function tagCandidates(systemId: string, tagId: string, input: SystemNavigationInput) {
  const nodes = activeNodes(input.concepts);
  const curated = curatedTagsForSystem(systemId, input.systemTagRows).find((row) => row.tagId === tagId);
  if (!curated) return [];

  const topicRowsByCase = new Map<string, CaseTopicRow[]>();
  for (const row of input.caseTopicRows) {
    const rows = topicRowsByCase.get(row.id) ?? [];
    rows.push(row);
    topicRowsByCase.set(row.id, rows);
  }

  const seen = new Set<string>();
  const candidates: SystemStudyCandidate[] = [];
  for (const match of input.caseTagRows) {
    if (match.tagId !== tagId || seen.has(match.caseId)) continue;
    const rows = topicRowsByCase.get(match.caseId) ?? [];
    const primary = rows.find((row) => row.role === 'primary');
    if (!primary) continue;
    const primaryConcept = nodes.find((node) => node.id === primary.conceptId && node.kind === 'topic');
    if (!primaryConcept) continue;
    const representative = rows[0];
    if (!representative) continue;
    seen.add(match.caseId);
    candidates.push({
      id: match.caseId,
      title: representative.title,
      vignetteMd: representative.vignetteMd,
      isActive: representative.isActive,
      primaryConceptId: primary.conceptId,
      studyConceptId: primary.conceptId,
      studySystemConceptId: systemId,
      routeType: 'tag',
      studyTagId: tagId,
      routeLabel: curated.tagName
    });
  }
  return candidates.sort((left, right) => left.id.localeCompare(right.id));
}

function compareSelectionRoutes(
  left: SystemStudySelectionRoute,
  right: SystemStudySelectionRoute,
  tagOrder: Map<string, number>
) {
  if (left.routeType !== right.routeType) return left.routeType === 'topic' ? -1 : 1;
  if (left.routeType === 'topic') return left.routeId.localeCompare(right.routeId);
  return (tagOrder.get(left.routeId) ?? Number.MAX_SAFE_INTEGER)
    - (tagOrder.get(right.routeId) ?? Number.MAX_SAFE_INTEGER)
    || left.routeId.localeCompare(right.routeId);
}

export function routeBelongsToSystem(
  systemId: string,
  routeType: SystemStudySelectionRouteType,
  routeId: string,
  input: SystemNavigationInput
) {
  if (routeType === 'tag') {
    return curatedTagsForSystem(systemId, input.systemTagRows).some((row) => row.tagId === routeId);
  }
  const nodes = activeNodes(input.concepts);
  return descendantTopicIds(systemId, nodes, true).includes(routeId)
    && systemAncestorId(routeId, nodes) === systemId;
}

export function normalizeSystemStudySelectionRoutes(
  input: SystemNavigationInput & {
    systemId: string;
    routes: readonly { routeType: string; routeId: string }[];
  }
): SystemStudySelectionRoute[] {
  if (!systemExists(input.systemId, input.concepts)) {
    throw new SystemStudySelectionError('invalid-system', 'The selected System is not available for study.');
  }
  if (input.routes.length === 0) {
    throw new SystemStudySelectionError('empty-selection', 'Select at least one Topic or curated Tag.');
  }

  const unique = new Map<string, SystemStudySelectionRoute>();
  for (const route of input.routes) {
    if (!route || (route.routeType !== 'topic' && route.routeType !== 'tag') || typeof route.routeId !== 'string') {
      throw new SystemStudySelectionError('invalid-route', 'Study selections must be Topic or curated Tag routes.');
    }
    const routeId = route.routeId.trim();
    if (!routeId) {
      throw new SystemStudySelectionError('invalid-route', 'Study selection IDs cannot be empty.');
    }
    if (!routeBelongsToSystem(input.systemId, route.routeType, routeId, input)) {
      throw new SystemStudySelectionError(
        'route-not-in-system',
        `The selected ${route.routeType === 'topic' ? 'Topic' : 'curated Tag'} is not available in this System.`
      );
    }
    unique.set(`${route.routeType}\u0000${routeId}`, { routeType: route.routeType, routeId });
  }

  const tagOrder = new Map(
    curatedTagsForSystem(input.systemId, input.systemTagRows).map((tag, index) => [tag.tagId, index])
  );
  return [...unique.values()].sort((left, right) => compareSelectionRoutes(left, right, tagOrder));
}

export function resolveSystemStudySelectionCandidates(
  input: SystemNavigationInput & {
    systemId: string;
    routes: readonly { routeType: string; routeId: string }[];
  }
) {
  const routes = normalizeSystemStudySelectionRoutes(input);
  const selectedTopics = new Set(
    routes.filter((route) => route.routeType === 'topic').map((route) => route.routeId)
  );
  const selectedTags = new Set(
    routes.filter((route) => route.routeType === 'tag').map((route) => route.routeId)
  );

  const byCase = new Map<string, SystemStudyCandidate>();
  for (const topicId of selectedTopics) {
    for (const candidate of exactTopicCandidates(input.systemId, topicId, input)) {
      byCase.set(candidate.id, candidate);
    }
  }
  for (const curated of curatedTagsForSystem(input.systemId, input.systemTagRows)) {
    if (!selectedTags.has(curated.tagId)) continue;
    for (const candidate of tagCandidates(input.systemId, curated.tagId, input)) {
      if (!byCase.has(candidate.id)) byCase.set(candidate.id, candidate);
    }
  }
  return [...byCase.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function resolveSystemStudyCandidates(
  input: SystemNavigationInput & { systemId: string; routeType: SystemRouteType; routeId?: string | null }
) {
  if (!systemExists(input.systemId, input.concepts)) return [];

  if (input.routeType === 'topic') {
    return input.routeId ? topicCandidates(input.systemId, input.routeId, input) : [];
  }
  if (input.routeType === 'tag') {
    return input.routeId ? tagCandidates(input.systemId, input.routeId, input) : [];
  }

  const byCase = new Map<string, SystemStudyCandidate>();
  for (const candidate of nativeSystemCandidates(input.systemId, input)) {
    byCase.set(candidate.id, candidate);
  }
  for (const curated of curatedTagsForSystem(input.systemId, input.systemTagRows)) {
    for (const candidate of tagCandidates(input.systemId, curated.tagId, input)) {
      if (!byCase.has(candidate.id)) byCase.set(candidate.id, candidate);
    }
  }
  return [...byCase.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function buildSystemStudyNavigation(input: SystemNavigationInput) {
  const nodes = activeNodes(input.concepts);
  const systems = nodes
    .filter((node) => node.kind === 'system')
    .sort((left, right) => (left.name ?? left.id).localeCompare(right.name ?? right.id) || left.id.localeCompare(right.id));

  return systems.flatMap((system) => {
    const topicChoices = descendantTopicIds(system.id, nodes, true)
      .map((topicId) => {
        const node = nodes.find((candidate) => candidate.id === topicId);
        const caseCount = exactTopicCandidates(system.id, topicId, input).length;
        const subtreeCaseCount = topicCandidates(system.id, topicId, input).length;
        return {
          id: topicId,
          routeType: 'topic' as const,
          name: node?.name ?? topicId,
          breadcrumb: conceptBreadcrumb(topicId, nodes).map((item) => ({ id: item.id, name: item.name ?? item.id, kind: item.kind })),
          caseCount,
          subtreeCaseCount
        };
      })
      .filter((choice) => choice.subtreeCaseCount > 0)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

    const tagChoices = curatedTagsForSystem(system.id, input.systemTagRows)
      .map((tag) => ({
        id: tag.tagId,
        routeType: 'tag' as const,
        name: tag.tagName,
        displayOrder: tag.displayOrder,
        caseCount: tagCandidates(system.id, tag.tagId, input).length
      }))
      .filter((choice) => choice.caseCount > 0);

    const allCaseCount = resolveSystemStudyCandidates({ ...input, systemId: system.id, routeType: 'all' }).length;
    if (allCaseCount === 0) return [];
    return [{
      id: system.id,
      name: system.name ?? system.id,
      allCaseCount,
      topics: topicChoices,
      tags: tagChoices
    }];
  });
}
