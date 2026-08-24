import { asc, eq } from 'drizzle-orm';

import { taxonomyConcepts } from './contextual-schema.ts';
import { pre0015Concepts } from './pre-0015-compat-schema.ts';

function missingKindColumn(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error && /no such column:.*kind|has no column named kind/i.test(current.message)) {
      return true;
    }
    if (typeof current !== 'object' || current === null || !('cause' in current)) break;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function selectConceptTaxonomy(
  db: import('./index.js').LearningDb,
  activeOnly: boolean
) {
  const query = db
    .select({
      id: taxonomyConcepts.id,
      name: taxonomyConcepts.name,
      slug: taxonomyConcepts.slug,
      descriptionMd: taxonomyConcepts.descriptionMd,
      kind: taxonomyConcepts.kind,
      parentId: taxonomyConcepts.parentId,
      isActive: taxonomyConcepts.isActive
    })
    .from(taxonomyConcepts);
  return activeOnly
    ? query.where(eq(taxonomyConcepts.isActive, true)).orderBy(asc(taxonomyConcepts.name), asc(taxonomyConcepts.id))
    : query.orderBy(asc(taxonomyConcepts.name), asc(taxonomyConcepts.id));
}

async function selectLegacyConceptTaxonomy(
  db: import('./index.js').LearningDb,
  activeOnly: boolean
) {
  const query = db
    .select({
      id: pre0015Concepts.id,
      name: pre0015Concepts.name,
      slug: pre0015Concepts.slug,
      descriptionMd: pre0015Concepts.descriptionMd,
      parentId: pre0015Concepts.parentId,
      isActive: pre0015Concepts.isActive
    })
    .from(pre0015Concepts);
  const rows = activeOnly
    ? await query.where(eq(pre0015Concepts.isActive, true)).orderBy(asc(pre0015Concepts.name), asc(pre0015Concepts.id))
    : await query.orderBy(asc(pre0015Concepts.name), asc(pre0015Concepts.id));
  return rows.map((row) => ({ ...row, kind: 'topic' as const }));
}

async function selectConceptTaxonomyById(
  db: import('./index.js').LearningDb,
  conceptId: string
) {
  return (
    await db
      .select({
        id: taxonomyConcepts.id,
        name: taxonomyConcepts.name,
        slug: taxonomyConcepts.slug,
        descriptionMd: taxonomyConcepts.descriptionMd,
        kind: taxonomyConcepts.kind,
        parentId: taxonomyConcepts.parentId,
        isActive: taxonomyConcepts.isActive
      })
      .from(taxonomyConcepts)
      .where(eq(taxonomyConcepts.id, conceptId))
      .limit(1)
  )[0] ?? null;
}

async function selectLegacyConceptTaxonomyById(
  db: import('./index.js').LearningDb,
  conceptId: string
) {
  const row = (
    await db
      .select({
        id: pre0015Concepts.id,
        name: pre0015Concepts.name,
        slug: pre0015Concepts.slug,
        descriptionMd: pre0015Concepts.descriptionMd,
        parentId: pre0015Concepts.parentId,
        isActive: pre0015Concepts.isActive
      })
      .from(pre0015Concepts)
      .where(eq(pre0015Concepts.id, conceptId))
      .limit(1)
  )[0] ?? null;
  return row ? { ...row, kind: 'topic' as const } : null;
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

/**
 * Resolve one Concept with post-0015 kind information when available. On a
 * genuinely pre-0015 database every Concept is treated as a Topic, matching
 * migration 0015's default/backfill semantics.
 */
export async function findConceptTaxonomyById(
  db: import('./index.js').LearningDb,
  conceptId: string
) {
  try {
    return await selectConceptTaxonomyById(db, conceptId);
  } catch (error) {
    if (!missingKindColumn(error)) throw error;
    return selectLegacyConceptTaxonomyById(db, conceptId);
  }
}

export async function requireActiveTopicConcept(db: import('./index.js').LearningDb, conceptId: string) {
  const row = await findConceptTaxonomyById(db, conceptId);
  return row?.kind === 'topic' && row.isActive ? row : null;
}

/**
 * Build (without executing) a Topic insert through the pre-0015 table shape.
 * Migration 0015 gives `kind` a `topic` database default, so the same query is
 * valid before and after the migration and remains safe to place in D1 batch.
 */
export function buildTopicConceptInsert(
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
  return db.insert(pre0015Concepts).values(value);
}
