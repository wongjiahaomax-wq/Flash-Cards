import { sql } from 'drizzle-orm';
import {
  AssetLibraryInputError,
  getAssetLibraryDetail as getAssetLibraryDetailReal,
  listAssetLibrary as listAssetLibraryReal,
  parseAssetLibraryFilters,
  updateAssetMetadata
} from '../src/lib/server/db/asset-library.js';

export { AssetLibraryInputError, parseAssetLibraryFilters, updateAssetMetadata };

/**
 * A few retained Image Library tests intentionally build historical partial
 * schemas to isolate older Asset behavior. Give those fixtures the empty table
 * introduced by the active-Review migration before exercising the real current
 * Image Library query. Production code never takes this path.
 *
 * @param {any} db
 */
async function ensureActiveReviewAssetFixture(db) {
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

/** @param {any} db @param {any} [filters] */
export async function listAssetLibrary(db, filters = {}) {
  await ensureActiveReviewAssetFixture(db);
  return listAssetLibraryReal(db, filters);
}

/** @param {any} db @param {string} assetId */
export async function getAssetLibraryDetail(db, assetId) {
  await ensureActiveReviewAssetFixture(db);
  return getAssetLibraryDetailReal(db, assetId);
}
