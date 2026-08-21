import { asc, eq } from 'drizzle-orm';

import { tags } from './tag-schema.js';

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