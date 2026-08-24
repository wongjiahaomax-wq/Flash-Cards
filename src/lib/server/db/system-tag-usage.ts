import { asc, eq } from 'drizzle-orm';

import { concepts } from './schema.js';
import { systemTags, tags } from './tag-schema.js';

export async function listSystemTagExposures(db: import('./index.js').LearningDb) {
  return db
    .select({
      systemId: concepts.id,
      systemName: concepts.name,
      systemIsActive: concepts.isActive,
      tagId: tags.id,
      tagName: tags.name,
      tagIsActive: tags.isActive,
      displayOrder: systemTags.displayOrder
    })
    .from(systemTags)
    .innerJoin(concepts, eq(concepts.id, systemTags.systemConceptId))
    .innerJoin(tags, eq(tags.id, systemTags.tagId))
    .orderBy(asc(concepts.name), asc(systemTags.displayOrder), asc(tags.name), asc(tags.id));
}

export async function listTagSystems(db: import('./index.js').LearningDb, tagId: string) {
  const rows = await listSystemTagExposures(db);
  return rows.filter((row) => row.tagId === tagId);
}
