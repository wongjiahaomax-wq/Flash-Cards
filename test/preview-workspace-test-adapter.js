import { sql } from 'drizzle-orm';
import * as real from '../src/lib/server/db/preview-workspace.js';

export * from '../src/lib/server/db/preview-workspace.js';

/** @param {any} db */
async function ensureActiveReviewFixture(db) {
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS active_reviews (
      id text PRIMARY KEY NOT NULL,
      case_id text NOT NULL
    )
  `));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS active_review_assets (
      id text PRIMARY KEY NOT NULL,
      active_review_id text NOT NULL,
      asset_id text NOT NULL,
      display_order integer NOT NULL DEFAULT 0,
      storage_key_snapshot text NOT NULL DEFAULT ''
    )
  `));
}

export async function ensurePreviewWorkspace(input) {
  await ensureActiveReviewFixture(input.db);
  return real.ensurePreviewWorkspace(input);
}

export async function cleanupPreviewWorkspace(input) {
  await ensureActiveReviewFixture(input.db);
  return real.cleanupPreviewWorkspace(input);
}
