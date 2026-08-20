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
  parseAssetLibraryFilters,
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
  /** @type {Map<string, { key: string, size: number }>} */
  const objects = new Map();
  let putCount = 0;
  return {
    get putCount() { return putCount; },
    /** @param {string} key */
    async head(key) { return objects.get(key) ?? null; },
    async list() { return { objects: [...objects.values()], truncated: false }; },
    /** @param {string} key @param {Blob} file */
    async put(key, file) {
      putCount += 1;
      const object = { key, size: file.size };
      objects.set(key, object);
      return object;
    },
    /** @param {string} key */
    async delete(key) { objects.delete(key); }
  };
}

/** @param {import('node:sqlite').DatabaseSync} sqlite @param {{ id: string, name: string, createdAt: number }} asset */
function insertTestAsset(sqlite, asset) {
  sqlite.prepare('INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    asset.id,
    'image',
    `teaching-images/${asset.id}.png`,
    'image/png',
    asset.name,
    `${asset.name} alt text`,
    1,
    asset.createdAt,
    asset.createdAt
  );
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

/**
 * @param {Request} request
 * @param {ReturnType<typeof createLearningDb>} fixture
 * @param {ReturnType<typeof createR2Bucket>} bucket
 */
function createUploadEvent(request, fixture, bucket) {
  return /** @type {any} */ ({
    request,
    locals: { user: { role: 'admin' } },
    platform: { env: { DB: fixture.d1, MEDIA: bucket } }
  });
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

test('Image Library supports deterministic sorting, Topic filtering, and card context', async () => {
  const fixture = createLearningDb();
  try {
    for (const asset of [
      { id: 'asset-sort-newest', name: 'Newest sorting image', createdAt: 4_000 },
      { id: 'asset-sort-oldest', name: 'Oldest sorting image', createdAt: 1_000 },
      { id: 'asset-sort-alpha', name: 'Alpha sorting image', createdAt: 2_000 },
      { id: 'asset-sort-beta', name: 'Beta sorting image', createdAt: 3_000 }
    ]) insertTestAsset(fixture.sqlite, asset);

    fixture.sqlite.prepare('INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, ?, ?, ?)').run('seed-anterior-a', 'asset-sort-alpha', 1, null, 5_000);
    fixture.sqlite.prepare('INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, ?, ?, ?)').run('seed-anterior-a', 'asset-sort-beta', 2, null, 5_000);
    fixture.sqlite.prepare('INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, ?, ?, ?)').run('seed-anterior-b', 'asset-sort-beta', 1, null, 5_000);

    const filter = { search: 'sorting' };
    assert.deepEqual((await listAssetLibrary(fixture.db, filter)).map((asset) => asset.id), ['asset-sort-newest', 'asset-sort-beta', 'asset-sort-alpha', 'asset-sort-oldest']);
    assert.deepEqual((await listAssetLibrary(fixture.db, { ...filter, sort: 'oldest' })).map((asset) => asset.id), ['asset-sort-oldest', 'asset-sort-alpha', 'asset-sort-beta', 'asset-sort-newest']);
    assert.deepEqual((await listAssetLibrary(fixture.db, { ...filter, sort: 'name-asc' })).map((asset) => asset.id), ['asset-sort-alpha', 'asset-sort-beta', 'asset-sort-newest', 'asset-sort-oldest']);
    assert.deepEqual((await listAssetLibrary(fixture.db, { ...filter, sort: 'name-desc' })).map((asset) => asset.id), ['asset-sort-oldest', 'asset-sort-newest', 'asset-sort-beta', 'asset-sort-alpha']);
    assert.deepEqual((await listAssetLibrary(fixture.db, { ...filter, sort: 'most-used' })).map((asset) => asset.id), ['asset-sort-beta', 'asset-sort-alpha', 'asset-sort-newest', 'asset-sort-oldest']);
    assert.deepEqual((await listAssetLibrary(fixture.db, { ...filter, sort: 'least-used' })).map((asset) => asset.id), ['asset-sort-oldest', 'asset-sort-newest', 'asset-sort-alpha', 'asset-sort-beta']);
    assert.equal(parseAssetLibraryFilters(new URLSearchParams()).sort, 'newest');

    fixture.sqlite.prepare('INSERT INTO concepts (id, name, slug, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('seed-emergency-medicine', 'Emergency Medicine', 'emergency-medicine', 1, 6_000, 6_000);
    fixture.sqlite.prepare('INSERT INTO cases (id, title, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('seed-emergency-anterior-case', 'Emergency anterior case', 1, 6_000, 6_000);
    fixture.sqlite.prepare('INSERT INTO case_concepts (case_id, concept_id, role, created_at) VALUES (?, ?, ?, ?)').run('seed-emergency-anterior-case', 'seed-emergency-medicine', 'primary', 6_000);
    fixture.sqlite.prepare('INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, ?, ?, ?)').run('seed-emergency-anterior-case', 'seed-asset-anterior-a', 0, null, 6_000);

    const emergencyAssets = await listAssetLibrary(fixture.db, { topic: 'seed-emergency-medicine' });
    assert.deepEqual(emergencyAssets.map((asset) => asset.id), ['seed-asset-anterior-a']);
    assert.equal(emergencyAssets[0].usageCount, 2);
    assert.deepEqual(new Set(emergencyAssets[0].topicNames), new Set(['Anterior STEMI', 'Emergency Medicine']));
    assert.equal(emergencyAssets[0].topicSummary, 'Anterior STEMI · Emergency Medicine');
    assert.ok(emergencyAssets[0].createdAt);

    const composed = await listAssetLibrary(fixture.db, {
      search: 'Anterior STEMI ECG example A',
      topic: 'seed-emergency-medicine',
      usage: 'current',
      status: 'active',
      source: 'unknown'
    });
    assert.deepEqual(composed.map((asset) => asset.id), ['seed-asset-anterior-a']);
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
      () => actions.upload(createUploadEvent(createUploadRequest(), fixture, bucket)),
      (error) => {
        const redirectError = /** @type {{ status?: number, location?: string }} */ (error);
        assert.equal(redirectError.status, 303);
        assert.match(redirectError.location ?? '', /^\/admin\/images\/[^?]+\?status=uploaded$/);
        redirectLocation = redirectError.location ?? '';
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

    const badSource = await actions.upload(createUploadEvent(
      createUploadRequest({ sourceUrl: 'javascript:alert(1)' }),
      fixture,
      bucket
    ));
    assert.equal(badSource.status, 400);
    assert.match(badSource.data.error, /valid http\(s\) URL/);

    const tooLarge = await actions.upload(createUploadEvent(
      createUploadRequest({ size: 5 * 1024 * 1024 + 1 }),
      fixture,
      bucket
    ));
    assert.equal(tooLarge.status, 400);
    assert.match(tooLarge.data.error, /upload limit/);
    assert.equal(bucket.putCount, 0);
  } finally {
    fixture.sqlite.close();
  }
});
