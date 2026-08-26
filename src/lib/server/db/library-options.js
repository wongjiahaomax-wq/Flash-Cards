import { and, asc, eq, isNull } from 'drizzle-orm';

import { cases } from './schema.js';
import { caseTags, tags } from './tag-schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/**
 * Lightweight Tag taxonomy options for Admin library filters.
 * @param {LearningDb} db
 */
export async function listActiveTagOptions(db) {
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(eq(tags.isActive, true))
    .orderBy(asc(tags.name), asc(tags.id));
}

/**
 * Case-library Tag options preserve the existing active-library behavior, while
 * the inactive recovery library intentionally exposes every Tag retained by an
 * inactive Production Case, including Tags that are themselves inactive.
 *
 * @param {LearningDb} db
 * @param {'active'|'inactive'} lifecycle
 */
export async function listCaseLibraryTagOptions(db, lifecycle) {
  if (lifecycle !== 'inactive') return listActiveTagOptions(db);

  return db
    .selectDistinct({ id: tags.id, name: tags.name })
    .from(tags)
    .innerJoin(caseTags, eq(caseTags.tagId, tags.id))
    .innerJoin(cases, eq(cases.id, caseTags.caseId))
    .where(and(eq(cases.isActive, false), isNull(cases.previewSessionId)))
    .orderBy(asc(tags.name), asc(tags.id));
}
