import { asc, eq } from 'drizzle-orm';

import { concepts } from './schema.js';

function missingKindColumn(error: unknown) {
  return error instanceof Error && /no such column:.*kind|has no column named kind/i.test(error.message);
}

/**
 * Read the active Concept taxonomy while remaining compatible with a database
 * that has not received additive migration 0015 yet. Before 0015 every Concept
 * has Topic semantics, which is exactly the migration's kind default/backfill.
 */
export async function listActiveConceptTaxonomy(db: import('./index.js').LearningDb) {
  try {
    return await db
      .select({
        id: concepts.id,
        name: concepts.name,
        slug: concepts.slug,
        descriptionMd: concepts.descriptionMd,
        kind: concepts.kind,
        parentId: concepts.parentId,
        isActive: concepts.isActive
      })
      .from(concepts)
      .where(eq(concepts.isActive, true))
      .orderBy(asc(concepts.name), asc(concepts.id));
  } catch (error) {
    if (!missingKindColumn(error)) throw error;
    const rows = await db
      .select({
        id: concepts.id,
        name: concepts.name,
        slug: concepts.slug,
        descriptionMd: concepts.descriptionMd,
        parentId: concepts.parentId,
        isActive: concepts.isActive
      })
      .from(concepts)
      .where(eq(concepts.isActive, true))
      .orderBy(asc(concepts.name), asc(concepts.id));
    return rows.map((row) => ({ ...row, kind: 'topic' as const }));
  }
}

export async function requireActiveTopicConcept(db: import('./index.js').LearningDb, conceptId: string) {
  const rows = await listActiveConceptTaxonomy(db);
  return rows.find((row) => row.id === conceptId && row.kind === 'topic') ?? null;
}
