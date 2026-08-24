import { asc, eq } from 'drizzle-orm';

import { concepts } from './schema.js';

function missingKindColumn(error: unknown) {
  return error instanceof Error && /no such column:.*kind|has no column named kind/i.test(error.message);
}

async function selectConceptTaxonomy(
  db: import('./index.js').LearningDb,
  activeOnly: boolean
) {
  const query = db
    .select({
      id: concepts.id,
      name: concepts.name,
      slug: concepts.slug,
      descriptionMd: concepts.descriptionMd,
      kind: concepts.kind,
      parentId: concepts.parentId,
      isActive: concepts.isActive
    })
    .from(concepts);
  return activeOnly
    ? query.where(eq(concepts.isActive, true)).orderBy(asc(concepts.name), asc(concepts.id))
    : query.orderBy(asc(concepts.name), asc(concepts.id));
}

async function selectLegacyConceptTaxonomy(
  db: import('./index.js').LearningDb,
  activeOnly: boolean
) {
  const query = db
    .select({
      id: concepts.id,
      name: concepts.name,
      slug: concepts.slug,
      descriptionMd: concepts.descriptionMd,
      parentId: concepts.parentId,
      isActive: concepts.isActive
    })
    .from(concepts);
  const rows = activeOnly
    ? await query.where(eq(concepts.isActive, true)).orderBy(asc(concepts.name), asc(concepts.id))
    : await query.orderBy(asc(concepts.name), asc(concepts.id));
  return rows.map((row) => ({ ...row, kind: 'topic' as const }));
}

/**
 * Read Concept taxonomy while remaining compatible with a database that has
 * not received additive migration 0015 yet. Before 0015 every Concept has
 * Topic semantics, which is exactly the migration's kind default/backfill.
 */
export async function listConceptTaxonomy(
  db: import('./index.js').LearningDb,
  options: { activeOnly?: boolean } = {}
) {
  const activeOnly = Boolean(options.activeOnly);
  try {
    return await selectConceptTaxonomy(db, activeOnly);
  } catch (error) {
    if (!missingKindColumn(error)) throw error;
    return selectLegacyConceptTaxonomy(db, activeOnly);
  }
}

export async function listActiveConceptTaxonomy(db: import('./index.js').LearningDb) {
  return listConceptTaxonomy(db, { activeOnly: true });
}

export async function requireActiveTopicConcept(db: import('./index.js').LearningDb, conceptId: string) {
  const rows = await listActiveConceptTaxonomy(db);
  return rows.find((row) => row.id === conceptId && row.kind === 'topic') ?? null;
}

async function supportsConceptKind(db: import('./index.js').LearningDb) {
  try {
    await db.select({ kind: concepts.kind }).from(concepts).limit(1);
    return true;
  } catch (error) {
    if (!missingKindColumn(error)) throw error;
    return false;
  }
}

/**
 * Build (without executing) a Topic insert for the schema that is actually
 * present so callers can retain their existing D1 batch/transaction boundary.
 */
export async function buildTopicConceptInsert(
  db: import('./index.js').LearningDb,
  value: {
    id: string;
    name: string;
    slug: string;
    descriptionMd?: string | null;
    parentId?: string | null;
    isActive?: boolean;
  }
) {
  if (await supportsConceptKind(db)) {
    return db.insert(concepts).values({ ...value, kind: 'topic' });
  }
  return db.insert(concepts).values(value);
}
