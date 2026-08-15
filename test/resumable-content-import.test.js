// Resumable reviewed-import regression coverage.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  IMPORT_D1_OPERATION_BUDGET,
  IMPORT_ITEMS_PER_REQUEST,
  VALIDATION_PHASES,
  WRITE_PHASES,
  applyImportChunk,
  cancelImportJob,
  createImportJob,
  getImportJob,
  itemsForPhase,
  prepareResumableImportPlan,
  processNextImportChunk
} from '../src/lib/server/import/resumable-content-package.js';
import { parseImportPackage } from '../src/lib/server/import/reviewed-content-package.js';
import { importPackageStorageKey } from '../src/lib/server/storage/import-packages.js';

const baseSql = readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '');
const importJobSql = readFileSync(new URL('../drizzle/0004_resumable_import_jobs.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '');

class D1StatementFake {
  constructor(owner, sql) { this.owner = owner; this.sql = sql; this.params = []; }
  bind(...params) { this.params = params; return this; }
  _count() { this.owner.operations += 1; if (this.owner.failPattern?.test(this.sql)) throw new Error('Injected D1 failure'); }
  async first(column) {
    this._count();
    const row = this.owner.sqlite.prepare(this.sql).get(...this.params) ?? null;
    return column && row ? row[column] : row;
  }
  async all() {
    this._count();
    return { success: true, results: this.owner.sqlite.prepare(this.sql).all(...this.params), meta: {} };
  }
  async raw() {
    this._count();
    return this.owner.sqlite.prepare(this.sql).all(...this.params).map((row) => Object.values(row));
  }
  async run() {
    this._count();
    const result = this.owner.sqlite.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid ?? 0) } };
  }
}

class D1Fake {
  constructor(sqlite) { this.sqlite = sqlite; this.operations = 0; this.failPattern = null; }
  prepare(sql) { return new D1StatementFake(this, sql); }
  resetCount() { this.operations = 0; }
}

class R2Fake {
  constructor() { this.objects = new Map(); }
  async head(key) { const bytes = this.objects.get(key); return bytes ? { key, size: bytes.byteLength } : null; }
  async put(key, body) {
    const bytes = body instanceof Uint8Array ? body.slice() : new Uint8Array(await body.arrayBuffer());
    this.objects.set(key, bytes);
    return { key, size: bytes.byteLength };
  }
  async get(key) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return { key, size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer };
  }
  async delete(key) { this.objects.delete(key); }
  async list() {
    return { objects: [...this.objects].map(([key, bytes]) => ({ key, size: bytes.byteLength })), truncated: false };
  }
}

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function zip(entries) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const body = typeof entry.body === 'string' ? encoder.encode(entry.body) : entry.body;
    const local = new Uint8Array(30 + name.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(8, 0, true);
    lv.setUint32(18, body.length, true); lv.setUint32(22, body.length, true); lv.setUint16(26, name.length, true);
    local.set(name, 30); local.set(body, 30 + name.length); localChunks.push(local);
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint32(20, body.length, true); cv.setUint32(24, body.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    central.set(name, 46); centralChunks.push(central); offset += local.length;
  }
  const centralBytes = concat(centralChunks);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralBytes.length, true); ev.setUint32(16, offset, true);
  return concat([...localChunks, centralBytes, end]);
}

function manifest(overrides = {}) {
  return { version: 1, packageId: 'resumable-test', topics: [], cases: [], assets: [], caseAssets: [], questionPrompts: [], caseQuestions: [], topicQuestions: [], ...overrides };
}

function archiveFor(payload, media = []) {
  return zip([{ path: 'manifest.json', body: JSON.stringify(payload) }, ...media]);
}

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(baseSql);
  sqlite.exec(importJobSql);
  return { sqlite, d1: new D1Fake(sqlite), bucket: new R2Fake() };
}

async function runUntil(d1, bucket, id, predicate, max = 100) {
  for (let i = 0; i < max; i += 1) {
    const before = await getImportJob(d1, id);
    if (predicate(before)) return before;
    await processNextImportChunk(d1, bucket, id);
  }
  throw new Error('Import did not reach expected state.');
}

test('migration creates the small authoritative import_jobs checkpoint table on fresh and upgraded databases', () => {
  const fresh = new DatabaseSync(':memory:');
  const upgraded = new DatabaseSync(':memory:');
  try {
    fresh.exec(importJobSql);
    assert.ok(fresh.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='import_jobs'").get());
    upgraded.exec(baseSql);
    upgraded.exec(importJobSql);
    const columns = upgraded.prepare("PRAGMA table_info('import_jobs')").all().map((row) => row.name);
    for (const required of ['package_sha256', 'package_storage_key', 'phase', 'cursor', 'processed_count', 'total_count', 'lease_token', 'lease_expires_at']) assert.ok(columns.includes(required));
  } finally { fresh.close(); upgraded.close(); }
});

test('static plan preserves skip safety and parent-first Topic ordering', async () => {
  const unsafe = await parseImportPackage(archiveFor(manifest({
    cases: [{ id: 'case-use', operation: 'skip', applicationId: 'existing-case' }],
    questionPrompts: [{ id: 'p', operation: 'create', promptMd: 'Prompt' }],
    caseQuestions: [{ id: 'q', operation: 'create', caseId: 'case-use', questionPromptId: 'p', answerMd: 'Answer' }]
  })));
  assert.throws(() => prepareResumableImportPlan(unsafe), /static validation/i);

  const parsed = await parseImportPackage(archiveFor(manifest({
    topics: [
      { id: 'child', operation: 'create', name: 'Child', slug: 'child', parentTopicId: 'parent' },
      { id: 'parent', operation: 'create', name: 'Parent', slug: 'parent', parentTopicId: null }
    ]
  })));
  const plan = prepareResumableImportPlan(parsed);
  assert.deepEqual(itemsForPhase(plan, 'import_topics').map((item) => item.id), ['parent', 'child']);
});

test('job start stages the exact package and creates the initial durable checkpoint', async () => {
  const { sqlite, d1, bucket } = setup();
  try {
    const archive = archiveFor(manifest({ questionPrompts: Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, operation: 'create', promptMd: `Prompt ${i}` })) }));
    const job = await createImportJob(d1, bucket, archive, 'admin-user');
    assert.equal(job.status, 'validating');
    assert.equal(job.phase, VALIDATION_PHASES[0]);
    assert.equal(job.cursor, 0);
    assert.equal(job.createdBy, 'admin-user');
    assert.ok(bucket.objects.has(importPackageStorageKey(job.id)));
  } finally { sqlite.close(); }
});

test('validation spans bounded requests and no domain writes occur before the whole validation sequence is ready', async () => {
  const { sqlite, d1, bucket } = setup();
  try {
    const prompts = Array.from({ length: IMPORT_ITEMS_PER_REQUEST + 3 }, (_, i) => ({ id: `p${i}`, operation: 'create', promptMd: `Prompt ${i}` }));
    const job = await createImportJob(d1, bucket, archiveFor(manifest({ questionPrompts: prompts })), 'admin');
    await processNextImportChunk(d1, bucket, job.id); // empty topics -> prompts
    const afterFirstPromptChunk = await processNextImportChunk(d1, bucket, job.id);
    assert.equal(afterFirstPromptChunk.job.phase, 'validate_question_prompts');
    assert.equal(afterFirstPromptChunk.job.cursor, IMPORT_ITEMS_PER_REQUEST);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM question_prompts').get().n, 0);
    const ready = await runUntil(d1, bucket, job.id, (row) => row.status === 'ready');
    assert.equal(ready.status, 'ready');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM question_prompts').get().n, 0);
  } finally { sqlite.close(); }
});

test('checkpoint survives a fresh D1 request wrapper and resume continues from persisted cursor', async () => {
  const { sqlite, d1, bucket } = setup();
  try {
    const prompts = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, operation: 'create', promptMd: `Prompt ${i}` }));
    const job = await createImportJob(d1, bucket, archiveFor(manifest({ questionPrompts: prompts })), 'admin');
    await processNextImportChunk(d1, bucket, job.id);
    await processNextImportChunk(d1, bucket, job.id);
    const persisted = await getImportJob(d1, job.id);
    assert.equal(persisted.cursor, IMPORT_ITEMS_PER_REQUEST);
    const freshRequestD1 = new D1Fake(sqlite);
    const result = await processNextImportChunk(freshRequestD1, bucket, job.id);
    assert.ok(result.job.processedCount > Number(persisted.processed_count));
  } finally { sqlite.close(); }
});

test('stale/concurrent processing lease returns busy without moving the checkpoint', async () => {
  const { sqlite, d1, bucket } = setup();
  try {
    const job = await createImportJob(d1, bucket, archiveFor(manifest()), 'admin');
    sqlite.prepare('UPDATE import_jobs SET lease_token = ?, lease_expires_at = ? WHERE id = ?').run('other-tab', Date.now() + 60_000, job.id);
    const before = await getImportJob(d1, job.id);
    const result = await processNextImportChunk(d1, bucket, job.id);
    const after = await getImportJob(d1, job.id);
    assert.equal(result.busy, true);
    assert.equal(after.phase, before.phase);
    assert.equal(after.cursor, before.cursor);
  } finally { sqlite.close(); }
});

test('re-applying a deterministic write chunk converges without duplicate rows', async () => {
  const { sqlite, d1, bucket } = setup();
  try {
    const parsed = await parseImportPackage(archiveFor(manifest({ topics: [{ id: 't', operation: 'create', name: 'Topic', slug: 'topic', parentTopicId: null }] })));
    const plan = prepareResumableImportPlan(parsed);
    const db = (await import('../src/lib/server/db/index.js')).createDb(d1);
    await applyImportChunk(db, bucket, plan, 'import_topics', 0, 1);
    await applyImportChunk(db, bucket, plan, 'import_topics', 0, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM concepts').get().n, 1);
  } finally { sqlite.close(); }
});

test('parent Topics remain parent-first even when a chain crosses a chunk boundary', async () => {
  const { sqlite, d1, bucket } = setup();
  try {
    const topics = Array.from({ length: IMPORT_ITEMS_PER_REQUEST + 2 }, (_, i) => ({ id: `t${i}`, operation: 'create', name: `Topic ${i}`, slug: `topic-${i}`, parentTopicId: i ? `t${i - 1}` : null }));
    const job = await createImportJob(d1, bucket, archiveFor(manifest({ topics })), 'admin');
    await runUntil(d1, bucket, job.id, (row) => row.status === 'ready');
    await processNextImportChunk(d1, bucket, job.id);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM concepts').get().n, IMPORT_ITEMS_PER_REQUEST);
    assert.ok(sqlite.prepare('SELECT id FROM concepts WHERE id LIKE ?').all('fc-import:%').length === IMPORT_ITEMS_PER_REQUEST);
    await processNextImportChunk(d1, bucket, job.id);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM concepts').get().n, topics.length);
  } finally { sqlite.close(); }
});

test('image upload is cleaned up when its D1 Asset insert fails', async () => {
  const { sqlite, d1, bucket } = setup();
  try {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const payload = manifest({ assets: [{ id: 'a', operation: 'create', path: 'media/a.png', mimeType: 'image/png', altText: 'Reviewed image' }] });
    const parsed = await parseImportPackage(archiveFor(payload, [{ path: 'media/a.png', body: png }]));
    const plan = prepareResumableImportPlan(parsed);
    const db = (await import('../src/lib/server/db/index.js')).createDb(d1);
    d1.failPattern = /^insert into "assets"/i;
    await assert.rejects(() => applyImportChunk(db, bucket, plan, 'import_assets', 0, 1), /Injected D1 failure/);
    const teachingKeys = [...bucket.objects.keys()].filter((key) => key.startsWith('teaching-images/'));
    assert.deepEqual(teachingKeys, []);
  } finally { sqlite.close(); }
});

test('failed job records its exact phase/cursor/error and can be retried after the conflict is corrected', async () => {
  const { sqlite, d1, bucket } = setup();
  try {
    const payload = manifest({ topics: [{ id: 't', operation: 'create', name: 'Topic', slug: 'target-slug', parentTopicId: null }] });
    const job = await createImportJob(d1, bucket, archiveFor(payload), 'admin');
    await runUntil(d1, bucket, job.id, (row) => row.status === 'ready');
    sqlite.exec("INSERT INTO concepts (id, name, slug, is_active) VALUES ('racer', 'Racer', 'target-slug', 1)");
    await assert.rejects(() => processNextImportChunk(d1, bucket, job.id));
    const failed = await getImportJob(d1, job.id);
    assert.equal(failed.status, 'failed');
    assert.equal(failed.phase, WRITE_PHASES[0]);
    assert.equal(failed.cursor, 0);
    assert.match(failed.last_error, /already used|changed since validation/i);
    sqlite.exec("DELETE FROM concepts WHERE id = 'racer'");
    const resumed = await processNextImportChunk(d1, bucket, job.id);
    assert.equal(resumed.job.status, 'importing');
  } finally { sqlite.close(); }
});

test('cancel stops processing, removes staging, and leaves already committed domain content intact', async () => {
  const { sqlite, d1, bucket } = setup();
  try {
    const payload = manifest({ topics: [{ id: 't', operation: 'create', name: 'Topic', slug: 'topic', parentTopicId: null }] });
    const job = await createImportJob(d1, bucket, archiveFor(payload), 'admin');
    await runUntil(d1, bucket, job.id, (row) => row.status === 'ready');
    await processNextImportChunk(d1, bucket, job.id);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM concepts').get().n, 1);
    const cancelled = await cancelImportJob(d1, bucket, job.id);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(bucket.objects.has(importPackageStorageKey(job.id)), false);
    await processNextImportChunk(d1, bucket, job.id);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM concepts').get().n, 1);
  } finally { sqlite.close(); }
});

test('completed import removes staged ZIP and leaves imported teaching image/content objects', async () => {
  const { sqlite, d1, bucket } = setup();
  try {
    const payload = manifest({ questionPrompts: [{ id: 'p', operation: 'create', promptMd: 'Prompt' }] });
    const job = await createImportJob(d1, bucket, archiveFor(payload), 'admin');
    const complete = await runUntil(d1, bucket, job.id, (row) => row.status === 'complete', 100);
    assert.equal(complete.status, 'complete');
    assert.equal(bucket.objects.has(importPackageStorageKey(job.id)), false);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM question_prompts').get().n, 1);
  } finally { sqlite.close(); }
});

test('representative worst-case process step stays below the conservative D1 operation budget', async () => {
  const { sqlite, d1, bucket } = setup();
  try {
    const topics = Array.from({ length: IMPORT_ITEMS_PER_REQUEST }, (_, i) => ({ id: `t${i}`, operation: 'create', name: `Topic ${i}`, slug: `topic-${i}`, parentTopicId: null }));
    const job = await createImportJob(d1, bucket, archiveFor(manifest({ topics })), 'admin');
    await runUntil(d1, bucket, job.id, (row) => row.status === 'ready');
    d1.resetCount();
    await processNextImportChunk(d1, bucket, job.id);
    assert.ok(d1.operations <= IMPORT_D1_OPERATION_BUDGET, `used ${d1.operations} D1 operations, budget ${IMPORT_D1_OPERATION_BUDGET}`);
  } finally { sqlite.close(); }
});
