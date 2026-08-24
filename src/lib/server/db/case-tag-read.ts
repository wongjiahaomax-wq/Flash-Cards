import { and, asc, eq, isNull } from 'drizzle-orm';

import { cases } from './schema.js';
import { caseTags, tags } from './tag-schema.js';

export async function listProductionCaseTags(db: import('./index.js').LearningDb, caseId: string) {
  return db
    .select({ id: tags.id, name: tags.name, isActive: tags.isActive })
    .from(caseTags)
    .innerJoin(tags, eq(tags.id, caseTags.tagId))
    .innerJoin(cases, eq(cases.id, caseTags.caseId))
    .where(and(eq(caseTags.caseId, caseId), isNull(cases.previewSessionId)))
    .orderBy(asc(tags.name), asc(tags.id));
}

export async function listPreviewCaseTags(
  db: import('./index.js').LearningDb,
  previewSessionId: string,
  caseId: string
) {
  return db
    .select({ id: tags.id, name: tags.name, isActive: tags.isActive })
    .from(caseTags)
    .innerJoin(tags, eq(tags.id, caseTags.tagId))
    .innerJoin(cases, eq(cases.id, caseTags.caseId))
    .where(and(eq(caseTags.caseId, caseId), eq(cases.previewSessionId, previewSessionId)))
    .orderBy(asc(tags.name), asc(tags.id));
}
