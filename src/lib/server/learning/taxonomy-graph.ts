export type ConceptKind = 'system' | 'topic';

export type TaxonomyNode = {
  id: string;
  name?: string;
  kind: ConceptKind | string;
  parentId: string | null;
  isActive?: boolean;
};

export type ParentChange = {
  id: string;
  parentId: string | null;
};

export class TaxonomyGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaxonomyGraphError';
  }
}

function nodeMap(nodes: TaxonomyNode[]) {
  const byId = new Map<string, TaxonomyNode>();
  for (const node of nodes) {
    if (!node.id || byId.has(node.id)) {
      throw new TaxonomyGraphError('Taxonomy concept identifiers must be unique and non-empty.');
    }
    byId.set(node.id, node);
  }
  return byId;
}

export function validateTaxonomyGraph(nodes: TaxonomyNode[]) {
  const byId = nodeMap(nodes);

  for (const node of nodes) {
    if (node.kind !== 'system' && node.kind !== 'topic') {
      throw new TaxonomyGraphError(`Concept ${node.name ?? node.id} has an invalid kind.`);
    }
    if (node.kind === 'system' && node.parentId !== null) {
      throw new TaxonomyGraphError(`System ${node.name ?? node.id} must be top-level.`);
    }
    if (!node.parentId) continue;
    if (node.parentId === node.id) {
      throw new TaxonomyGraphError(`Concept ${node.name ?? node.id} cannot be its own parent.`);
    }
    const parent = byId.get(node.parentId);
    if (!parent) {
      throw new TaxonomyGraphError(`Concept ${node.name ?? node.id} references a missing parent.`);
    }
    if (parent.isActive === false) {
      throw new TaxonomyGraphError(`Concept ${node.name ?? node.id} cannot use an inactive parent.`);
    }
  }

  const state = new Map<string, 'visiting' | 'visited'>();
  const visit = (id: string) => {
    const current = state.get(id);
    if (current === 'visiting') throw new TaxonomyGraphError('Concept hierarchy cannot contain a cycle.');
    if (current === 'visited') return;
    state.set(id, 'visiting');
    const parentId = byId.get(id)?.parentId;
    if (parentId) visit(parentId);
    state.set(id, 'visited');
  };
  for (const node of nodes) visit(node.id);

  return byId;
}

export function applyParentChanges(nodes: TaxonomyNode[], changes: ParentChange[]) {
  const byId = nodeMap(nodes);
  const seen = new Set<string>();
  for (const change of changes) {
    if (seen.has(change.id)) throw new TaxonomyGraphError(`Concept ${change.id} has more than one proposed move.`);
    seen.add(change.id);
    if (!byId.has(change.id)) throw new TaxonomyGraphError(`Concept ${change.id} does not exist.`);
    if (change.parentId !== null && !byId.has(change.parentId)) {
      throw new TaxonomyGraphError(`Concept ${change.id} references a missing proposed parent.`);
    }
  }

  const proposed = nodes.map((node) => {
    const change = changes.find((item) => item.id === node.id);
    return change ? { ...node, parentId: change.parentId } : { ...node };
  });
  validateTaxonomyGraph(proposed);
  return proposed;
}

export function systemAncestorId(conceptId: string, nodes: TaxonomyNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  let current = byId.get(conceptId);
  while (current) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    if (current.kind === 'system') return current.id;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return null;
}

export function conceptBreadcrumb(conceptId: string, nodes: TaxonomyNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result: TaxonomyNode[] = [];
  const seen = new Set<string>();
  let current = byId.get(conceptId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    result.push(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return result.reverse();
}

export function descendantTopicIds(rootId: string, nodes: TaxonomyNode[], activeOnly = true) {
  const byParent = new Map<string, TaxonomyNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = byParent.get(node.parentId) ?? [];
    children.push(node);
    byParent.set(node.parentId, children);
  }

  const result: string[] = [];
  const queue = [...(byParent.get(rootId) ?? [])];
  const seen = new Set<string>();
  while (queue.length) {
    const node = queue.shift();
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    if (node.kind === 'topic' && (!activeOnly || node.isActive !== false)) result.push(node.id);
    queue.push(...(byParent.get(node.id) ?? []));
  }
  return result;
}

export function descendantConceptIds(rootId: string, nodes: TaxonomyNode[], includeRoot = false) {
  const byParent = new Map<string, TaxonomyNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = byParent.get(node.parentId) ?? [];
    children.push(node);
    byParent.set(node.parentId, children);
  }
  const result: string[] = includeRoot ? [rootId] : [];
  const queue = [...(byParent.get(rootId) ?? [])];
  const seen = new Set(result);
  while (queue.length) {
    const node = queue.shift();
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    result.push(node.id);
    queue.push(...(byParent.get(node.id) ?? []));
  }
  return result;
}
