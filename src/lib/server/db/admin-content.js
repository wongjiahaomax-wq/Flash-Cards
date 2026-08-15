import { and, asc, eq } from 'drizzle-orm';

import { caseConcepts, cases, concepts } from './schema.js';

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
 * @param {{ title: string, vignetteMd?: string | null, conceptId: string }} input
 */
export async function createCase(db, input) {
  const title = requiredText(input.title, 'Internal Case title');
  const conceptId = requiredText(input.conceptId, 'Primary topic');
  await requireActiveConcept(db, conceptId);

  const id = crypto.randomUUID();
  const caseInsert = db.insert(cases).values({
    id,
    title,
    vignetteMd: optionalText(input.vignetteMd),
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
