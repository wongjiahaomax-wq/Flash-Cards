// Runtime/process-action coverage for the staging readiness and ownership fence.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  cancelImportJob,
  createImportJob,
  getImportJob,
  processNextImportChunk
} from '../src/lib/server/import/resumable-content-package-runtime.js';
import { applyCurrentSchema } from './current-schema.js';

const runtimeSource = readFileSync(new URL('../src/lib/server/import/resumable-content-package-runtime.js', import.meta.url), 'utf8');
const packageSource = readFileSync(new URL('../src/lib/server/import/resumable-content-package.js', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../src/routes/admin/import/+page.svelte', import.meta.url), 'utf8');

function concat(chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function archiveFor(manifest) {
  const body = new TextEncoder().encode(JSON.stringify(manifest));
  const name = new TextEncoder().encode('manifest.json');
  const local = new Uint8Array(30 + name.length + body.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint32(18, body.length, true); lv.setUint32(22, body.length, true); lv.setUint16(26, name.length, true);
  local.set(name, 30); local.set(body, 30 + name.length);
  const central = new Uint8Array(46 + name.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(20, body.length, true); cv.setUint32(24, body.length, true); cv.setUint16(28, name.length, true);
  central.set(name, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true); ev.setUint32(12, central.length, true); ev.setUint32(16, local.length, true);
  return concat([local, central, end]);
}

function manifest(packageId = 'staging-safety') {
  return { version: 1, packageId, topics: [], cases: [], assets: [], caseAssets: [], questionPrompts: [], caseQuestions: [], topicQuestions: [] };
}

class D1Statement {
  constructor(sqlite, sql) { this.sqlite = sqlite; this.sql = sql; this.params = []; }
  bind(...params) { this.params = params; return this; }
  async first() { return this.sqlite.prepare(this.sql).get(...this.params) ?? null; }
  async run() { const result = this.sqlite.prepare(this.sql).run(...this.params); return { meta: { changes: Number(result.changes) } }; }
}

class D1Fake {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) { return new D1Statement(this.sqlite, sql); }
}

class StagingBucket {
  constructor({ holdFirstPut = false, failPlanPut = false, failDelete = false } = {}) {
    this.objects = new Map();
    this.deleted = [];
    this.putCount = 0;
    this.firstPutStarted = new Promise((resolve) => { this.resolveFirstPutStarted = resolve; });
    this.releaseFirstPut = null;
    this.holdFirstPut = holdFirstPut;
    this.failPlanPut = failPlanPut;
    this.failDelete = failDelete;
  }

  async head(key) {
    const bytes = this.objects.get(key);
    return bytes ? { key, size: bytes.byteLength } : null;
  }

  async list(options = {}) {
    const prefix = options.prefix ?? '';
    return {
      objects: [...this.objects]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, bytes]) => ({ key, size: bytes.byteLength })),
      truncated: false
    };
  }

  async put(key, body, options = {}) {
    const condition = options.onlyIf instanceof Headers ? options.onlyIf.get('if-none-match') : null;
    if (condition === '*' && this.objects.has(key)) return null;
    this.putCount += 1;
    if (this.putCount === 1 && this.holdFirstPut) {
      this.resolveFirstPutStarted();
      await new Promise((resolve) => { this.releaseFirstPut = resolve; });
    }
    if (this.failPlanPut && key.endsWith('.plan.json')) throw new Error('injected plan PUT failure');
    const bytes = body instanceof Uint8Array ? body.slice() : new Uint8Array(await body.arrayBuffer());
    this.objects.set(key, bytes);
    return { key, size: bytes.byteLength };
  }

  async delete(key) {
    this.deleted.push(key);
    if (this.failDelete) throw new Error('injected cleanup failure');
    this.objects.delete(key);
  }
}

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  applyCurrentSchema(sqlite);
  return { sqlite, d1: new D1Fake(sqlite) };
}

test('initial staging ownership is atomic and expiry cannot authorize processing or deletion while a PUT is pending', async () => {
  const { sqlite, d1 } = setup();
  const bucket = new StagingBucket({ holdFirstPut: true });
  try {
    const creation = createImportJob(d1, bucket, archiveFor(manifest()), 'admin-user');
    await bucket.firstPutStarted;

    const row = sqlite.prepare('SELECT id, phase, status, lease_token, lease_expires_at FROM import_jobs').get();
    assert.equal(row.phase, 'staging');
    assert.equal(row.status, 'validating');
    assert.ok(row.lease_token);
    assert.ok(row.lease_expires_at > Date.now());

    await assert.rejects(() => processNextImportChunk(d1, bucket, row.id), /staging is incomplete/i);
    await assert.rejects(() => cancelImportJob(d1, bucket, row.id), /staging is still settling/i);
    sqlite.prepare('UPDATE import_jobs SET lease_expires_at = ? WHERE id = ?').run(Date.now() - 1, row.id);
    await assert.rejects(() => processNextImportChunk(d1, bucket, row.id), /staging is incomplete/i);
    await assert.rejects(() => cancelImportJob(d1, bucket, row.id), /staging is still settling/i);
    assert.deepEqual(bucket.deleted, []);
    assert.equal(bucket.putCount, 1, 'direct processing and cancellation must not begin another PUT');

    bucket.releaseFirstPut();
    const completed = await creation;
    assert.equal(completed.phase, 'validate_topics');
    assert.equal(completed.status, 'validating');
    const released = await getImportJob(d1, completed.id);
    assert.equal(released.lease_token, null);
    assert.equal(released.lease_expires_at, null);
  } finally {
    sqlite.close();
  }
});

test('failed staging is fenced, remains unprocessable, and retains the ordinary cleanup pathway', async () => {
  const { sqlite, d1 } = setup();
  const bucket = new StagingBucket({ failPlanPut: true, failDelete: true });
  try {
    await assert.rejects(() => createImportJob(d1, bucket, archiveFor(manifest('failed-staging')), 'admin-user'), /injected plan PUT failure/);
    const row = sqlite.prepare('SELECT id, phase, status, lease_token FROM import_jobs').get();
    assert.equal(row.phase, 'staging_failed');
    assert.equal(row.status, 'failed');
    assert.equal(row.lease_token, null);
    await assert.rejects(() => processNextImportChunk(d1, bucket, row.id), /staging is incomplete/i);

    const cancelled = await cancelImportJob(d1, bucket, row.id);
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(bucket.deleted.length > 0, true);
  } finally {
    sqlite.close();
  }
});

test('staging transitions and failure fencing require the original token and expected staging state', () => {
  assert.match(runtimeSource, /phase = 'staging' AND lease_token = \?/);
  assert.match(runtimeSource, /phase = 'staging_failed'/);
  assert.match(runtimeSource, /lease_token = NULL, lease_expires_at = NULL/);
  assert.match(packageSource, /job\.phase === 'staging'/);
  assert.match(packageSource, /phase = \?/);
  assert.match(pageSource, /if \(\['staging', 'staging_failed'\]\.includes\(job\.phase\)\) return false/);
  assert.match(pageSource, /cannot be retried or resumed/);
});
