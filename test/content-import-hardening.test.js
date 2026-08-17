// Regression coverage for the hardened reviewed-package facade.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { createDb } from '../src/lib/server/db/index.js';
import {
  ContentPackageError,
  deterministicApplicationId,
  importContentPackage,
  importPackageDigest,
  parseImportPackage,
  validateImportPackage
} from '../src/lib/server/import/reviewed-content-package.js';

const migrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
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
  };
  return { db: createDb(d1), sqlite };
}

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function asBytes(value) {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

function zip(entries) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const raw = asBytes(entry.body);
    const method = entry.deflate ? 8 : 0;
    const compressed = entry.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const declaredUncompressedSize = entry.declaredUncompressedSize ?? raw.length;

    const local = new Uint8Array(30 + name.length + compressed.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, 0, true);
    localView.setUint32(18, compressed.length, true);
    localView.setUint32(22, declaredUncompressedSize, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(compressed, 30 + name.length);
    localChunks.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, 0, true);
    centralView.setUint32(20, compressed.length, true);
    centralView.setUint32(24, declaredUncompressedSize, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralChunks.push(central);
    offset += local.length;
  }

  const centralBytes = concat(centralChunks);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralBytes.length, true);
  endView.setUint32(16, offset, true);
  return concat([...localChunks, centralBytes, end]);
}

function emptyManifest(overrides = {}) {
  return {
    version: 1,
    packageId: 'hardening-test',
    topics: [],
    cases: [],
    assets: [],
    caseAssets: [],
    questionPrompts: [],
    caseQuestions: [],
    topicQuestions: [],
    ...overrides
  };
}

function packageBytes(manifest, media = []) {
  return zip([
    { path: 'manifest.json', body: JSON.stringify(manifest) },
    ...media.map(([path, body, options = {}]) => ({ path, body, ...options }))
  ]);
}

function pngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

test('preflight rejects a deflated entry that expands past its declared size', async () => {
  const manifest = emptyManifest();
  const bomb = new Uint8Array(1024 * 1024);
  const bytes = zip([
    { path: 'manifest.json', body: JSON.stringify(manifest) },
    { path: 'media/bomb.png', body: bomb, deflate: true, declaredUncompressedSize: 8 }
  ]);
  await assert.rejects(
    () => parseImportPackage(bytes),
    (error) => error instanceof ContentPackageError && /declared decompressed size/i.test(error.message)
  );
});

test('topic cycles fail validation without recursing indefinitely', async () => {
  const fixture = createLearningDb();
  try {
    const parsed = await parseImportPackage(packageBytes(emptyManifest({
      topics: [
        { id: 'topic-a', operation: 'create', name: 'A', slug: 'a', parentTopicId: 'topic-b' },
        { id: 'topic-b', operation: 'create', name: 'B', slug: 'b', parentTopicId: 'topic-a' }
      ]
    })));
    const validation = await validateImportPackage(fixture.db, parsed);
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join('\n'), /cycle/i);
  } finally {
    fixture.sqlite.close();
  }
});

test('use Question IDs must belong to the declared owner and prompt', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec(`
      INSERT INTO cases (id, title, is_active) VALUES ('case-one', 'One', 1), ('case-two', 'Two', 1);
      INSERT INTO concepts (id, name, slug, is_active) VALUES ('topic-one', 'One', 'topic-one', 1), ('topic-two', 'Two', 'topic-two', 1);
      INSERT INTO question_prompts (id, prompt_md, is_active) VALUES ('prompt-one', 'Prompt', 1);
      INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES ('case-question-one', 'case-one', 'prompt-one', 'Answer', 1);
      INSERT INTO concept_questions (id, concept_id, question_prompt_id, answer_md, inherit_to_descendants, is_active) VALUES ('topic-question-one', 'topic-one', 'prompt-one', 'Answer', 0, 1);
    `);

    const parsed = await parseImportPackage(packageBytes(emptyManifest({
      cases: [{ id: 'case-target', operation: 'use', applicationId: 'case-two' }],
      topics: [{ id: 'topic-target', operation: 'use', applicationId: 'topic-two' }],
      questionPrompts: [{ id: 'prompt', operation: 'use', applicationId: 'prompt-one' }],
      caseQuestions: [{ id: 'case-question', operation: 'use', applicationId: 'case-question-one', caseId: 'case-target', questionPromptId: 'prompt' }],
      topicQuestions: [{ id: 'topic-question', operation: 'use', applicationId: 'topic-question-one', topicId: 'topic-target', questionPromptId: 'prompt' }]
    })));
    const validation = await validateImportPackage(fixture.db, parsed);
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join('\n'), /Case Question.*does not belong/i);
    assert.match(validation.errors.join('\n'), /Topic Question.*does not belong/i);
  } finally {
    fixture.sqlite.close();
  }
});

test('deterministic Asset retry validation includes the R2 storage key', async () => {
  const fixture = createLearningDb();
  try {
    const packageId = 'asset-package';
    const assetId = deterministicApplicationId(packageId, 'asset', 'asset-one');
    fixture.sqlite.prepare(`
      INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, source_label, source_url, licence, is_active)
      VALUES (?, 'image', 'teaching-images/wrong.png', 'image/png', NULL, 'ECG', NULL, NULL, NULL, 1)
    `).run(assetId);

    const parsed = await parseImportPackage(packageBytes(emptyManifest({
      packageId,
      assets: [{ id: 'asset-one', operation: 'create', path: 'media/ecg.png', mimeType: 'image/png', altText: 'ECG' }]
    }), [['media/ecg.png', pngBytes()]]));
    const validation = await validateImportPackage(fixture.db, parsed);
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join('\n'), /deterministic storage key/i);
  } finally {
    fixture.sqlite.close();
  }
});

test('dry run detects existing Topic slug and relationship uniqueness conflicts', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec(`
      INSERT INTO concepts (id, name, slug, is_active) VALUES ('existing-topic', 'Existing', 'taken-slug', 1);
      INSERT INTO cases (id, title, is_active) VALUES ('existing-case', 'Existing case', 1);
      INSERT INTO assets (id, type, storage_key, mime_type, alt_text, is_active) VALUES ('asset-one', 'image', 'teaching-images/a.png', 'image/png', 'A', 1), ('asset-two', 'image', 'teaching-images/b.png', 'image/png', 'B', 1);
      INSERT INTO case_assets (case_id, asset_id, display_order) VALUES ('existing-case', 'asset-one', 0);
    `);

    const slugParsed = await parseImportPackage(packageBytes(emptyManifest({
      topics: [{ id: 'new-topic', operation: 'create', name: 'New', slug: 'taken-slug' }]
    })));
    const slugValidation = await validateImportPackage(fixture.db, slugParsed);
    assert.equal(slugValidation.valid, false);
    assert.match(slugValidation.errors.join('\n'), /slug taken-slug is already used/i);

    const orderParsed = await parseImportPackage(packageBytes(emptyManifest({
      cases: [{ id: 'case', operation: 'use', applicationId: 'existing-case' }],
      assets: [{ id: 'asset', operation: 'use', applicationId: 'asset-two' }],
      caseAssets: [{ id: 'link', operation: 'create', caseId: 'case', assetId: 'asset', displayOrder: 0 }]
    })));
    const orderValidation = await validateImportPackage(fixture.db, orderParsed);
    assert.equal(orderValidation.valid, false);
    assert.match(orderValidation.errors.join('\n'), /display order 0 is already occupied/i);
  } finally {
    fixture.sqlite.close();
  }
});

test('dry run rejects duplicate create relationships inside one package', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec(`
      INSERT INTO cases (id, title, is_active) VALUES ('existing-case', 'Existing case', 1);
      INSERT INTO assets (id, type, storage_key, mime_type, alt_text, is_active) VALUES ('asset-one', 'image', 'teaching-images/a.png', 'image/png', 'A', 1), ('asset-two', 'image', 'teaching-images/b.png', 'image/png', 'B', 1);
    `);
    const parsed = await parseImportPackage(packageBytes(emptyManifest({
      cases: [{ id: 'case', operation: 'use', applicationId: 'existing-case' }],
      assets: [
        { id: 'asset-a', operation: 'use', applicationId: 'asset-one' },
        { id: 'asset-b', operation: 'use', applicationId: 'asset-two' }
      ],
      caseAssets: [
        { id: 'link-a', operation: 'create', caseId: 'case', assetId: 'asset-a', displayOrder: 0 },
        { id: 'link-b', operation: 'create', caseId: 'case', assetId: 'asset-b', displayOrder: 0 }
      ]
    })));
    const validation = await validateImportPackage(fixture.db, parsed);
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join('\n'), /display order 0.*conflicts/i);
  } finally {
    fixture.sqlite.close();
  }
});

test('created Topics are ordered parent-first before the D1 batch', async () => {
  const fixture = createLearningDb();
  try {
    const packageId = 'topic-order-package';
    const parsed = await parseImportPackage(packageBytes(emptyManifest({
      packageId,
      topics: [
        { id: 'child', operation: 'create', name: 'Child', slug: 'child', parentTopicId: 'parent' },
        { id: 'parent', operation: 'create', name: 'Parent', slug: 'parent', parentTopicId: null }
      ]
    })));
    const validation = await validateImportPackage(fixture.db, parsed);
    assert.equal(validation.valid, true);
    assert.deepEqual(validation.plan.parsed.manifest.topics.filter((topic) => topic.operation === 'create').map((topic) => topic.id), ['parent', 'child']);

    await importContentPackage(fixture.db, {}, validation);
    const childId = deterministicApplicationId(packageId, 'topic', 'child');
    const parentId = deterministicApplicationId(packageId, 'topic', 'parent');
    const child = fixture.sqlite.prepare('SELECT parent_id FROM concepts WHERE id = ?').get(childId);
    assert.equal(child.parent_id, parentId);
  } finally {
    fixture.sqlite.close();
  }
});

test('package digest is stable for the previewed bytes and changes with the ZIP', async () => {
  const first = packageBytes(emptyManifest({ packageId: 'digest-one' }));
  const second = packageBytes(emptyManifest({ packageId: 'digest-two' }));
  const firstDigest = await importPackageDigest(first);
  assert.match(firstDigest, /^[0-9a-f]{64}$/);
  assert.equal(await importPackageDigest(first), firstDigest);
  assert.notEqual(await importPackageDigest(second), firstDigest);
});