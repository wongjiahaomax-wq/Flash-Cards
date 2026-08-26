import { asc } from 'drizzle-orm';

import { taxonomyConcepts } from './contextual-schema.ts';
import { applyTaxonomyHierarchy, TaxonomyInputError } from './taxonomy-admin-write.ts';

export type StagedTaxonomyHierarchyChange = {
  id: unknown;
  parentId: unknown;
  expectedParentId: unknown;
};

export type NormalizedStagedHierarchyChange = {
  id: string;
  parentId: string | null;
  expectedParentId: string | null;
};

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new TaxonomyInputError(`${label} is required.`);
  return text;
}

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function hasExpectedParent(change: unknown): change is StagedTaxonomyHierarchyChange {
  return Boolean(change && typeof change === 'object' && Object.prototype.hasOwnProperty.call(change, 'expectedParentId'));
}

function normalizeChanges(changes: StagedTaxonomyHierarchyChange[]): NormalizedStagedHierarchyChange[] {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 500) {
    throw new TaxonomyInputError('Staged hierarchy updates must contain between 1 and 500 Topic moves.');
  }

  const normalized = changes.map((change) => {
    if (!hasExpectedParent(change)) {
      throw new TaxonomyInputError('Every staged hierarchy move must include its original parent for stale-state validation.');
    }
    return {
      id: requiredText(change.id, 'Topic'),
      parentId: optionalText(change.parentId),
      expectedParentId: optionalText(change.expectedParentId)
    };
  });

  if (new Set(normalized.map((change) => change.id)).size !== normalized.length) {
    throw new TaxonomyInputError('Each Topic may appear only once in a staged hierarchy update.');
  }
  return normalized;
}

export async function validateStagedTaxonomyHierarchy(
  db: import('./index.js').LearningDb,
  changes: StagedTaxonomyHierarchyChange[]
) {
  const normalized = normalizeChanges(changes);
  const graph = await db
    .select({ id: taxonomyConcepts.id, parentId: taxonomyConcepts.parentId })
    .from(taxonomyConcepts)
    .orderBy(asc(taxonomyConcepts.id));
  const currentById = new Map(graph.map((node) => [node.id, node.parentId ?? null]));

  for (const change of normalized) {
    if (!currentById.has(change.id) || currentById.get(change.id) !== change.expectedParentId) {
      throw new TaxonomyInputError(
        'Taxonomy changed since this workspace was loaded. Refresh and review the staged hierarchy changes.'
      );
    }
  }

  return normalized;
}

export async function applyValidatedTaxonomyHierarchy(
  db: import('./index.js').LearningDb,
  changes: NormalizedStagedHierarchyChange[]
) {
  await applyTaxonomyHierarchy(db, changes.map(({ id, parentId }) => ({ id, parentId })));
}

export async function applyStagedTaxonomyHierarchy(
  db: import('./index.js').LearningDb,
  changes: StagedTaxonomyHierarchyChange[]
) {
  const normalized = await validateStagedTaxonomyHierarchy(db, changes);
  await applyValidatedTaxonomyHierarchy(db, normalized);
}
