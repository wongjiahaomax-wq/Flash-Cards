import { and, eq, isNull } from 'drizzle-orm';

import { cases } from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/**
 * Build the narrow Production Case authoring timestamp write so existing D1
 * batches can include it without adding a transaction abstraction.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 * @param {Date} [updatedAt]
 */
export function productionCaseTimestampWrite(db, caseId, updatedAt = new Date()) {
  return db
    .update(cases)
    .set({ updatedAt })
    .where(and(eq(cases.id, caseId), isNull(cases.previewSessionId)));
}

/**
 * Best-effort metadata touch for existing sequential writers. The substantive
 * authoring mutation has already succeeded before this helper is called, so a
 * timestamp-only failure is reported but must not turn that completed action
 * into a user-visible save failure.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 * @param {Date} [updatedAt]
 */
export async function touchProductionCaseUpdatedAt(db, caseId, updatedAt = new Date()) {
  try {
    await productionCaseTimestampWrite(db, caseId, updatedAt);
    return true;
  } catch (error) {
    console.error('Unable to update Case authoring timestamp.', error);
    return false;
  }
}
