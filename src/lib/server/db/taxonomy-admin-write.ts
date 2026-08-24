import { and, asc, eq, inArray, or } from 'drizzle-orm';

import { caseConcepts, conceptQuestions, concepts } from './schema.js';
import { systemTags, tags } from './tag-schema.js';
import {
  applyParentChanges,
  TaxonomyGraphError,
  validateTaxonomyGraph,
  type ConceptKind,
  type ParentChange,
  type TaxonomyNode
} from '../learning/taxonomy-graph.ts';

export class TaxonomyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaxonomyInputError';
  }
}

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new TaxonomyInputError(`${label} is required.`);
  return text;
}

function optionalText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function booleanValue(value: unknown) {
  return value === true || value === 'true' || value === '1' || value === 'on';
}

function conceptKind(value: unknown): ConceptKind {
  const kind = String(value ?? '').trim();
  if (kind !== 'system' && kind !== 'topic') {
    throw new TaxonomyInputError('Concept kind must be System or Topic.');
  }
  return kind;
}

function slugBase(name: string) {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'topic';
}

async function uniqueSlug(db: import('./index.js').LearningDb, name: string) {
  const base = slugBase(name);
  let slug = base;
  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const existing = await db.select({ id: concepts.id }).from(concepts).where(eq(concepts.slug, slug)).limit(1);
    if (!existing[0]) return slug;
    slug = `${base}-${suffix}`;
  }
  throw new TaxonomyInputError('Unable to generate a unique concept slug.');
}

async function loadGraph(db: import('./index.js').LearningDb) {
  return db
    .select({
      id: concepts.id,
      name: concepts.name,
      kind: concepts.kind,
      parentId: concepts.parentId,
      isActive: concepts.isActive
    })
    .from(concepts)
    .orderBy(asc(concepts.name), asc(concepts.id));
}

function graphError(error: unknown): never {
  if (error instanceof TaxonomyGraphError) throw new TaxonomyInputError(error.message);
  throw error;
}

export async function createTaxonomyConcept(
  db: import('./index.js').LearningDb,
  input: { name: unknown; kind: unknown; parentId?: unknown; descriptionMd?: unknown }
) {
  const name = requiredText(input.name, 'Concept name');
  if (name.length > 200) throw new TaxonomyInputError('Concept name must be 200 characters or fewer.');
  const kind = conceptKind(input.kind);
  const parentId = kind === 'system' ? null : optionalText(input.parentId);
  const graph = await loadGraph(db);
  const id = crypto.randomUUID();
  const proposed: TaxonomyNode[] = [...graph, { id, name, kind, parentId, isActive: true }];
  try {
    validateTaxonomyGraph(proposed);
  } catch (error) {
    graphError(error);
  }
  const slug = await uniqueSlug(db, name);
  try {
    await db.insert(concepts).values({
      id,
      name,
      slug,
      descriptionMd: optionalText(input.descriptionMd),
      kind,
      parentId,
      isActive: true
    });
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new TaxonomyInputError('That concept could not be created because its taxonomy state conflicts with current data.');
    }
    throw error;
  }
  return { id, name, slug, kind, parentId };
}

export async function updateTaxonomyConcept(
  db: import('./index.js').LearningDb,
  input: { conceptId: unknown; name: unknown; descriptionMd?: unknown; kind: unknown; isActive: unknown }
) {
  const conceptId = requiredText(input.conceptId, 'Concept');
  const name = requiredText(input.name, 'Concept name');
  if (name.length > 200) throw new TaxonomyInputError('Concept name must be 200 characters or fewer.');
  const kind = conceptKind(input.kind);
  const isActive = booleanValue(input.isActive);
  const graph = await loadGraph(db);
  const target = graph.find((node) => node.id === conceptId);
  if (!target) throw new TaxonomyInputError('The selected concept does not exist.');

  if (target.kind === 'topic' && kind === 'system') {
    const [caseUsage, questionUsage] = await Promise.all([
      db.select({ id: caseConcepts.caseId }).from(caseConcepts).where(eq(caseConcepts.conceptId, conceptId)).limit(1),
      db.select({ id: conceptQuestions.id }).from(conceptQuestions).where(eq(conceptQuestions.conceptId, conceptId)).limit(1)
    ]);
    if (caseUsage[0] || questionUsage[0]) {
      throw new TaxonomyInputError('A Topic with Case or reusable-question usages cannot be reclassified as a System. Move those Topic usages first.');
    }
  }

  if (target.kind === 'system' && kind !== 'system') {
    const relationships = await db
      .select({ tagId: systemTags.tagId })
      .from(systemTags)
      .where(eq(systemTags.systemConceptId, conceptId))
      .limit(1);
    if (relationships[0]) {
      throw new TaxonomyInputError('Remove this System’s exposed Tags before changing it to a Topic.');
    }
  }
  if (target.kind === 'system' && !isActive) {
    const relationships = await db
      .select({ tagId: systemTags.tagId })
      .from(systemTags)
      .where(eq(systemTags.systemConceptId, conceptId))
      .limit(1);
    if (relationships[0]) {
      throw new TaxonomyInputError('Remove this System’s exposed Tags before deactivating it.');
    }
  }

  const proposed = graph.map((node) => node.id === conceptId ? { ...node, name, kind, isActive } : node);
  try {
    validateTaxonomyGraph(proposed);
  } catch (error) {
    graphError(error);
  }

  try {
    await db
      .update(concepts)
      .set({ name, descriptionMd: optionalText(input.descriptionMd), kind, isActive, updatedAt: new Date() })
      .where(eq(concepts.id, conceptId));
  } catch (error) {
    if (error instanceof Error && /constraint|abort/i.test(error.message)) {
      throw new TaxonomyInputError(error.message);
    }
    throw error;
  }
}

export async function applyTaxonomyHierarchy(
  db: import('./index.js').LearningDb,
  changes: ParentChange[]
) {
  if (!Array.isArray(changes) || changes.length > 500) {
    throw new TaxonomyInputError('Hierarchy updates must contain at most 500 staged moves.');
  }
  const graph = await loadGraph(db);
  let proposed: TaxonomyNode[];
  try {
    proposed = applyParentChanges(graph, changes.map((change) => ({
      id: requiredText(change.id, 'Concept'),
      parentId: optionalText(change.parentId)
    })));
  } catch (error) {
    graphError(error);
  }

  const currentById = new Map(graph.map((node) => [node.id, node]));
  const proposedById = new Map(proposed.map((node) => [node.id, node]));
  const changedIds = [...proposedById.keys()].filter((id) => currentById.get(id)?.parentId !== proposedById.get(id)?.parentId);
  if (!changedIds.length) return;
  if (typeof db.batch !== 'function') {
    throw new TaxonomyInputError('Atomic hierarchy updates require D1 batch support.');
  }

  const detachWrites = changedIds.map((id) =>
    db.update(concepts).set({ parentId: null, updatedAt: new Date() }).where(eq(concepts.id, id))
  );
  const attachWrites = changedIds.flatMap((id) => {
    const parentId = proposedById.get(id)?.parentId ?? null;
    if (!parentId) return [];
    return [db.update(concepts).set({ parentId, updatedAt: new Date() }).where(eq(concepts.id, id))];
  });

  try {
    await db.batch(/** @type {[any, ...any[]]} */ ([...detachWrites, ...attachWrites]));
  } catch (error) {
    if (error instanceof Error && /constraint|abort|cycle|parent/i.test(error.message)) {
      throw new TaxonomyInputError(error.message);
    }
    throw error;
  }
}

export async function replaceSystemTags(
  db: import('./index.js').LearningDb,
  input: { systemId: unknown; tagIds: unknown[] }
) {
  const systemId = requiredText(input.systemId, 'System');
  const tagIds = input.tagIds.map((tagId) => requiredText(tagId, 'Tag'));
  if (tagIds.length > 200) throw new TaxonomyInputError('A System may expose at most 200 Tags.');
  if (new Set(tagIds).size !== tagIds.length) throw new TaxonomyInputError('A Tag can appear only once within a System.');
  if (typeof db.batch !== 'function') {
    throw new TaxonomyInputError('Atomic System Tag updates require D1 batch support.');
  }

  const system = await db
    .select({ id: concepts.id })
    .from(concepts)
    .where(and(eq(concepts.id, systemId), eq(concepts.kind, 'system'), eq(concepts.isActive, true)))
    .limit(1);
  if (!system[0]) throw new TaxonomyInputError('The selected System is missing, inactive, or not classified as a System.');

  if (tagIds.length) {
    const activeTags = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(inArray(tags.id, tagIds), eq(tags.isActive, true)));
    if (activeTags.length !== tagIds.length) throw new TaxonomyInputError('Only active Tags can be exposed in a System.');
  }

  const removeExisting = db.delete(systemTags).where(eq(systemTags.systemConceptId, systemId));
  const writes: any[] = [removeExisting];
  if (tagIds.length) {
    writes.push(db.insert(systemTags).values(tagIds.map((tagId, displayOrder) => ({ systemConceptId: systemId, tagId, displayOrder }))));
  }
  try {
    await db.batch(/** @type {[any, ...any[]]} */ (writes));
  } catch (error) {
    if (error instanceof Error && /constraint|abort/i.test(error.message)) {
      throw new TaxonomyInputError(error.message);
    }
    throw error;
  }
}
