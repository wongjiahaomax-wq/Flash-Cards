import { and, asc, eq } from 'drizzle-orm';

import { conceptBreadcrumb } from '../learning/taxonomy-graph.ts';
import {
  buildTopicConceptInsert,
  listActiveConceptTaxonomy,
  listConceptTaxonomy,
  requireActiveTopicConcept
} from './concept-taxonomy-compat.ts';
import { ContentGuardError, requireProductionCase } from './content-guards.js';
import { caseConcepts, cases, concepts } from './schema.js';
import { getCaseStimulusCoverageRequirement } from './stimulus-groups.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class AdminContentInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AdminContentInputError';
  }
}

/** @param {string} value @param {string} label */
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new AdminContentInputError(`${label} is required.`);
  return text;
}

/** @param {string | null | undefined} value */
function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

/** @param {unknown} mode @param {unknown} count */
function questionSelection(mode, count) {
  const selectedMode = String(mode || 'automatic');
  if (!['automatic', 'all', 'fixed'].includes(selectedMode)) {
    throw new AdminContentInputError('Question selection must be Automatic, Ask all eligible, or Choose N.');
  }
  if (selectedMode !== 'fixed') return { mode: selectedMode, count: null };
  const selectedCount = Number(count);
  if (!Number.isInteger(selectedCount) || selectedCount < 1) {
    throw new AdminContentInputError('Choose N questions requires a positive integer.');
  }
  return { mode: selectedMode, count: selectedCount };
}

/** @param {LearningDb} db @param {string} caseId @param {{ mode: string, count: number | null }} selection */
async function validateCaseQuestionCoverage(db, caseId, selection) {
  if (selection.mode !== 'fixed' || !selection.count) return;
  const requiredTotal = await getCaseStimulusCoverageRequirement(db, caseId);
  if (requiredTotal > selection.count) {
    throw new AdminContentInputError(`This Case needs at least ${requiredTotal} questions to satisfy its active Stimulus Group guarantees, but Choose N is ${selection.count}.`);
  }
}

/** @param {string} name */
function slugBase(name) {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'topic';
}

/** @param {LearningDb} db */
export async function listAdminConcepts(db) {
  const rows = await listActiveConceptTaxonomy(db);
  return rows
    .filter((concept) => concept.kind === 'topic')
    .map((concept) => ({
      id: concept.id,
      name: concept.name,
      slug: concept.slug,
      breadcrumb: conceptBreadcrumb(concept.id, rows).map((item) => ({
        id: item.id,
        name: item.name ?? item.id,
        kind: item.kind
      }))
    }));
}

/** @param {LearningDb} db @param {string} name */
async function prepareConcept(db, name) {
  const cleanName = requiredText(name, 'Topic name');
  const base = slugBase(cleanName);
  let slug = base;

  for (let suffix = 2; suffix < 10000; suffix += 1) {
    const existing = await db
      .select({ id: concepts.id })
      .from(concepts)
      .where(eq(concepts.slug, slug))
      .limit(1);
    if (!existing[0]) break;
    slug = `${base}-${suffix}`;
  }

  const id = crypto.randomUUID();
  return { id, name: cleanName, slug };
}

/** @param {LearningDb} db @param {{ id: string, name: string, slug: string }} concept */
function conceptInsert(db, concept) {
  return buildTopicConceptInsert(db, {
    id: concept.id,
    name: concept.name,
    slug: concept.slug,
    isActive: true
  });
}

/** @param {LearningDb} db @param {string} name */
export async function createConcept(db, name) {
  const concept = await prepareConcept(db, name);
  try {
    await conceptInsert(db, concept);
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new AdminContentInputError('A topic with this generated slug already exists. Try a different name.');
    }
    throw error;
  }
  return concept;
}

/** @param {LearningDb} db @param {string} conceptId */
async function requireActiveConcept(db, conceptId) {
  const row = await requireActiveTopicConcept(db, conceptId);
  if (!row) throw new AdminContentInputError('The selected Topic is missing or inactive, or is classified as a System.');
}

/** @param {LearningDb} db @param {string} caseId */
async function requireActiveProductionCase(db, caseId) {
  try {
    return await requireProductionCase(db, caseId);
  } catch (error) {
    if (error instanceof ContentGuardError) {
      throw new AdminContentInputError('The selected Case is missing or inactive.');
    }
    throw error;
  }
}

/**
 * @param {LearningDb} db
 * @param {{ title: string, vignetteMd?: string | null, conceptId: string, questionSelectionMode?: unknown, questionCount?: unknown }} input
 */
export async function createCase(db, input) {
  const title = requiredText(input.title, 'Internal Case title');
  const conceptId = requiredText(input.conceptId, 'Primary topic');
  await requireActiveConcept(db, conceptId);
  const selection = questionSelection(input.questionSelectionMode, input.questionCount);

  const id = crypto.randomUUID();
  const caseInsert = db.insert(cases).values({
    id,
    title,
    vignetteMd: optionalText(input.vignetteMd),
    questionSelectionMode: selection.mode,
    questionCount: selection.count,
    isActive: true
  });
  const associationInsert = db.insert(caseConcepts).values({
    caseId: id,
    conceptId,
    role: 'primary'
  });

  if (typeof db.batch === 'function') await db.batch([caseInsert, associationInsert]);
  else {
    await caseInsert;
    await associationInsert;
  }

  return { id, title, conceptId };
}

/** @param {LearningDb} db @param {string} caseId @param {string | null} vignetteMd */
export async function updateCaseVignette(db, caseId, vignetteMd) {
  await requireActiveProductionCase(db, caseId);
  await db
    .update(cases)
    .set({ vignetteMd: optionalText(vignetteMd) })
    .where(eq(cases.id, caseId));
}

/**
 * Update administrator-facing Case fields without changing Topic
 * relationships. Topic routing is managed by the dedicated relationship
 * operations below.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, title: string, vignetteMd?: string | null, questionSelectionMode?: unknown, questionCount?: unknown }} input
 */
export async function updateCase(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const title = requiredText(input.title, 'Internal Case title');
  const selection = questionSelection(input.questionSelectionMode, input.questionCount);

  await requireActiveCaseWithOnePrimary(db, caseId);
  await validateCaseQuestionCoverage(db, caseId, selection);
  await db
    .update(cases)
    .set({ title, vignetteMd: optionalText(input.vignetteMd), questionSelectionMode: selection.mode, questionCount: selection.count })
    .where(eq(cases.id, caseId));
}

/**
 * Return every Topic relationship for an active Case, including inactive
 * Topics so historical authoring state is visible to administrators.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 */
export async function listCaseTopics(db, caseId) {
  const cleanCaseId = requiredText(caseId, 'Case');
  const [attachedRows, conceptRows] = await Promise.all([
    db
      .select({ conceptId: caseConcepts.conceptId, role: caseConcepts.role })
      .from(caseConcepts)
      .where(eq(caseConcepts.caseId, cleanCaseId))
      .orderBy(asc(caseConcepts.role), asc(caseConcepts.conceptId)),
    listConceptTaxonomy(db)
  ]);
  const conceptById = new Map(conceptRows.map((concept) => [concept.id, concept]));

  return attachedRows.flatMap((relationship) => {
    const topic = conceptById.get(relationship.conceptId);
    if (!topic || topic.kind !== 'topic') return [];
    return [{
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      kind: topic.kind,
      parentId: topic.parentId,
      isActive: topic.isActive,
      role: relationship.role,
      breadcrumb: conceptBreadcrumb(topic.id, conceptRows).map((item) => ({
        id: item.id,
        name: item.name ?? item.id,
        kind: item.kind
      }))
    }];
  });
}

/** @param {LearningDb} db @param {string} caseId */
async function requireActiveCaseWithOnePrimary(db, caseId) {
  const cleanCaseId = requiredText(caseId, 'Case');
  await requireActiveProductionCase(db, cleanCaseId);

  const [relationshipRows, conceptRows] = await Promise.all([
    db
      .select({ conceptId: caseConcepts.conceptId, role: caseConcepts.role })
      .from(caseConcepts)
      .where(eq(caseConcepts.caseId, cleanCaseId)),
    listConceptTaxonomy(db)
  ]);
  const topicIds = new Set(conceptRows.filter((concept) => concept.kind === 'topic').map((concept) => concept.id));
  const topicRows = relationshipRows.filter((relationship) => topicIds.has(relationship.conceptId));
  const primaryRows = topicRows.filter((topic) => topic.role === 'primary');
  if (primaryRows.length !== 1) {
    throw new AdminContentInputError('The selected active Case must have exactly one primary Topic before it can be edited.');
  }

  return { caseId: cleanCaseId, topicRows, primaryConceptId: primaryRows[0].conceptId };
}

/** @param {LearningDb} db @param {string} conceptId */
async function requireActiveTopic(db, conceptId) {
  const cleanConceptId = requiredText(conceptId, 'Topic');
  await requireActiveConcept(db, cleanConceptId);
  return cleanConceptId;
}

/** @param {LearningDb} db @param {any[]} writes */
async function runTopicWrites(db, writes) {
  if (writes.length === 0) return;
  if (typeof db.batch === 'function') {
    // D1 executes a batch transactionally. Primary transitions intentionally
    // demote before promoting, so a partially applied transition is never
    // visible in production.
    await db.batch(/** @type {[any, ...any[]]} */ (writes));
    return;
  }
  for (const write of writes) await write;
}

/**
 * Add one active secondary Study Topic without changing the canonical Topic.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, conceptId: string }} input
 */
export async function addCaseSecondaryTopic(db, input) {
  const { caseId, topicRows } = await requireActiveCaseWithOnePrimary(db, input.caseId);
  const conceptId = await requireActiveTopic(db, input.conceptId);
  if (topicRows.some((topic) => topic.conceptId === conceptId)) {
    throw new AdminContentInputError('That Topic is already attached to this Case.');
  }

  try {
    await db.insert(caseConcepts).values({ caseId, conceptId, role: 'secondary' });
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new AdminContentInputError('That Topic is already attached to this Case.');
    }
    throw error;
  }
}

/**
 * Remove only a secondary Topic relationship. The primary relationship is
 * never removable through this operation.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, conceptId: string }} input
 */
export async function removeCaseSecondaryTopic(db, input) {
  const { caseId, topicRows } = await requireActiveCaseWithOnePrimary(db, input.caseId);
  const conceptId = requiredText(input.conceptId, 'Topic');
  const topic = topicRows.find((row) => row.conceptId === conceptId);
  if (!topic) throw new AdminContentInputError('That Topic is not attached to this Case.');
  if (topic.role !== 'secondary') {
    throw new AdminContentInputError('The primary Topic cannot be removed. Choose another primary Topic first.');
  }

  await db
    .delete(caseConcepts)
    .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, conceptId)));
}

/**
 * Make an attached secondary Topic, or a new active Topic, the canonical
 * primary Topic. Existing relationships are preserved as secondary links.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, conceptId: string }} input
 */
export async function promoteCaseTopic(db, input) {
  const { caseId, topicRows, primaryConceptId } = await requireActiveCaseWithOnePrimary(db, input.caseId);
  const conceptId = await requireActiveTopic(db, input.conceptId);
  if (primaryConceptId === conceptId) return;

  const targetTopic = topicRows.find((topic) => topic.conceptId === conceptId);
  const writes = [
    db
      .update(caseConcepts)
      .set({ role: 'secondary' })
      .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, primaryConceptId))),
    targetTopic
      ? db
          .update(caseConcepts)
          .set({ role: 'primary' })
          .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, conceptId)))
      : db.insert(caseConcepts).values({ caseId, conceptId, role: 'primary' })
  ];
  await runTopicWrites(db, writes);
}

/**
 * Create a new active Topic and attach it to an active Case in one domain
 * operation. D1 batches are transactional; the sequential fallback restores
 * the previous primary and removes the new Topic if relationship creation
 * fails.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, name: string, relationshipIntent: string }} input
 */
export async function createCaseTopic(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const relationshipIntent = requiredText(input.relationshipIntent, 'Topic relationship');
  if (!['primary', 'secondary'].includes(relationshipIntent)) {
    throw new AdminContentInputError('Choose whether the new Topic should become primary or an Additional Study Topic.');
  }

  const { primaryConceptId } = await requireActiveCaseWithOnePrimary(db, caseId);
  const concept = await prepareConcept(db, input.name);
  const conceptWrite = conceptInsert(db, concept);
  const relationshipWrites = relationshipIntent === 'primary'
    ? [
        db
          .update(caseConcepts)
          .set({ role: 'secondary' })
          .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, primaryConceptId))),
        db.insert(caseConcepts).values({ caseId, conceptId: concept.id, role: 'primary' })
      ]
    : [db.insert(caseConcepts).values({ caseId, conceptId: concept.id, role: 'secondary' })];

  let useSequentialFallback = typeof db.batch !== 'function';
  if (!useSequentialFallback) {
    try {
      await db.batch(/** @type {[any, ...any[]]} */ ([conceptWrite, ...relationshipWrites]));
    } catch (error) {
      if (error instanceof TypeError && /batch is not a function/i.test(error.message)) {
        useSequentialFallback = true;
      } else {
        if (error instanceof Error && /unique|constraint/i.test(error.message)) {
          throw new AdminContentInputError('A topic with this generated slug already exists. Try a different name.');
        }
        throw error;
      }
    }
  }

  if (useSequentialFallback) {
    let primaryDemoted = false;
    try {
      await conceptWrite;
      if (relationshipIntent === 'primary') {
        await relationshipWrites[0];
        primaryDemoted = true;
        await relationshipWrites[1];
      } else {
        await relationshipWrites[0];
      }
    } catch (error) {
      if (primaryDemoted) {
        try {
          await db
            .update(caseConcepts)
            .set({ role: 'primary' })
            .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, primaryConceptId)));
        } catch (restoreError) {
          console.error('Unable to restore the previous Case primary Topic after Topic creation failed.', restoreError);
        }
      }
      try {
        await db.delete(concepts).where(eq(concepts.id, concept.id));
      } catch (cleanupError) {
        console.error('Unable to clean up the Topic created during a failed Case Topic operation.', cleanupError);
      }
      if (error instanceof Error && /unique|constraint/i.test(error.message)) {
        throw new AdminContentInputError('A topic with this generated slug already exists. Try a different name.');
      }
      throw error;
    }
  }

  return { ...concept, relationshipIntent };
}
