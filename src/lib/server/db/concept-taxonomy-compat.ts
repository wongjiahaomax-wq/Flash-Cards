import { asc, eq } from 'drizzle-orm';

import { taxonomyConcepts } from './contextual-schema.ts';
import { concepts } from './schema.js';

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
  return db.insert(concepts).values(value);
}
