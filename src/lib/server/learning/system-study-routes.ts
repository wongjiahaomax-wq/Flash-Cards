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
  // Route normalization already proved that every selected Topic belongs to this
  // System. Resolve the native System candidate set once, then filter it by the
  // selected exact Topic IDs. This is semantically equivalent to calling
  // exactTopicCandidates once per selected Topic without repeatedly rescanning
  // the full Case/topic input for multi-route scopes.
  if (selectedTopics.size > 0) {
    for (const candidate of nativeSystemCandidates(input.systemId, input)) {
      if (selectedTopics.has(candidate.studyConceptId)) byCase.set(candidate.id, candidate);
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
  const nodeById = new Map<string, TaxonomyNode>();
  for (const node of nodes) {
    if (!nodeById.has(node.id)) nodeById.set(node.id, node);
  }
  const childrenByParent = new Map<string, TaxonomyNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  const topicIdsByRoot = new Map<string, string[]>();
  const descendantTopicIdsFor = (rootId: string) => {
    const cached = topicIdsByRoot.get(rootId);
    if (cached) return cached;

    const result: string[] = [];
    const queue = [...(childrenByParent.get(rootId) ?? [])];
    const seen = new Set<string>();
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      if (!node || seen.has(node.id)) continue;
      seen.add(node.id);
      if (node.kind === 'topic') result.push(node.id);
      queue.push(...(childrenByParent.get(node.id) ?? []));
    }
    topicIdsByRoot.set(rootId, result);
    return result;
  };

  const topicSubtreeIds = (topicId: string) => [topicId, ...descendantTopicIdsFor(topicId)];
  const breadcrumbByTopic = new Map<string, ReturnType<typeof conceptBreadcrumb>>();
  const breadcrumbFor = (topicId: string) => {
    const cached = breadcrumbByTopic.get(topicId);
    if (cached) return cached;
    const breadcrumb = conceptBreadcrumb(topicId, nodes);
    breadcrumbByTopic.set(topicId, breadcrumb);
    return breadcrumb;
  };

  const curatedTagsBySystem = new Map<string, SystemTagRow[]>();
  const curatedTagsFor = (systemId: string) => {
    const cached = curatedTagsBySystem.get(systemId);
    if (cached) return cached;
    const tags = curatedTagsForSystem(systemId, input.systemTagRows);
    curatedTagsBySystem.set(systemId, tags);
    return tags;
  };

  const nativeCandidatesBySystem = new Map<string, SystemStudyCandidate[]>();
  const nativeCandidatesFor = (systemId: string) => {
    const cached = nativeCandidatesBySystem.get(systemId);
    if (cached) return cached;

    const validTopics = new Set(descendantTopicIdsFor(systemId));
    const candidates = resolveCaseStudyCandidates({
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
        routeLabel: nodeById.get(candidate.studyConceptId)?.name ?? candidate.studyConceptId
      }];
    });
    nativeCandidatesBySystem.set(systemId, candidates);
    return candidates;
  };

  const topicCandidatesByRoute = new Map<string, SystemStudyCandidate[]>();
  const topicCandidatesFor = (systemId: string, topicId: string) => {
    const key = `${systemId}\u0000${topicId}`;
    const cached = topicCandidatesByRoute.get(key);
    if (cached) return cached;
    const subtree = new Set(topicSubtreeIds(topicId));
    const candidates = nativeCandidatesFor(systemId).filter((candidate) => subtree.has(candidate.studyConceptId));
    topicCandidatesByRoute.set(key, candidates);
    return candidates;
  };

  const topicRowsByCase = new Map<string, CaseTopicRow[]>();
  for (const row of input.caseTopicRows) {
    const rows = topicRowsByCase.get(row.id) ?? [];
    rows.push(row);
    topicRowsByCase.set(row.id, rows);
  }
  const caseTagRowsByTag = new Map<string, CaseTagRow[]>();
  for (const row of input.caseTagRows) {
    const rows = caseTagRowsByTag.get(row.tagId) ?? [];
    rows.push(row);
    caseTagRowsByTag.set(row.tagId, rows);
  }

  const tagCandidatesByRoute = new Map<string, SystemStudyCandidate[]>();
  const tagCandidatesFor = (systemId: string, tagId: string) => {
    const key = `${systemId}\u0000${tagId}`;
    const cached = tagCandidatesByRoute.get(key);
    if (cached) return cached;
    const curated = curatedTagsFor(systemId).find((row) => row.tagId === tagId);
    if (!curated) return [];

    const seen = new Set<string>();
    const candidates: SystemStudyCandidate[] = [];
    for (const match of caseTagRowsByTag.get(tagId) ?? []) {
      if (seen.has(match.caseId)) continue;
      const rows = topicRowsByCase.get(match.caseId) ?? [];
      const primary = rows.find((row) => row.role === 'primary');
      if (!primary) continue;
      const primaryConcept = nodeById.get(primary.conceptId);
      if (!primaryConcept || primaryConcept.kind !== 'topic') continue;
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
    candidates.sort((left, right) => left.id.localeCompare(right.id));
    tagCandidatesByRoute.set(key, candidates);
    return candidates;
  };

  const allCandidatesBySystem = new Map<string, SystemStudyCandidate[]>();
  const allCandidatesFor = (systemId: string) => {
    const cached = allCandidatesBySystem.get(systemId);
    if (cached) return cached;

    const byCase = new Map<string, SystemStudyCandidate>();
    for (const candidate of nativeCandidatesFor(systemId)) byCase.set(candidate.id, candidate);
    for (const tag of curatedTagsFor(systemId)) {
      for (const candidate of tagCandidatesFor(systemId, tag.tagId)) {
        if (!byCase.has(candidate.id)) byCase.set(candidate.id, candidate);
      }
    }
    const candidates = [...byCase.values()].sort((left, right) => left.id.localeCompare(right.id));
    allCandidatesBySystem.set(systemId, candidates);
    return candidates;
  };

  const systems = nodes
    .filter((node) => node.kind === 'system')
    .sort((left, right) => (left.name ?? left.id).localeCompare(right.name ?? right.id) || left.id.localeCompare(right.id));

  return systems.flatMap((system) => {
    const nativeCandidates = nativeCandidatesFor(system.id);
    const topicChoices = descendantTopicIdsFor(system.id)
      .map((topicId) => {
        const node = nodeById.get(topicId);
        const caseCount = nativeCandidates.filter((candidate) => candidate.studyConceptId === topicId).length;
        const subtreeCaseCount = topicCandidatesFor(system.id, topicId).length;
        return {
          id: topicId,
          routeType: 'topic' as const,
          name: node?.name ?? topicId,
          breadcrumb: breadcrumbFor(topicId).map((item) => ({ id: item.id, name: item.name ?? item.id, kind: item.kind })),
          caseCount,
          subtreeCaseCount
        };
      })
      .filter((choice) => choice.subtreeCaseCount > 0)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

    const tagChoices = curatedTagsFor(system.id)
      .map((tag) => ({
        id: tag.tagId,
        routeType: 'tag' as const,
        name: tag.tagName,
        displayOrder: tag.displayOrder,
        caseCount: tagCandidatesFor(system.id, tag.tagId).length
      }))
      .filter((choice) => choice.caseCount > 0);

    const allCaseCount = allCandidatesFor(system.id).length;
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
