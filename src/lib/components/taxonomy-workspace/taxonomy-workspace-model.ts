export type TaxonomyKind = 'system' | 'topic';
export type WorkspaceFilter = 'all' | 'systems' | 'topics' | 'unassigned' | 'inactive';

export type TaxonomyCaseSummary = {
  id: string;
  title: string;
};

export type TaxonomyWorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  descriptionMd: string | null;
  kind: TaxonomyKind;
  parentId: string | null;
  isActive: boolean;
  breadcrumbLabel: string;
  systemId: string | null;
  unassigned: boolean;
  directCaseCount: number;
  descendantStudyCaseCount: number;
  activeSharedQuestionCount: number;
  directCases?: TaxonomyCaseSummary[];
};

export type TaxonomyWorkspaceRow = TaxonomyWorkspaceItem & {
  depth: number;
  childCount: number;
  directSubtopicCount: number;
  hasChildren: boolean;
  contextOnly: boolean;
};

export function taxonomyOptionLabel(item: TaxonomyWorkspaceItem) {
  const depth = Math.max(0, item.breadcrumbLabel.split(' → ').length - 1);
  return `${'\u00a0\u00a0'.repeat(depth)}${depth ? '↳ ' : ''}${item.name}`;
}

export type StagedTopicMove = {
  id: string;
  originalParentId: string | null;
  parentId: string | null;
};

export type StagedCasePrimaryTopicChange = {
  caseId: string;
  title: string;
  originalTopicId: string;
  topicId: string;
};

export type WorkspaceCaseAssignment = {
  id: string;
  title: string;
  originalTopicId: string;
  topicId: string;
  staged: boolean;
};

type BuildWorkspaceRowsInput = {
  search?: string;
  filter?: WorkspaceFilter;
  focusSystemId?: string | null;
  collapsedIds?: string[];
};

function compareItems(left: TaxonomyWorkspaceItem, right: TaxonomyWorkspaceItem) {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function normalizedParentId(value: string | null | undefined) {
  const parentId = String(value ?? '').trim();
  return parentId || null;
}

function matchesFilter(item: TaxonomyWorkspaceItem, filter: WorkspaceFilter) {
  if (filter === 'systems') return item.kind === 'system';
  if (filter === 'topics') return item.kind === 'topic';
  if (filter === 'unassigned') return item.kind === 'topic' && item.unassigned;
  if (filter === 'inactive') return !item.isActive;
  return true;
}

function matchesSearch(item: TaxonomyWorkspaceItem, search: string) {
  if (!search) return true;
  const caseTitles = item.directCases?.map((caseItem) => caseItem.title).join(' ') ?? '';
  const haystack = `${item.name} ${item.breadcrumbLabel} ${caseTitles}`.toLocaleLowerCase();
  return haystack.includes(search);
}

function isWithinFocusedSystem(
  item: TaxonomyWorkspaceItem,
  focusSystemId: string,
  byId: Map<string, TaxonomyWorkspaceItem>
) {
  if (item.id === focusSystemId) return true;
  let current = item.parentId ? byId.get(item.parentId) : null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.id === focusSystemId) return true;
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return false;
}

function includeAncestors(
  id: string,
  visibleIds: Set<string>,
  byId: Map<string, TaxonomyWorkspaceItem>
) {
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    visibleIds.add(current.id);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
}

function isDescendantOf(
  candidateId: string,
  ancestorId: string,
  byId: Map<string, TaxonomyWorkspaceItem>
) {
  let current = byId.get(candidateId);
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    if (current.parentId === ancestorId) return true;
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  return false;
}

function originalCases(items: TaxonomyWorkspaceItem[]) {
  const byCaseId = new Map<string, { id: string; title: string; originalTopicId: string }>();
  for (const item of items) {
    if (item.kind !== 'topic') continue;
    for (const caseItem of item.directCases ?? []) {
      if (!byCaseId.has(caseItem.id)) {
        byCaseId.set(caseItem.id, { id: caseItem.id, title: caseItem.title, originalTopicId: item.id });
      }
    }
  }
  return byCaseId;
}

export function listWorkspaceCases(
  items: TaxonomyWorkspaceItem[],
  changes: StagedCasePrimaryTopicChange[] = []
): WorkspaceCaseAssignment[] {
  const originals = originalCases(items);
  const changeByCaseId = new Map(changes.map((change) => [change.caseId, change]));
  return [...originals.values()]
    .map((caseItem) => {
      const change = changeByCaseId.get(caseItem.id);
      return {
        id: caseItem.id,
        title: caseItem.title,
        originalTopicId: caseItem.originalTopicId,
        topicId: change?.topicId ?? caseItem.originalTopicId,
        staged: Boolean(change)
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
}

export function casePrimaryTopicTargets(items: TaxonomyWorkspaceItem[]) {
  return items
    .filter((item) => item.kind === 'topic' && item.isActive)
    .sort((left, right) => left.breadcrumbLabel.localeCompare(right.breadcrumbLabel) || left.id.localeCompare(right.id));
}

export function stageCasePrimaryTopicChanges(
  items: TaxonomyWorkspaceItem[],
  changes: StagedCasePrimaryTopicChange[],
  caseIds: string[],
  topicId: string
): StagedCasePrimaryTopicChange[] {
  const targetTopic = items.find((item) => item.id === topicId && item.kind === 'topic' && item.isActive);
  if (!targetTopic) throw new Error('Choose an active Topic as the new Primary Topic.');

  const uniqueCaseIds = [...new Set(caseIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (!uniqueCaseIds.length) throw new Error('Select at least one Case.');
  if (uniqueCaseIds.length > 60) throw new Error('Select no more than 60 Cases at a time.');

  const existingTarget = changes[0]?.topicId ?? null;
  if (existingTarget && existingTarget !== topicId) {
    throw new Error('Apply or discard the current Primary Topic batch before staging Cases to a different Topic.');
  }

  const originals = originalCases(items);
  const selectedIds = new Set(uniqueCaseIds);
  const next = changes.filter((change) => !selectedIds.has(change.caseId));

  for (const caseId of uniqueCaseIds) {
    const caseItem = originals.get(caseId);
    if (!caseItem) throw new Error('One or more selected Cases are no longer available in this workspace. Refresh and try again.');
    if (caseItem.originalTopicId === topicId) continue;
    next.push({
      caseId,
      title: caseItem.title,
      originalTopicId: caseItem.originalTopicId,
      topicId
    });
  }

  return next.sort((left, right) => left.title.localeCompare(right.title) || left.caseId.localeCompare(right.caseId));
}

export function projectTaxonomyWithCasePrimaryTopics(
  items: TaxonomyWorkspaceItem[],
  changes: StagedCasePrimaryTopicChange[]
): TaxonomyWorkspaceItem[] {
  if (!changes.length) return items.map((item) => ({ ...item, directCases: item.directCases ? [...item.directCases] : item.directCases }));
  const assignments = listWorkspaceCases(items, changes);
  const casesByTopic = new Map<string, TaxonomyCaseSummary[]>();
  for (const caseItem of assignments) {
    const current = casesByTopic.get(caseItem.topicId) ?? [];
    current.push({ id: caseItem.id, title: caseItem.title });
    casesByTopic.set(caseItem.topicId, current);
  }
  for (const caseRows of casesByTopic.values()) {
    caseRows.sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
  }
  return items.map((item) => {
    if (item.kind !== 'topic') return { ...item };
    const directCases = casesByTopic.get(item.id) ?? [];
    return { ...item, directCases, directCaseCount: directCases.length };
  });
}

export function projectTaxonomyWithMoves(
  items: TaxonomyWorkspaceItem[],
  moves: StagedTopicMove[]
): TaxonomyWorkspaceItem[] {
  const parentByTopicId = new Map(moves.map((move) => [move.id, normalizedParentId(move.parentId)]));
  const projected = items.map((item) => item.kind === 'topic' && parentByTopicId.has(item.id)
    ? { ...item, parentId: parentByTopicId.get(item.id) ?? null }
    : { ...item });
  const byId = new Map(projected.map((item) => [item.id, item]));
  const childrenByParent = new Map<string, TaxonomyWorkspaceItem[]>();

  for (const item of projected) {
    if (!item.parentId || !byId.has(item.parentId)) continue;
    const children = childrenByParent.get(item.parentId) ?? [];
    children.push(item);
    childrenByParent.set(item.parentId, children);
  }

  const descendantCaseMemo = new Map<string, number>();
  const descendantCases = (id: string, path = new Set<string>()): number => {
    if (descendantCaseMemo.has(id)) return descendantCaseMemo.get(id) ?? 0;
    if (path.has(id)) return 0;
    const item = byId.get(id);
    if (!item) return 0;
    const nextPath = new Set(path);
    nextPath.add(id);
    let count = item.kind === 'topic' ? item.directCaseCount : 0;
    for (const child of childrenByParent.get(id) ?? []) {
      if (child.kind === 'topic') count += descendantCases(child.id, nextPath);
    }
    descendantCaseMemo.set(id, count);
    return count;
  };

  const hierarchyIdentity = (item: TaxonomyWorkspaceItem) => {
    const names = [item.name];
    let systemId = item.kind === 'system' ? item.id : null;
    let current = item;
    const seen = new Set([item.id]);

    while (current.parentId) {
      const parent = byId.get(current.parentId);
      if (!parent || seen.has(parent.id)) break;
      names.unshift(parent.name);
      if (parent.kind === 'system') systemId = parent.id;
      seen.add(parent.id);
      current = parent;
    }

    return {
      breadcrumbLabel: names.join(' → '),
      systemId,
      unassigned: item.kind === 'topic' && item.parentId === null
    };
  };

  return projected.map((item) => ({
    ...item,
    ...hierarchyIdentity(item),
    descendantStudyCaseCount: descendantCases(item.id)
  }));
}

export function topicMoveTargets(items: TaxonomyWorkspaceItem[], topicId: string) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const topic = byId.get(topicId);
  if (!topic || topic.kind !== 'topic') return [];

  return items
    .filter((item) => (
      item.isActive
      && item.id !== topicId
      && (item.kind === 'system' || item.kind === 'topic')
      && !isDescendantOf(item.id, topicId, byId)
    ))
    .sort((left, right) => left.breadcrumbLabel.localeCompare(right.breadcrumbLabel) || left.id.localeCompare(right.id));
}

export function canStageTopicMove(
  items: TaxonomyWorkspaceItem[],
  moves: StagedTopicMove[],
  topicId: string,
  parentId: string | null
) {
  const topic = items.find((item) => item.id === topicId);
  if (!topic || topic.kind !== 'topic') return false;
  const nextParentId = normalizedParentId(parentId);
  if (nextParentId === null) return true;

  const withoutCurrentMove = moves.filter((move) => move.id !== topicId);
  const projected = projectTaxonomyWithMoves(items, withoutCurrentMove);
  return topicMoveTargets(projected, topicId).some((target) => target.id === nextParentId);
}

export function stageTopicMove(
  items: TaxonomyWorkspaceItem[],
  moves: StagedTopicMove[],
  topicId: string,
  parentId: string | null
): StagedTopicMove[] {
  const topic = items.find((item) => item.id === topicId);
  if (!topic || topic.kind !== 'topic') throw new Error('Only Topics can be moved.');

  const nextParentId = normalizedParentId(parentId);
  if (!canStageTopicMove(items, moves, topicId, nextParentId)) {
    throw new Error('The selected Topic parent would create an invalid hierarchy.');
  }

  const originalParentId = normalizedParentId(topic.parentId);
  const withoutCurrentMove = moves.filter((move) => move.id !== topicId);
  if (nextParentId === originalParentId) return withoutCurrentMove;

  return [...withoutCurrentMove, { id: topicId, originalParentId, parentId: nextParentId }];
}

export function buildTaxonomyWorkspaceRows(
  items: TaxonomyWorkspaceItem[],
  input: BuildWorkspaceRowsInput = {}
): TaxonomyWorkspaceRow[] {
  const search = String(input.search ?? '').trim().toLocaleLowerCase();
  const filter = input.filter ?? 'all';
  const focusSystemId = input.focusSystemId ?? null;
  const collapsedIds = new Set(input.collapsedIds ?? []);
  const byId = new Map(items.map((item) => [item.id, item]));
  const focusedItems = focusSystemId
    ? items.filter((item) => isWithinFocusedSystem(item, focusSystemId, byId))
    : items;

  const needsContext = Boolean(search) || filter !== 'all';
  const matchingIds = new Set(
    focusedItems
      .filter((item) => matchesFilter(item, filter) && matchesSearch(item, search))
      .map((item) => item.id)
  );
  const visibleIds = needsContext ? new Set<string>() : new Set(focusedItems.map((item) => item.id));

  if (needsContext) {
    for (const id of matchingIds) includeAncestors(id, visibleIds, byId);
    if (focusSystemId && matchingIds.size) visibleIds.add(focusSystemId);
  }

  const childrenByParent = new Map<string | null, TaxonomyWorkspaceItem[]>();
  for (const item of focusedItems) {
    const parentKey = item.parentId && byId.has(item.parentId) ? item.parentId : null;
    const children = childrenByParent.get(parentKey) ?? [];
    children.push(item);
    childrenByParent.set(parentKey, children);
  }
  for (const children of childrenByParent.values()) children.sort(compareItems);

  const roots = focusSystemId
    ? focusedItems.filter((item) => item.id === focusSystemId)
    : (childrenByParent.get(null) ?? []).sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === 'system' ? -1 : 1;
        return compareItems(left, right);
      });

  const rows: TaxonomyWorkspaceRow[] = [];
  const visit = (item: TaxonomyWorkspaceItem, depth: number) => {
    if (!visibleIds.has(item.id)) return;
    const children = (childrenByParent.get(item.id) ?? []).filter((child) => visibleIds.has(child.id));
    rows.push({
      ...item,
      depth,
      childCount: children.length,
      directSubtopicCount: children.filter((child) => child.kind === 'topic').length,
      hasChildren: children.length > 0,
      contextOnly: needsContext && !matchingIds.has(item.id)
    });
    if (!needsContext && collapsedIds.has(item.id)) return;
    for (const child of children) visit(child, depth + 1);
  };

  for (const root of roots) visit(root, 0);
  return rows;
}

export function activeTaxonomyParents(items: TaxonomyWorkspaceItem[]) {
  return items
    .filter((item) => item.isActive && (item.kind === 'system' || item.kind === 'topic'))
    .sort((left, right) => left.breadcrumbLabel.localeCompare(right.breadcrumbLabel) || left.id.localeCompare(right.id));
}

export function activeSystemOptions(items: TaxonomyWorkspaceItem[]) {
  return items
    .filter((item) => item.kind === 'system' && item.isActive)
    .sort(compareItems);
}
