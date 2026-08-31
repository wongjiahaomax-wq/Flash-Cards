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

/** @param {Awaited<ReturnType<typeof listActiveConceptTaxonomy>>} rows */
function adminConceptOptions(rows) {
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

/** @param {Awaited<ReturnType<typeof listActiveConceptTaxonomy>>} rows */
function activeSystemOptions(rows) {
  return rows
    .filter((concept) => concept.kind === 'system')
    .map((concept) => ({ id: concept.id, name: concept.name }));
}

/** @param {LearningDb} db */
export async function listCaseEditorTaxonomyOptions(db) {
  const rows = await listActiveConceptTaxonomy(db);
  return {
    concepts: adminConceptOptions(rows),
    systems: activeSystemOptions(rows)
  };
}

/** @param {LearningDb} db */
export async function listAdminConcepts(db) {
  return adminConceptOptions(await listActiveConceptTaxonomy(db));
}

/** @param {LearningDb} db */
export async function listActiveSystems(db) {
  return activeSystemOptions(await listActiveConceptTaxonomy(db));
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
 * Update administrator-facing Case fields without changing Topic relationships.
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
 * Return the canonical Topic for an active Case. Legacy secondary rows remain
 * stored compatibility data but are intentionally hidden from current authoring.
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
      .where(and(eq(caseConcepts.caseId, cleanCaseId), eq(caseConcepts.role, 'primary')))
      .orderBy(asc(caseConcepts.conceptId)),
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

function secondaryTopicsRemovedError() {
  return new AdminContentInputError('Additional Study Topics are no longer supported. Use Case Tags for alternate or cross-cutting classification.');
}

/**
 * @deprecated Secondary Study Topic creation was removed in favor of Case Tags.
 * @param {LearningDb} _db
 * @param {{ caseId: string, conceptId: string }} _input
 */
export async function addCaseSecondaryTopic(_db, _input) {
  throw secondaryTopicsRemovedError();
}

/**
 * @deprecated Secondary Study Topic mutation is no longer exposed by current authoring.
 * @param {LearningDb} _db
 * @param {{ caseId: string, conceptId: string }} _input
 */
export async function removeCaseSecondaryTopic(_db, _input) {
  throw secondaryTopicsRemovedError();
}

/**
 * Replace the Case's canonical Topic without creating a new secondary route.
 * Existing unrelated secondary rows are legacy inert compatibility data. If the
 * requested canonical Topic already exists as a legacy secondary row, that one
 * conflicting row is removed as part of the explicit primary change.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, conceptId: string }} input
 */
export async function promoteCaseTopic(db, input) {
  const { caseId, topicRows, primaryConceptId } = await requireActiveCaseWithOnePrimary(db, input.caseId);
  const conceptId = await requireActiveTopic(db, input.conceptId);
  if (primaryConceptId === conceptId) return;

  const primaryWrite = db
    .update(caseConcepts)
    .set({ conceptId, role: 'primary' })
    .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, primaryConceptId)));
  const targetSecondary = topicRows.find((topic) => topic.conceptId === conceptId && topic.role === 'secondary');
  if (!targetSecondary) {
    await primaryWrite;
    return;
  }

  const secondaryDelete = db
    .delete(caseConcepts)
    .where(and(
      eq(caseConcepts.caseId, caseId),
      eq(caseConcepts.conceptId, conceptId),
      eq(caseConcepts.role, 'secondary')
    ));
  if (typeof db.batch === 'function') {
    await db.batch(/** @type {[any, ...any[]]} */ ([secondaryDelete, primaryWrite]));
    return;
  }

  await secondaryDelete;
  try {
    await primaryWrite;
  } catch (error) {
    try {
      await db.insert(caseConcepts).values({ caseId, conceptId, role: 'secondary' });
    } catch (cleanupError) {
      console.error('Unable to restore a legacy secondary Topic after a failed Primary Topic change.', cleanupError);
    }
    throw error;
  }
}

/**
 * Replace the canonical Topic for several active production Cases after all
 * Cases and the target Topic have been validated.
 *
 * @param {LearningDb} db
 * @param {{ caseIds: string[], conceptId: string }} input
 */
export async function bulkPromoteCaseTopics(db, input) {
  const caseIds = [...new Set((input.caseIds ?? []).map((caseId) => requiredText(caseId, 'Case')))];
  if (!caseIds.length) throw new AdminContentInputError('Select at least one Case.');
  if (caseIds.length > 60) throw new AdminContentInputError('Select no more than 60 Cases at a time.');

  const conceptId = await requireActiveTopic(db, input.conceptId);
  const validated = await Promise.all(caseIds.map((caseId) => requireActiveCaseWithOnePrimary(db, caseId)));
  const writes = [];

  for (const current of validated) {
    if (current.primaryConceptId === conceptId) continue;
    const targetSecondary = current.topicRows.find((topic) => topic.conceptId === conceptId && topic.role === 'secondary');
    if (targetSecondary) {
      writes.push(db.delete(caseConcepts).where(and(
        eq(caseConcepts.caseId, current.caseId),
        eq(caseConcepts.conceptId, conceptId),
        eq(caseConcepts.role, 'secondary')
      )));
    }
    writes.push(db
      .update(caseConcepts)
      .set({ conceptId, role: 'primary' })
      .where(and(eq(caseConcepts.caseId, current.caseId), eq(caseConcepts.conceptId, current.primaryConceptId))));
  }

  if (!writes.length) return;
  if (typeof db.batch === 'function') {
    await db.batch(/** @type {[any, ...any[]]} */ (writes));
    return;
  }
  for (const write of writes) await write;
}

/**
 * Create a new global Topic and make it the Case's canonical Topic. Creating a
 * Topic as an Additional Study Topic is intentionally unsupported.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, name: string, relationshipIntent: string }} input
 */
export async function createCaseTopic(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const relationshipIntent = requiredText(input.relationshipIntent, 'Topic relationship');
  if (relationshipIntent !== 'primary') throw secondaryTopicsRemovedError();

  const { primaryConceptId } = await requireActiveCaseWithOnePrimary(db, caseId);
  const concept = await prepareConcept(db, input.name);
  const conceptWrite = conceptInsert(db, concept);
  const relationshipWrite = db
    .update(caseConcepts)
    .set({ conceptId: concept.id, role: 'primary' })
    .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, primaryConceptId)));

  let useSequentialFallback = typeof db.batch !== 'function';
  if (!useSequentialFallback) {
    try {
      await db.batch(/** @type {[any, ...any[]]} */ ([conceptWrite, relationshipWrite]));
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
    try {
      await conceptWrite;
      await relationshipWrite;
    } catch (error) {
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

  return { ...concept, relationshipIntent: 'primary' };
}
