import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import {
  AssetLibraryInputError,
  getAssetLibraryDetail,
  listAssetLibrary,
  updateAssetMetadata
} from '../src/lib/server/db/asset-library.js';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('$lib/')) {
      return {
        url: new URL(`../src/lib/${specifier.slice('$lib/'.length)}`, import.meta.url).href,
        shortCircuit: true
      };
    }
    return nextResolve(specifier, context);
  }
});

const migrationSql = readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(buildSeedSql());
  const d1 = {
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
    }
  };
  return {
    db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))),
    d1,
    sqlite
  };
}

function createR2Bucket() {
  const objects = new Map();
  let putCount = 0;
  return {
    get putCount() { return putCount; },
    async head(key) { return objects.get(key) ?? null; },
    async list() { return { objects: [...objects.values()], truncated: false }; },
    async put(key, file) {
      putCount += 1;
      const object = { key, size: file.size };
      objects.set(key, object);
      return object;
    },
    async delete(key) { objects.delete(key); }
  };
}

/** @param {{ sourceUrl?: string, size?: number }} [options] */
function createUploadRequest(options = {}) {
  const formData = new FormData();
  formData.set('image', new File([new Uint8Array(options.size ?? 16)], 'teaching-image.png', { type: 'image/png' }));
  formData.set('image_name', 'Teaching image.png');
  formData.set('alt_text', 'A teaching image');
  formData.set('source_label', 'Teaching source');
  formData.set('source_url', options.sourceUrl ?? 'https://example.com/source');
  formData.set('licence', 'Test licence');
  return new Request('http://localhost/admin/images/new?/upload', { method: 'POST', body: formData });
}

test('Asset metadata renaming changes D1 metadata only and preserves storage relationships', async () => {
  const fixture = createLearningDb();
  try {
    const before = fixture.sqlite.prepare('SELECT id, storage_key, original_filename, alt_text FROM assets WHERE id = ?').get('seed-asset-pityriasis-herald');
    const beforeRelationships = fixture.sqlite.prepare('SELECT case_id, asset_id, display_order, caption_md FROM case_assets WHERE asset_id = ?').all('seed-asset-pityriasis-herald');
    assert.ok(before);

    await updateAssetMetadata(fixture.db, 'seed-asset-pityriasis-herald', /** @type {any} */ ({
      originalFilename: 'Herald patch — renamed.png',
      altText: 'Updated alt text',
      sourceLabel: 'DermNet',
      sourceUrl: 'https://dermnetnz.org/topics/pityriasis-rosea',
      licence: 'Used with permission',
      isActive: false,
      storageKey: 'must-not-be-applied'
    }));

    const after = fixture.sqlite.prepare('SELECT id, storage_key, original_filename, alt_text, source_label, source_url, licence, is_active FROM assets WHERE id = ?').get('seed-asset-pityriasis-herald');
    assert.ok(after);
    assert.deepEqual({ id: after.id, storage_key: after.storage_key }, { id: before.id, storage_key: before.storage_key });
    assert.equal(after.original_filename, 'Herald patch — renamed.png');
    assert.equal(after.alt_text, 'Updated alt text');
    assert.equal(after.source_url, 'https://dermnetnz.org/topics/pityriasis-rosea');
    assert.equal(after.is_active, 0);
    assert.deepEqual(fixture.sqlite.prepare('SELECT case_id, asset_id, display_order, caption_md FROM case_assets WHERE asset_id = ?').all('seed-asset-pityriasis-herald'), beforeRelationships);

    await updateAssetMetadata(fixture.db, 'seed-asset-pityriasis-herald', {
      originalFilename: 'Herald patch',
      altText: 'Herald patch',
      sourceLabel: null,
      sourceUrl: null,
      licence: null,
      isActive: true
    });
    const unknownSource = fixture.sqlite.prepare('SELECT source_label, source_url, licence, is_active FROM assets WHERE id = ?').get('seed-asset-pityriasis-herald');
    assert.deepEqual({ ...unknownSource }, { source_label: null, source_url: null, licence: null, is_active: 1 });
  } finally {
    fixture.sqlite.close();
  }
});

test('Asset Library searches metadata and filters usage, status, and provenance', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.prepare('INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, source_label, source_url, licence, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'asset-unused', 'image', 'teaching-images/unused.png', 'image/png', 'Unused teaching image.png', 'A retained unused image', null, null, null, 0, 1_755_206_400_001, 1_755_206_400_001
    );

    const searched = await listAssetLibrary(fixture.db, { search: 'pityriasis' });
    assert.deepEqual(searched.map((asset) => asset.id), ['seed-asset-pityriasis-trunk', 'seed-asset-pityriasis-herald']);
    assert.deepEqual((await listAssetLibrary(fixture.db, { usage: 'unused' })).map((asset) => asset.id), ['asset-unused']);
    assert.deepEqual((await listAssetLibrary(fixture.db, { status: 'inactive' })).map((asset) => asset.id), ['asset-unused']);
    assert.deepEqual((await listAssetLibrary(fixture.db, { source: 'known' })).map((asset) => asset.id), ['seed-asset-pityriasis-herald']);
    assert.ok((await listAssetLibrary(fixture.db, { source: 'unknown' })).some((asset) => asset.id === 'asset-unused'));

    const detail = await getAssetLibraryDetail(fixture.db, 'seed-asset-pityriasis-herald');
    assert.ok(detail);
    assert.equal(detail.asset.usageCount, 1);
    assert.deepEqual(detail.usages.map((usage) => [usage.caseId, usage.captionMd]), [['seed-pityriasis-rosea', 'Herald patch']]);
    assert.equal(detail.asset.imageUrl, '/api/assets/seed-asset-pityriasis-herald/image');

    await assert.rejects(
      () => updateAssetMetadata(fixture.db, 'seed-asset-pityriasis-herald', { sourceUrl: 'javascript:alert(1)', isActive: true }),
      (error) => error instanceof AssetLibraryInputError && /valid http\(s\)/.test(error.message)
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('new Image Library upload action redirects after a successful upload', async () => {
  const fixture = createLearningDb();
  const bucket = createR2Bucket();
  try {
    const { actions } = await import('../src/routes/admin/images/new/+page.server.js');
    let redirectLocation = '';

    await assert.rejects(
      () => actions.upload({
        request: createUploadRequest(),
        locals: { user: { role: 'admin' } },
        platform: { env: { DB: fixture.d1, MEDIA: bucket } }
      }),
      (error) => {
        assert.equal(error?.status, 303);
        assert.match(error?.location ?? '', /^\/admin\/images\/[^?]+\?status=uploaded$/);
        redirectLocation = error.location;
        return true;
      }
    );

    const assetId = decodeURIComponent(redirectLocation.slice('/admin/images/'.length).split('?')[0]);
    const stored = fixture.sqlite.prepare('SELECT id, storage_key, original_filename, source_url FROM assets WHERE id = ?').get(assetId);
    assert.ok(stored);
    assert.equal(stored.original_filename, 'Teaching image.png');
    assert.equal(stored.source_url, 'https://example.com/source');
    assert.equal(bucket.putCount, 1);
  } finally {
    fixture.sqlite.close();
  }
});

test('new Image Library upload action preserves input and storage validation failures', async () => {
  const fixture = createLearningDb();
  const bucket = createR2Bucket();
  try {
    const { actions } = await import('../src/routes/admin/images/new/+page.server.js');

    const badSource = await actions.upload({
      request: createUploadRequest({ sourceUrl: 'javascript:alert(1)' }),
      locals: { user: { role: 'admin' } },
      platform: { env: { DB: fixture.d1, MEDIA: bucket } }
    });
    assert.equal(badSource.status, 400);
    assert.match(badSource.data.error, /valid http\(s\) URL/);

    const tooLarge = await actions.upload({
      request: createUploadRequest({ size: 5 * 1024 * 1024 + 1 }),
      locals: { user: { role: 'admin' } },
      platform: { env: { DB: fixture.d1, MEDIA: bucket } }
    });
    assert.equal(tooLarge.status, 400);
    assert.match(tooLarge.data.error, /upload limit/);
    assert.equal(bucket.putCount, 0);
  } finally {
    fixture.sqlite.close();
  }
});
