import { sql } from 'drizzle-orm';
import {
  ASSET_LIBRARY_PAGE_SIZE,
  AssetLibraryInputError,
  getAssetLibraryDetail as getAssetLibraryDetailReal,
  getAssetLibraryPage,
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

/** @param {any} db */
async function ensureDedupeColumnFixture(db) {
  const info = await db.$client.prepare("PRAGMA table_info('assets')").bind().all();
  const columns = /** @type {Array<{ name?: string }>} */ (info.results ?? []);
  if (columns.some((column) => column.name === 'deduplicated_into_asset_id')) return;
  await db.run(sql.raw('ALTER TABLE assets ADD COLUMN deduplicated_into_asset_id text'));
}

/** @param {any} db @param {any} [filters] */
export async function listAssetLibrary(db, filters = {}) {
  await ensureActiveReviewAssetFixture(db);
  await ensureDedupeColumnFixture(db);
  const normalized = {
    search: String(filters.search ?? '').trim(),
    topic: String(filters.topic ?? '').trim(),
    collection: String(filters.collection ?? '').trim(),
    usage: filters.usage ?? 'all',
    status: filters.status ?? 'all',
    source: filters.source ?? 'all',
    sort: filters.sort ?? 'newest'
  };
  const first = await getAssetLibraryPage(db, normalized, { page: 1, pageSize: ASSET_LIBRARY_PAGE_SIZE });
  const rows = [...first.rows];
  for (let page = 2; page <= first.totalPages; page += 1) {
    rows.push(...(await getAssetLibraryPage(db, normalized, { page, pageSize: ASSET_LIBRARY_PAGE_SIZE })).rows);
  }
  return rows;
}

/** @param {any} db @param {string} assetId */
export async function getAssetLibraryDetail(db, assetId) {
  await ensureActiveReviewAssetFixture(db);
  await ensureDedupeColumnFixture(db);
  return getAssetLibraryDetailReal(db, assetId);
}
