// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  AssetReplacementInputError,
  replaceAssetWithHigherResolution
} from '../src/lib/server/db/asset-replacement.js';

const migrationSql = readdirSync(new URL('../drizzle/', import.meta.url))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function d1Fixture(sqlite, { releaseAfterBatches = 0 } = {}) {
  let pending = [];
  let barrierOpen = releaseAfterBatches <= 1;

  async function executeBatch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() {
              return { results: sqlite.prepare(sql).all(...params) };
            },
            async raw() {
              return sqlite.prepare(sql).all(...params).map((row) => Object.values(row));
            },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return {
                success: true,
                results: [],
                meta: {
                  changes: Number(result.changes),
                  last_row_id: Number(result.lastInsertRowid)
                }
              };
            }
          };
        }
      };
    },
    async batch(statements) {
      if (barrierOpen) return executeBatch(statements);
      return new Promise((resolve, reject) => {
        pending.push({ statements, resolve, reject });
        if (pending.length < releaseAfterBatches) return;
        const queued = pending;
        pending = [];
        barrierOpen = true;
        void (async () => {
          for (const entry of queued) {
            try {
              entry.resolve(await executeBatch(entry.statements));
            } catch (error) {
              entry.reject(error);
            }
          }
        })();
      });
    }
  };
}

function bucketFixture() {
  const objects = new Map();
  const writes = [];
  const deleted = [];
  const bucket = {
    async head(key) {
      const value = objects.get(key);
      return value ? { key, size: value.bytes.byteLength } : null;
    },
    async list() {
      return {
        objects: [...objects.entries()].map(([key, value]) => ({ key, size: value.bytes.byteLength })),
        truncated: false
      };
    },
    async put(key, body) {
      if (objects.has(key)) return null;
      const blob = body;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      objects.set(key, { bytes, type: blob.type });
      writes.push(key);
      return { key, size: bytes.byteLength };
    },
    async delete(key) {
      deleted.push(key);
      objects.delete(key);
    }
  };
  return { bucket, objects, writes, deleted };
}

function namedBlob(text, name) {
  const file = new Blob([text], { type: 'image/png' });
  Object.defineProperty(file, 'name', { value: name, enumerable: true });
  return file;
}

function fixture(options = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  const d1 = d1Fixture(sqlite, options);
  const storage = bucketFixture();
  const db = createDb(d1);

  sqlite.prepare(
    'INSERT INTO cases (id, title, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 1, 1, 1)'
  ).run('production-case', 'Production case', 'all');
  sqlite.prepare(
    'INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, preview_session_id, superseded_by_asset_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 1, 1, 1)'
  ).run('asset-a', 'image', 'teaching-images/asset-a.png', 'image/png', 'source.png', 'Source image');
  sqlite.prepare(
    'INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, 0, ?, 1)'
  ).run('production-case', 'asset-a', 'Production caption');
  storage.objects.set('teaching-images/asset-a.png', {
    bytes: new TextEncoder().encode('old-image'),
    type: 'image/png'
  });

  return { sqlite, d1, db, ...storage };
}

function addLivePreviewFixedReference(fx) {
  const expiresAt = Date.now() + 60_000;
  fx.sqlite.prepare(
    'INSERT INTO preview_sessions (id, user_id, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)'
  ).run('preview-live', 'preview-user', 'active', expiresAt);
  fx.sqlite.prepare(
    'INSERT INTO cases (id, title, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 1, 1, 1)'
  ).run('preview-case', 'Preview case', 'all', 'preview-live');
  fx.sqlite.prepare(
    'INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, 0, ?, 1)'
  ).run('preview-case', 'asset-a', 'Preview caption');
}

function addLivePreviewOptionReference(fx) {
  const expiresAt = Date.now() + 60_000;
  fx.sqlite.prepare(
    'INSERT INTO preview_sessions (id, user_id, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)'
  ).run('preview-live', 'preview-user', 'active', expiresAt);
  fx.sqlite.prepare(
    'INSERT INTO cases (id, title, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 1, 1, 1)'
  ).run('preview-case', 'Preview case', 'all', 'preview-live');
  fx.sqlite.prepare(
    'INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, NULL, 1, 1, 1)'
  ).run('preview-group', 'preview-case', 'Preview alternatives', 'none');
  fx.sqlite.prepare(
    'INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, created_at) VALUES (?, ?, ?, 0, ?, 1, 1)'
  ).run('preview-option', 'preview-group', 'asset-a', 'Preview option caption');
}

test('concurrent replacement submissions allow exactly one claim and clean up the losing R2 object', async () => {
  const fx = fixture({ releaseAfterBatches: 2 });
  try {
    const attempts = await Promise.allSettled([
      replaceAssetWithHigherResolution({
        db: fx.db,
        bucket: fx.bucket,
        assetId: 'asset-a',
        file: namedBlob('first replacement', 'first.png'),
        confirmedSameImage: true
      }),
      replaceAssetWithHigherResolution({
        db: fx.db,
        bucket: fx.bucket,
        assetId: 'asset-a',
        file: namedBlob('second replacement', 'second.png'),
        confirmedSameImage: true
      })
    ]);

    const fulfilled = attempts.filter((result) => result.status === 'fulfilled');
    const rejected = attempts.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof AssetReplacementInputError);
    assert.match(rejected[0].reason.message, /already replaced by another submission/);

    const winner = fulfilled[0].value;
    const source = fx.sqlite.prepare(
      'SELECT is_active, superseded_by_asset_id FROM assets WHERE id = ?'
    ).get('asset-a');
    assert.equal(source.is_active, 0);
    assert.equal(source.superseded_by_asset_id, winner.newAssetId);

    const productionAssets = fx.sqlite.prepare(
      'SELECT id, is_active FROM assets WHERE preview_session_id IS NULL ORDER BY id'
    ).all();
    assert.equal(productionAssets.length, 2);
    assert.equal(productionAssets.filter((row) => row.is_active === 1).length, 1);
    assert.equal(productionAssets.some((row) => row.id === winner.newAssetId && row.is_active === 1), true);

    assert.equal(fx.writes.length, 2);
    assert.equal(fx.deleted.length, 1);
    assert.notEqual(fx.deleted[0], winner.newStorageKey);
    assert.equal(fx.objects.has('teaching-images/asset-a.png'), true);
    assert.equal(fx.objects.has(winner.newStorageKey), true);
    assert.equal(fx.objects.size, 2);
  } finally {
    fx.sqlite.close();
  }
});

for (const [label, addReference] of [
  ['fixed Case relationship', addLivePreviewFixedReference],
  ['stimulus option relationship', addLivePreviewOptionReference]
]) {
  test(`replacement preflight blocks an Asset referenced by a live Preview ${label}`, async () => {
    const fx = fixture();
    try {
      addReference(fx);
      await assert.rejects(
        () => replaceAssetWithHigherResolution({
          db: fx.db,
          bucket: fx.bucket,
          assetId: 'asset-a',
          file: namedBlob('blocked replacement', 'blocked.png'),
          confirmedSameImage: true
        }),
        (error) => error instanceof AssetReplacementInputError
          && /active Preview workspace/.test(error.message)
      );

      assert.deepEqual(fx.writes, []);
      assert.deepEqual(fx.deleted, []);
      const source = fx.sqlite.prepare(
        'SELECT is_active, superseded_by_asset_id FROM assets WHERE id = ?'
      ).get('asset-a');
      assert.equal(source.is_active, 1);
      assert.equal(source.superseded_by_asset_id, null);
    } finally {
      fx.sqlite.close();
    }
  });
}

test('Admin image detail visibly explains live Preview replacement blocking and renders action errors', () => {
  const ui = readFileSync(
    new URL('../src/routes/admin/images/[assetId]/+page.svelte', import.meta.url),
    'utf8'
  );
  assert.match(ui, /form\?\.error/);
  assert.match(ui, /livePreviewUsage\?\.hasUsage/);
  assert.match(ui, /referenced by an active Preview workspace/);
  assert.match(ui, /Reset that Preview workspace or let it expire/);
});
