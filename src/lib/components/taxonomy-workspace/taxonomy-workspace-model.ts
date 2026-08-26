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

type BuildWorkspaceRowsInput = {
  search?: string;
  filter?: WorkspaceFilter;
  focusSystemId?: string | null;
  collapsedIds?: string[];
};

function compareItems(left: TaxonomyWorkspaceItem, right: TaxonomyWorkspaceItem) {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
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
