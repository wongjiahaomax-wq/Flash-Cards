import { and, asc, eq } from 'drizzle-orm';

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
  return db
    .select({ id: concepts.id, name: concepts.name, slug: concepts.slug })
    .from(concepts)
    .where(eq(concepts.isActive, true))
    .orderBy(asc(concepts.name));
}

/** @param {LearningDb} db @param {string} name */
export async function createConcept(db, name) {
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
  try {
    await db.insert(concepts).values({
      id,
      name: cleanName,
      slug,
      isActive: true
    });
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new AdminContentInputError('A topic with this generated slug already exists. Try a different name.');
    }
    throw error;
  }
  return { id, name: cleanName, slug };
}

/** @param {LearningDb} db @param {string} conceptId */
async function requireActiveConcept(db, conceptId) {
  const rows = await db
    .select({ id: concepts.id })
    .from(concepts)
    .where(and(eq(concepts.id, conceptId), eq(concepts.isActive, true)))
    .limit(1);
  if (!rows[0]) throw new AdminContentInputError('The selected topic is missing or inactive.');
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
  const rows = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.isActive, true)))
    .limit(1);
  if (!rows[0]) throw new AdminContentInputError('The selected Case is missing or inactive.');

  await db
    .update(cases)
    .set({ vignetteMd: optionalText(vignetteMd) })
    .where(eq(cases.id, caseId));
}

/**
 * Update administrator-facing Case fields and change which attached Topic is
 * canonical/default without erasing other Case Topic relationships.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, title: string, vignetteMd?: string | null, conceptId: string, questionSelectionMode?: unknown, questionCount?: unknown }} input
 */
export async function updateCase(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const title = requiredText(input.title, 'Internal Case title');
  const conceptId = requiredText(input.conceptId, 'Primary topic');
  await requireActiveConcept(db, conceptId);
  const selection = questionSelection(input.questionSelectionMode, input.questionCount);

  await validateCaseQuestionCoverage(db, caseId, selection);
  const { topicRows, primaryConceptId } = await requireActiveCaseWithOnePrimary(db, caseId);

  /** @type {any[]} */
  const writes = [
    db
      .update(cases)
      .set({ title, vignetteMd: optionalText(input.vignetteMd), questionSelectionMode: selection.mode, questionCount: selection.count })
      .where(eq(cases.id, caseId))
  ];

  if (primaryConceptId !== conceptId) {
    writes.push(
      db
        .update(caseConcepts)
        .set({ role: 'secondary' })
        .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, primaryConceptId)))
    );

    const targetTopic = topicRows.find((topic) => topic.conceptId === conceptId);
    writes.push(
      targetTopic
        ? db
            .update(caseConcepts)
            .set({ role: 'primary' })
            .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, conceptId)))
        : db.insert(caseConcepts).values({ caseId, conceptId, role: 'primary' })
    );
  }

  if (typeof db.batch === 'function') await db.batch(/** @type {[any, ...any[]]} */ (writes));
  else for (const write of writes) await write;
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
  return db
    .select({
      id: concepts.id,
      name: concepts.name,
      slug: concepts.slug,
      isActive: concepts.isActive,
      role: caseConcepts.role
    })
    .from(caseConcepts)
    .innerJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(eq(caseConcepts.caseId, cleanCaseId))
    .orderBy(asc(caseConcepts.role), asc(concepts.name), asc(concepts.id));
}

/** @param {LearningDb} db @param {string} caseId */
async function requireActiveCaseWithOnePrimary(db, caseId) {
  const cleanCaseId = requiredText(caseId, 'Case');
  const caseRows = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, cleanCaseId), eq(cases.isActive, true)))
    .limit(1);
  if (!caseRows[0]) throw new AdminContentInputError('The selected Case is missing or inactive.');

  const topicRows = await db
    .select({ conceptId: caseConcepts.conceptId, role: caseConcepts.role })
    .from(caseConcepts)
    .where(eq(caseConcepts.caseId, cleanCaseId));
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
