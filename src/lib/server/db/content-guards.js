import { and, eq, isNull } from 'drizzle-orm';

import { assets, cases } from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class ContentGuardError extends Error {
  /** @param {string} message @param {string} code */
  constructor(message, code) {
    super(message);
    this.name = 'ContentGuardError';
    this.code = code;
  }
}

/**
 * Require an active production Case. Preview-owned Cases are intentionally
 * rejected even when their IDs are otherwise valid.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 */
export async function requireProductionCase(db, caseId) {
  const rows = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.isActive, true), isNull(cases.previewSessionId)))
    .limit(1);
  if (!rows[0]) {
    throw new ContentGuardError(
      'The selected Case is not an active production Case.',
      'PRODUCTION_CASE_REQUIRED'
    );
  }
  return rows[0];
}

/**
 * Require an active production image Asset. This guard is for production
 * mutation paths; Preview has a separate rule that may allow production
 * Assets to be referenced by Preview-owned relationships.
 *
 * @param {LearningDb} db
 * @param {string} assetId
 */
export async function requireProductionImageAsset(db, assetId) {
  const rows = await db
    .select({ id: assets.id, type: assets.type })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.isActive, true), isNull(assets.previewSessionId)))
    .limit(1);
  if (!rows[0]) {
    throw new ContentGuardError(
      'The selected Asset is not an active production Asset.',
      'PRODUCTION_ASSET_REQUIRED'
    );
  }
  if (rows[0].type !== 'image') {
    throw new ContentGuardError(
      'The selected production Asset is not an image.',
      'PRODUCTION_IMAGE_ASSET_REQUIRED'
    );
  }
  return rows[0];
}
