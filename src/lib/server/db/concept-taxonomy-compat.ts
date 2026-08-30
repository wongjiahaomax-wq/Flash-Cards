import { asc, eq } from 'drizzle-orm';

import { taxonomyConcepts } from './contextual-schema.ts';

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

export async function listConceptTaxonomy(
  db: import('./index.js').LearningDb,
  options: { activeOnly?: boolean } = {}
) {
  return selectConceptTaxonomy(db, Boolean(options.activeOnly));
}

export async function listActiveConceptTaxonomy(db: import('./index.js').LearningDb) {
  return listConceptTaxonomy(db, { activeOnly: true });
}

export async function findConceptTaxonomyById(
  db: import('./index.js').LearningDb,
  conceptId: string
) {
  return selectConceptTaxonomyById(db, conceptId);
}

export async function requireActiveTopicConcept(db: import('./index.js').LearningDb, conceptId: string) {
  const row = await findConceptTaxonomyById(db, conceptId);
  return row?.kind === 'topic' && row.isActive ? row : null;
}

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
  return db.insert(taxonomyConcepts).values({ ...value, kind: 'topic' });
}
