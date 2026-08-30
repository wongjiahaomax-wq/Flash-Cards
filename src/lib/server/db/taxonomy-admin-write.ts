import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import { taxonomyConcepts } from './contextual-schema.ts';
import { buildTopicConceptInsert, listConceptTaxonomy } from './concept-taxonomy-compat.ts';
import { caseConcepts, cases, conceptQuestions, concepts, reviewQuestions, reviews } from './schema.js';
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
  if (kind !== 'system' && kind !== 'topic') throw new TaxonomyInputError('Concept kind must be System or Topic.');
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
  return listConceptTaxonomy(db);
}

function graphError(error: unknown): never {
  if (error instanceof TaxonomyGraphError) throw new TaxonomyInputError(error.message);
  throw error;
}

export type PreparedTaxonomyConceptCreation = {
  id: string;
  name: string;
  slug: string;
  descriptionMd: string | null;
  kind: ConceptKind;
  parentId: string | null;
};

export async function prepareTaxonomyConceptCreation(
  db: import('./index.js').LearningDb,
  input: { name: unknown; kind: unknown; parentId?: unknown; descriptionMd?: unknown }
): Promise<PreparedTaxonomyConceptCreation> {
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
  return { id, name, slug, descriptionMd: optionalText(input.descriptionMd), kind, parentId };
}

export function buildTaxonomyConceptCreationWrite(
  db: import('./index.js').LearningDb,
  concept: PreparedTaxonomyConceptCreation
) {
  if (concept.kind === 'topic') {
    return buildTopicConceptInsert(db, {
      id: concept.id,
      name: concept.name,
      slug: concept.slug,
      descriptionMd: concept.descriptionMd,
      parentId: concept.parentId,
      isActive: true
    });
  }
  return db.insert(taxonomyConcepts).values({
    id: concept.id,
    name: concept.name,
    slug: concept.slug,
    descriptionMd: concept.descriptionMd,
    kind: concept.kind,
    parentId: null,
    isActive: true
  });
}

export function taxonomyConceptCreationError(error: unknown): unknown {
  if (error instanceof Error && /unique|constraint/i.test(error.message)) {
    return new TaxonomyInputError('That concept could not be created because its taxonomy state conflicts with current data.');
  }
  return error;
}

export async function createTaxonomyConcept(
  db: import('./index.js').LearningDb,
  input: { name: unknown; kind: unknown; parentId?: unknown; descriptionMd?: unknown }
) {
  const concept = await prepareTaxonomyConceptCreation(db, input);
  try {
    await buildTaxonomyConceptCreationWrite(db, concept);
  } catch (error) {
    throw taxonomyConceptCreationError(error);
  }
  return { id: concept.id, name: concept.name, slug: concept.slug, kind: concept.kind, parentId: concept.parentId };
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
    if (caseUsage[0] || questionUsage[0]) throw new TaxonomyInputError('A Topic with Case or reusable-question usages cannot be reclassified as a System. Move those Topic usages first.');
  }

  if (target.kind === 'system' && kind !== 'system') {
    const relationships = await db.select({ tagId: systemTags.tagId }).from(systemTags).where(eq(systemTags.systemConceptId, conceptId)).limit(1);
    if (relationships[0]) throw new TaxonomyInputError('Remove this System’s exposed Tags before changing it to a Topic.');
  }
  if (target.kind === 'system' && !isActive) {
    const relationships = await db.select({ tagId: systemTags.tagId }).from(systemTags).where(eq(systemTags.systemConceptId, conceptId)).limit(1);
    if (relationships[0]) throw new TaxonomyInputError('Remove this System’s exposed Tags before deactivating it.');
  }

  const proposed = graph.map((node) => node.id === conceptId ? { ...node, name, kind, isActive } : node);
  try {
    validateTaxonomyGraph(proposed);
  } catch (error) {
    graphError(error);
  }

  try {
    await db.update(taxonomyConcepts).set({ name, descriptionMd: optionalText(input.descriptionMd), kind, isActive, updatedAt: new Date() }).where(eq(taxonomyConcepts.id, conceptId));
  } catch (error) {
    if (error instanceof Error && /constraint|abort/i.test(error.message)) throw new TaxonomyInputError(error.message);
    throw error;
  }
}

export async function deleteUnusedTopic(
  db: import('./index.js').LearningDb,
  input: { conceptId: unknown }
) {
  const conceptId = requiredText(input.conceptId, 'Topic');
  const graph = await loadGraph(db);
  const target = graph.find((node) => node.id === conceptId);
  if (!target) throw new TaxonomyInputError('The selected Topic does not exist.');
  if (target.kind !== 'topic') throw new TaxonomyInputError('Only Topics can be deleted. Systems cannot be deleted here.');

  const [caseUsage, questionUsage, reviewUsage, reviewQuestionUsage] = await Promise.all([
    db.select({ id: caseConcepts.caseId }).from(caseConcepts).where(eq(caseConcepts.conceptId, conceptId)).limit(1),
    db.select({ id: conceptQuestions.id }).from(conceptQuestions).where(eq(conceptQuestions.conceptId, conceptId)).limit(1),
    db.select({ id: reviews.id }).from(reviews).where(or(
      eq(reviews.primaryConceptId, conceptId),
      eq(reviews.studyConceptId, conceptId),
      eq(reviews.studySystemConceptId, conceptId),
      and(eq(reviews.navigationRouteType, 'topic'), eq(reviews.navigationRouteId, conceptId))
    )).limit(1),
    db.select({ id: reviewQuestions.id }).from(reviewQuestions).where(eq(reviewQuestions.sourceConceptId, conceptId)).limit(1)
  ]);
  const hasChildren = graph.some((node) => node.parentId === conceptId);
  if (caseUsage[0] || questionUsage[0] || hasChildren) {
    throw new TaxonomyInputError('This Topic cannot be deleted while it has Case attachments, reusable Topic questions, or child Topics. Remove those relationships first.');
  }
  if (reviewUsage[0] || reviewQuestionUsage[0]) {
    throw new TaxonomyInputError('This Topic is referenced by learner Review history and cannot be deleted.');
  }

  try {
    await db.delete(taxonomyConcepts).where(and(eq(taxonomyConcepts.id, conceptId), eq(taxonomyConcepts.kind, 'topic')));
  } catch (error) {
    if (error instanceof Error && /constraint|foreign key|abort/i.test(error.message)) {
      throw new TaxonomyInputError('This Topic is still referenced by content or learning history and cannot be deleted.');
    }
    throw error;
  }

  const remaining = await db.select({ id: taxonomyConcepts.id }).from(taxonomyConcepts).where(eq(taxonomyConcepts.id, conceptId)).limit(1);
  if (remaining[0]) throw new TaxonomyInputError('The selected Topic changed before it could be deleted. Reload and try again.');
}

export async function applyTaxonomyHierarchy(db: import('./index.js').LearningDb, changes: ParentChange[]) {
  if (!Array.isArray(changes) || changes.length > 500) throw new TaxonomyInputError('Hierarchy updates must contain at most 500 staged moves.');
  const graph = await loadGraph(db);
  let proposed: TaxonomyNode[];
  try {
    proposed = applyParentChanges(graph, changes.map((change) => ({ id: requiredText(change.id, 'Concept'), parentId: optionalText(change.parentId) })));
  } catch (error) {
    graphError(error);
  }

  const currentById = new Map(graph.map((node) => [node.id, node]));
  const proposedById = new Map(proposed.map((node) => [node.id, node]));
  const changedIds = [...proposedById.keys()].filter((id) => currentById.get(id)?.parentId !== proposedById.get(id)?.parentId);
  if (!changedIds.length) return;
  if (typeof db.batch !== 'function') throw new TaxonomyInputError('Atomic hierarchy updates require D1 batch support.');

  const detachWrites = changedIds.map((id) => db.update(concepts).set({ parentId: null, updatedAt: new Date() }).where(eq(concepts.id, id)));
  const attachWrites = changedIds.flatMap((id) => {
    const parentId = proposedById.get(id)?.parentId ?? null;
    if (!parentId) return [];
    return [db.update(concepts).set({ parentId, updatedAt: new Date() }).where(eq(concepts.id, id))];
  });

  try {
    await db.batch([...detachWrites, ...attachWrites] as [any, ...any[]]);
  } catch (error) {
    if (error instanceof Error && /constraint|abort|cycle|parent/i.test(error.message)) throw new TaxonomyInputError(error.message);
    throw error;
  }
}

async function requireActiveTopLevelSystem(db: import('./index.js').LearningDb, systemId: string) {
  const system = await db.select({ id: taxonomyConcepts.id, name: taxonomyConcepts.name }).from(taxonomyConcepts).where(and(
    eq(taxonomyConcepts.id, systemId),
    eq(taxonomyConcepts.kind, 'system'),
    eq(taxonomyConcepts.isActive, true),
    isNull(taxonomyConcepts.parentId)
  )).limit(1);
  if (!system[0]) throw new TaxonomyInputError('The selected System is missing, inactive, or not top-level.');
  return system[0];
}

export async function assignPrimaryTopicToSystem(
  db: import('./index.js').LearningDb,
  input: { caseId: unknown; topicId: unknown; systemId: unknown }
) {
  const caseId = requiredText(input.caseId, 'Case');
  const topicId = requiredText(input.topicId, 'Primary Topic');
  const systemId = requiredText(input.systemId, 'System');
  const [productionCase, topic, system, primaryTopics] = await Promise.all([
    db.select({ id: cases.id }).from(cases).where(and(eq(cases.id, caseId), eq(cases.isActive, true), isNull(cases.previewSessionId))).limit(1),
    db.select({ id: taxonomyConcepts.id }).from(taxonomyConcepts).where(and(eq(taxonomyConcepts.id, topicId), eq(taxonomyConcepts.kind, 'topic'), eq(taxonomyConcepts.isActive, true))).limit(1),
    requireActiveTopLevelSystem(db, systemId),
    db.select({ topicId: caseConcepts.conceptId }).from(caseConcepts).where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.role, 'primary')))
  ]);
  if (!productionCase[0]) throw new TaxonomyInputError('The selected Case is not an active Production Case.');
  if (!topic[0]) throw new TaxonomyInputError('The selected Primary Topic is missing, inactive, or classified as a System.');
  if (primaryTopics.length !== 1 || primaryTopics[0].topicId !== topicId) {
    throw new TaxonomyInputError('The selected Topic is not the current Primary Topic for this Case.');
  }
  await applyTaxonomyHierarchy(db, [{ id: topicId, parentId: systemId }]);
  return { topicId, system };
}

/** Move one globally shared Topic, using its active Production Case editor as authority. */
export async function moveTopicToSystem(
  db: import('./index.js').LearningDb,
  input: { caseId: unknown; topicId: unknown; systemId: unknown }
) {
  return assignPrimaryTopicToSystem(db, input);
}

/** Move the minimal Primary Topic roots used by selected active Production Cases. */
export async function bulkMoveCaseTopicsToSystem(
  db: import('./index.js').LearningDb,
  input: { caseIds: unknown[]; systemId: unknown }
) {
  const caseIds = [...new Set((input.caseIds ?? []).map((caseId) => requiredText(caseId, 'Case')))];
  if (!caseIds.length) throw new TaxonomyInputError('Select at least one Case.');
  if (caseIds.length > 60) throw new TaxonomyInputError('Select no more than 60 Cases at a time.');
  const systemId = requiredText(input.systemId, 'System');
  const system = await requireActiveTopLevelSystem(db, systemId);

  const rows = await db.select({ caseId: caseConcepts.caseId, topicId: caseConcepts.conceptId })
    .from(caseConcepts)
    .innerJoin(cases, eq(cases.id, caseConcepts.caseId))
    .where(and(
      inArray(caseConcepts.caseId, caseIds),
      eq(caseConcepts.role, 'primary'),
      eq(cases.isActive, true),
      isNull(cases.previewSessionId)
    ));
  const topicsByCase = new Map<string, string[]>();
  for (const row of rows) topicsByCase.set(row.caseId, [...(topicsByCase.get(row.caseId) ?? []), row.topicId]);
  if (caseIds.some((caseId) => (topicsByCase.get(caseId) ?? []).length !== 1)) {
    throw new TaxonomyInputError('Every selected active Production Case must have exactly one Primary Topic.');
  }

  const topicIds = [...new Set(rows.map((row) => row.topicId))];
  const activeTopics = await db.select({ id: taxonomyConcepts.id }).from(taxonomyConcepts).where(and(
    inArray(taxonomyConcepts.id, topicIds),
    eq(taxonomyConcepts.kind, 'topic'),
    eq(taxonomyConcepts.isActive, true)
  ));
  if (activeTopics.length !== topicIds.length) throw new TaxonomyInputError('Every selected Case Primary Topic must be active.');

  const graph = await loadGraph(db);
  const parentById = new Map(graph.map((node) => [node.id, node.parentId]));
  const selectedTopicIds = new Set(topicIds);
  const moveRootIds = topicIds.filter((topicId) => {
    const visited = new Set<string>();
    let parentId = parentById.get(topicId) ?? null;
    while (parentId) {
      if (selectedTopicIds.has(parentId)) return false;
      if (visited.has(parentId)) throw new TaxonomyInputError('The current taxonomy hierarchy contains a cycle.');
      visited.add(parentId);
      parentId = parentById.get(parentId) ?? null;
    }
    return true;
  });

  await applyTaxonomyHierarchy(db, moveRootIds.map((topicId) => ({ id: topicId, parentId: systemId })));
  return { selectedCount: caseIds.length, topicCount: moveRootIds.length, system };
}

export async function replaceSystemTags(
  db: import('./index.js').LearningDb,
  input: { systemId: unknown; tagIds: unknown[] }
) {
  const systemId = requiredText(input.systemId, 'System');
  const tagIds = input.tagIds.map((tagId) => requiredText(tagId, 'Tag'));
  if (tagIds.length > 200) throw new TaxonomyInputError('A System may expose at most 200 Tags.');
  if (new Set(tagIds).size !== tagIds.length) throw new TaxonomyInputError('A Tag can appear only once within a System.');
  if (typeof db.batch !== 'function') throw new TaxonomyInputError('Atomic System Tag updates require D1 batch support.');

  const system = await db.select({ id: taxonomyConcepts.id }).from(taxonomyConcepts).where(and(eq(taxonomyConcepts.id, systemId), eq(taxonomyConcepts.kind, 'system'), eq(taxonomyConcepts.isActive, true))).limit(1);
  if (!system[0]) throw new TaxonomyInputError('The selected System is missing, inactive, or not classified as a System.');

  if (tagIds.length) {
    const activeTags = await db.select({ id: tags.id }).from(tags).where(and(inArray(tags.id, tagIds), eq(tags.isActive, true)));
    if (activeTags.length !== tagIds.length) throw new TaxonomyInputError('Only active Tags can be exposed in a System.');
  }

  const removeExisting = db.delete(systemTags).where(eq(systemTags.systemConceptId, systemId));
  const writes: any[] = [removeExisting];
  if (tagIds.length) writes.push(db.insert(systemTags).values(tagIds.map((tagId, displayOrder) => ({ systemConceptId: systemId, tagId, displayOrder }))));
  try {
    await db.batch(writes as [any, ...any[]]);
  } catch (error) {
    if (error instanceof Error && /constraint|abort/i.test(error.message)) throw new TaxonomyInputError(error.message);
    throw error;
  }
}