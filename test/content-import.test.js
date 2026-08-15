// The test fixture intentionally models only the small D1/R2 surface used by the importer.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import {
  ContentPackageError,
  deterministicApplicationId,
  importContentPackage,
  parseImportPackage,
  validateImportPackage
} from '../src/lib/server/import/content-package.js';
import { createAssetFromUpload } from '../src/lib/server/db/asset-library.js';

const migrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');

function createLearningDb(options = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(buildSeedSql());
  const d1 = {
    prepare(sql) {
      return {
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
    async batch(statements) {
      if (options.failBatch) throw new Error('simulated D1 batch failure');
      return Promise.all(statements.map((statement) => statement.run()));
    }
  };
  return { db: createDb(d1), d1, sqlite };
}

function createBucket(options = {}) {
  const objects = new Map();
  let puts = 0;
  return {
    objects,
    get puts() { return puts; },
    async head(key) { return objects.get(key) ?? null; },
    async list() { return { objects: [...objects.values()], truncated: false }; },
    async put(key, file) {
      puts += 1;
      if (options.failPutAt && puts === options.failPutAt) throw new Error('simulated R2 failure');
      const object = { key, size: file.size };
      objects.set(key, object);
      return object;
    },
    async delete(key) { objects.delete(key); }
  };
}

function pngBytes(size = 8) {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function zip(entries) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const body = typeof entry.body === 'string' ? encoder.encode(entry.body) : entry.body;
    const local = new Uint8Array(30 + name.length + body.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0, true); view.setUint16(8, 0, true);
    view.setUint32(14, 0, true); view.setUint32(18, body.length, true); view.setUint32(22, body.length, true); view.setUint16(26, name.length, true); view.setUint16(28, 0, true);
    local.set(name, 30); local.set(body, 30 + name.length); chunks.push(local);
    const record = new Uint8Array(46 + name.length); const recordView = new DataView(record.buffer);
    recordView.setUint32(0, 0x02014b50, true); recordView.setUint16(4, 20, true); recordView.setUint16(6, 20, true); recordView.setUint16(8, 0, true); recordView.setUint16(10, 0, true);
    recordView.setUint32(20, body.length, true); recordView.setUint32(24, body.length, true); recordView.setUint16(28, name.length, true); recordView.setUint32(42, offset, true);
    record.set(name, 46); central.push(record); offset += local.length;
  }
  const centralBytes = concat(central); const end = new Uint8Array(22); const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, entries.length, true); endView.setUint16(10, entries.length, true); endView.setUint32(12, centralBytes.length, true); endView.setUint32(16, offset, true);
  return concat([...chunks, centralBytes, end]);
}

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0); const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function baseManifest(overrides = {}) {
  return {
    version: 1,
    packageId: 'test-package',
    topics: [{ id: 'topic-new', operation: 'create', name: 'Imported Topic', slug: 'imported-topic', parentTopicId: 'topic-existing' }, { id: 'topic-existing', operation: 'use', applicationId: 'seed-stemi' }],
    cases: [{ id: 'case-new', operation: 'create', title: 'Imported Case', vignetteMd: 'Reviewed stem.', primaryTopicId: 'topic-new', secondaryTopicIds: ['topic-existing'] }],
    assets: [{ id: 'asset-new', operation: 'create', path: 'media/ecg.png', mimeType: 'image/png', originalFilename: 'ecg.png', altText: 'A reviewed ECG tracing', sourceLabel: null, sourceUrl: null, licence: null }],
    caseAssets: [{ id: 'case-asset-new', operation: 'create', caseId: 'case-new', assetId: 'asset-new', displayOrder: 0, captionMd: null }],
    questionPrompts: [{ id: 'prompt-new', operation: 'create', promptMd: 'Describe this ECG.' }],
    caseQuestions: [{ id: 'case-question-new', operation: 'create', caseId: 'case-new', questionPromptId: 'prompt-new', answerMd: 'Reviewed answer.' }],
    topicQuestions: [{ id: 'topic-question-new', operation: 'create', topicId: 'topic-new', questionPromptId: 'prompt-new', answerMd: 'Reusable answer.', inheritToDescendants: false }],
    ...overrides
  };
}

function packageBytes(manifest, media = [['media/ecg.png', pngBytes()]]) {
  return zip([{ path: 'manifest.json', body: JSON.stringify(manifest) }, ...media.map(([path, body]) => ({ path, body }))]);
}

async function parsedValidPackage(overrides = {}, media) {
  return parseImportPackage(packageBytes(baseManifest(overrides), media));
}

test('valid manifest dry run reports reviewed domain-object counts and does not write', async () => {
  const fixture = createLearningDb();
  try {
    const parsed = await parsedValidPackage();
    const result = await validateImportPackage(fixture.db, parsed);
    assert.equal(result.valid, true);
    assert.deepEqual(result.preview.topics, { create: 1, use: 1, skip: 0 });
    assert.equal(result.preview.imagesToUpload, 1);
    assert.equal(fixture.sqlite.prepare("SELECT count(*) AS count FROM cases WHERE id LIKE 'fc-import:%'").get().count, 0);
  } finally { fixture.sqlite.close(); }
});

test('valid import creates topics, primary/secondary routes, assets and questions', async () => {
  const fixture = createLearningDb(); const bucket = createBucket();
  try {
    const validation = await validateImportPackage(fixture.db, await parsedValidPackage());
    const result = await importContentPackage(fixture.db, bucket, validation);
    assert.equal(result.uploadedImages, 1); assert.equal(bucket.objects.size, 1);
    const caseId = deterministicApplicationId('test-package', 'case', 'case-new');
    assert.deepEqual(fixture.sqlite.prepare('SELECT concept_id, role FROM case_concepts WHERE case_id = ? ORDER BY role').all(caseId).map((row) => ({ ...row })), [{ concept_id: deterministicApplicationId('test-package', 'topic', 'topic-new'), role: 'primary' }, { concept_id: 'seed-stemi', role: 'secondary' }]);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM case_assets WHERE case_id = ?').get(caseId).count, 1);
  } finally { fixture.sqlite.close(); }
});

test('unsupported manifest version and malformed JSON fail closed', async () => {
  await assert.rejects(() => parseImportPackage(packageBytes({ ...baseManifest(), version: 2 })), (error) => error instanceof ContentPackageError && /Unsupported/.test(error.message));
  await assert.rejects(() => parseImportPackage(zip([{ path: 'manifest.json', body: '{not json' }])), (error) => error instanceof ContentPackageError && /malformed JSON/.test(error.message));
});

test('missing or undeclared media and broken references are rejected', async () => {
  await assert.rejects(() => parseImportPackage(packageBytes(baseManifest(), [])), /media.*missing/i);
  const extra = packageBytes(baseManifest(), [['media/ecg.png', pngBytes()], ['media/unexpected.png', pngBytes()]]);
  await assert.rejects(() => parseImportPackage(extra), /undeclared/i);
  const fixture = createLearningDb();
  try {
    const parsed = await parsedValidPackage({ cases: [{ id: 'case-new', operation: 'create', title: 'Broken', primaryTopicId: 'missing-topic', secondaryTopicIds: [] }] });
    const validation = await validateImportPackage(fixture.db, parsed);
    assert.equal(validation.valid, false); assert.match(validation.errors.join('\n'), /missing primary Topic/);
  } finally { fixture.sqlite.close(); }
});

test('duplicate package IDs and invalid primary relationships are rejected', async () => {
  const duplicate = baseManifest({ topics: [{ id: 'same', operation: 'create', name: 'A', slug: 'a' }, { id: 'same', operation: 'create', name: 'B', slug: 'b' }] });
  await assert.rejects(() => parseImportPackage(packageBytes(duplicate)), /Duplicate package-local/);
  const invalid = baseManifest({ cases: [{ id: 'case-new', operation: 'create', title: 'No primary', secondaryTopicIds: [] }] });
  await assert.rejects(() => parseImportPackage(packageBytes(invalid)), /primaryTopicId/);
});

test('explicitly reused Topic and explicitly skipped Case are validated by application ID', async () => {
  const fixture = createLearningDb();
  try {
    const manifest = baseManifest({
      topics: [{ id: 'topic-existing', operation: 'use', applicationId: 'seed-stemi' }],
      cases: [{ id: 'case-existing', operation: 'skip', applicationId: 'seed-anterior-a', secondaryTopicIds: [] }],
      assets: [], caseAssets: [], questionPrompts: [], caseQuestions: [], topicQuestions: []
    });
    const result = await validateImportPackage(fixture.db, await parsedValidPackage(manifest, []));
    assert.equal(result.valid, true); assert.equal(result.preview.cases.skip, 1);
  } finally { fixture.sqlite.close(); }
});

test('an unexpected existing deterministic ID is a conflict, not an overwrite', async () => {
  const fixture = createLearningDb();
  try {
    const id = deterministicApplicationId('test-package', 'topic', 'topic-new');
    fixture.sqlite.prepare('INSERT INTO concepts (id, name, slug, is_active) VALUES (?, ?, ?, 1)').run(id, 'Unexpected', 'unexpected-id');
    const result = await validateImportPackage(fixture.db, await parsedValidPackage());
    assert.equal(result.valid, false); assert.match(result.errors.join('\n'), /conflicts/);
  } finally { fixture.sqlite.close(); }
});

test('image size, MIME, unsafe paths, and duplicate ZIP entries are rejected', async () => {
  const tooLarge = pngBytes(5 * 1024 * 1024 + 1);
  await assert.rejects(() => parseImportPackage(packageBytes(baseManifest(), [['media/ecg.png', tooLarge]])), /individual image limit/);
  await assert.rejects(() => parseImportPackage(packageBytes(baseManifest({ assets: [{ id: 'asset-new', operation: 'create', path: 'media/ecg.gif', mimeType: 'image/gif', altText: 'x' }] }), [['media/ecg.gif', pngBytes()]])), /image\/jpeg or image\/png/);
  await assert.rejects(() => parseImportPackage(zip([{ path: '../manifest.json', body: '{}' }])), /Unsafe ZIP path/);
  const duplicate = zip([{ path: 'manifest.json', body: JSON.stringify(baseManifest()) }, { path: 'manifest.json', body: JSON.stringify(baseManifest()) }]);
  await assert.rejects(() => parseImportPackage(duplicate), /Duplicate ZIP entry/);
});

test('R2 failure cleans up objects uploaded earlier in the batch', async () => {
  const fixture = createLearningDb(); const bucket = createBucket({ failPutAt: 2 });
  const manifest = baseManifest({ assets: [
    { id: 'asset-new', operation: 'create', path: 'media/ecg.png', mimeType: 'image/png', altText: 'ECG' },
    { id: 'asset-two', operation: 'create', path: 'media/ecg-2.png', mimeType: 'image/png', altText: 'ECG two' }
  ], caseAssets: [] });
  try {
    const validation = await validateImportPackage(fixture.db, await parsedValidPackage(manifest, [['media/ecg.png', pngBytes()], ['media/ecg-2.png', pngBytes()]]));
    await assert.rejects(() => importContentPackage(fixture.db, bucket, validation), /R2 failure/);
    assert.equal(bucket.objects.size, 0);
  } finally { fixture.sqlite.close(); }
});

test('D1 failure after media upload attempts orphan cleanup', async () => {
  const fixture = createLearningDb({ failBatch: true }); const bucket = createBucket();
  try {
    const validation = await validateImportPackage(fixture.db, await parsedValidPackage());
    await assert.rejects(() => importContentPackage(fixture.db, bucket, validation), /D1 batch failure/);
    assert.equal(bucket.objects.size, 0);
  } finally { fixture.sqlite.close(); }
});

test('repeat submission is idempotent and does not upload a second image', async () => {
  const fixture = createLearningDb(); const bucket = createBucket();
  try {
    const parsed = await parsedValidPackage();
    await importContentPackage(fixture.db, bucket, await validateImportPackage(fixture.db, parsed));
    const secondValidation = await validateImportPackage(fixture.db, parsed);
    assert.equal(secondValidation.valid, true);
    const result = await importContentPackage(fixture.db, bucket, secondValidation);
    assert.equal(result.uploadedImages, 0); assert.equal(bucket.puts, 1);
    assert.equal(fixture.sqlite.prepare("SELECT count(*) AS count FROM assets WHERE id LIKE 'fc-import:%'").get().count, 1);
  } finally { fixture.sqlite.close(); }
});

test('ordinary Image Library upload still requires alt text and uses the protected path', async () => {
  const fixture = createLearningDb(); const bucket = createBucket();
  try {
    const file = new File([pngBytes()], 'ordinary.png', { type: 'image/png' });
    const created = await createAssetFromUpload(fixture.db, bucket, file, { altText: 'An ordinary upload' });
    assert.equal(bucket.puts, 1); assert.match(created.storageKey, /^teaching-images\//);
    await assert.rejects(() => createAssetFromUpload(fixture.db, bucket, file, { altText: '' }), /Alt text/);
  } finally { fixture.sqlite.close(); }
});
