import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import {
  AssetLibraryInputError,
  getAssetLibraryDetail,
  listAssetLibrary,
  updateAssetMetadata
} from './asset-library-test-adapter.js';

const migrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0007_image_collections.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0008_tag_shared_questions.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0009_reusable_image_questions.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0011_asset_supersession.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0012_archive_stimulus_options.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0013_review_assets_asset_lookup.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(buildSeedSql());
  const d1 = /** @type {any} */ ({
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() { return sqlite.prepare(sql).all(...params).map((row) => Object.values(row)); },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            }
          };
        }
      };
    },
    /** @param {any[]} statements */
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  });
  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite };
}

test('normal Asset Library excludes Preview Assets and Preview Case usages of production Assets', async () => {
  const fixture = createLearningDb();
  try {
    const assetId = 'seed-asset-anterior-a';
    const baseline = await getAssetLibraryDetail(fixture.db, assetId);
    assert.ok(baseline);
    const baselineUsageCount = baseline.asset.usageCount;

    fixture.sqlite.prepare(`
      INSERT INTO preview_sessions (id, user_id, status, expires_at)
      VALUES (?, ?, 'active', ?)
    `).run('preview-asset-session', 'preview-asset-user', 4102444800000);
    fixture.sqlite.prepare(`
      INSERT INTO cases (id, title, preview_session_id, is_active)
      VALUES (?, ?, ?, 1)
    `).run('preview-asset-case', 'Disposable Preview Asset Case', 'preview-asset-session');
    fixture.sqlite.prepare(`
      INSERT INTO case_assets (case_id, asset_id, display_order, caption_md)
      VALUES (?, ?, 0, ?)
    `).run('preview-asset-case', assetId, 'Preview-only usage');
    fixture.sqlite.prepare(`
      INSERT INTO assets (
        id, type, storage_key, mime_type, original_filename, alt_text,
        preview_session_id, is_active
      ) VALUES (?, 'image', ?, 'image/png', ?, ?, ?, 1)
    `).run(
      'preview-owned-asset',
      'preview/preview-asset-session/preview-owned-asset.png',
      'Disposable Preview Asset.png',
      'Disposable preview asset',
      'preview-asset-session'
    );

    const rows = await listAssetLibrary(fixture.db);
    assert.equal(rows.some((asset) => asset.id === 'preview-owned-asset'), false);
    assert.equal((await getAssetLibraryDetail(fixture.db, 'preview-owned-asset')), null);

    const production = rows.find((asset) => asset.id === assetId);
    assert.ok(production);
    assert.equal(production.usageCount, baselineUsageCount);
    const detail = await getAssetLibraryDetail(fixture.db, assetId);
    assert.ok(detail);
    assert.equal(detail.asset.usageCount, baselineUsageCount);
    assert.equal(detail.usages.some((usage) => usage.caseId === 'preview-asset-case'), false);

    await assert.rejects(
      () => updateAssetMetadata(fixture.db, 'preview-owned-asset', { altText: 'Should not change', isActive: true }),
      (error) => error instanceof AssetLibraryInputError && /production Asset/i.test(error.message)
    );
  } finally {
    fixture.sqlite.close();
  }
});