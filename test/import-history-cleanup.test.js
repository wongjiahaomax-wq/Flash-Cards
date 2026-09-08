// Executable coverage for terminal-only strict import-history cleanup.
// @ts-nocheck

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  clearImportHistory,
  listImportHistory,
  removeImportHistory
} from '../src/lib/server/import/resumable-content-package.js';
import {
  importMediaStorageKey,
  importPackageStorageKey,
  importPlanStorageKey,
  importStagingPrefix
} from '../src/lib/server/storage/import-packages.js';
import { applyCurrentSchema } from './current-schema.js';

class D1Statement {
  constructor(owner, sql) { this.owner = owner; this.sql = sql; this.params = []; }
  bind(...params) { this.params = params; return this; }
  async first() { return this.owner.sqlite.prepare(this.sql).get(...this.params) ?? null; }
  async all() { return { results: this.owner.sqlite.prepare(this.sql).all(...this.params) }; }
  async run() { const result = this.owner.sqlite.prepare(this.sql).run(...this.params); return { meta: { changes: Number(result.changes) } }; }
}

class D1Fake {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.sqlite.exec('PRAGMA foreign_keys = ON'); applyCurrentSchema(this.sqlite); }
  prepare(sql) { return new D1Statement(this, sql); }
  close() { this.sqlite.close(); }
}

class R2Fake {
  constructor(pageSize = 1000) { this.objects = new Map(); this.pageSize = pageSize; this.deleteCalls = []; this.failVerify = false; }
  async head(key) { return this.objects.has(key) && !(this.failVerify && key.endsWith('.plan.json')) ? { key, size: 1 } : (this.objects.has(key) ? { key, size: 1 } : null); }
  async delete(keys) {
    this.deleteCalls.push(keys);
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
  async list(options = {}) {
    const all = [...this.objects.keys()].filter((key) => key.startsWith(options.prefix ?? '')).sort();
    const start = options.cursor ? Number(options.cursor) : 0;
    const page = all.slice(start, start + this.pageSize).map((key) => ({ key, size: 1 }));
    const next = start + page.length;
    return { objects: page, truncated: next < all.length, ...(next < all.length ? { cursor: String(next) } : {}) };
  }
}

class IncompleteR2 extends R2Fake {
  async list() { return { objects: [], truncated: true }; }
}

class VerificationFailureR2 extends R2Fake {
  async delete(keys) {
    this.deleteCalls.push(keys);
    for (const key of Array.isArray(keys) ? keys : [keys]) if (!key.endsWith('.plan.json')) this.objects.delete(key);
  }
}

function idFor(number) {
  return `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
}

function insertJob(d1, { id, status = 'complete', createdAt = 1, packageStorageKey = importPackageStorageKey(id) }) {
  d1.sqlite.prepare(`INSERT INTO import_jobs (id, package_id, package_sha256, package_storage_key, status, phase, cursor, processed_count, total_count, created_by, created_at, updated_at)
    VALUES (?, 'history-test', ?, ?, ?, 'finalize', 0, 0, 0, 'admin', ?, ?)`)
    .run(id, 'a'.repeat(64), packageStorageKey, status, createdAt, createdAt);
}

function stageJob(bucket, id, mediaCount = 1) {
  bucket.objects.set(importPackageStorageKey(id), new Uint8Array([1]));
  bucket.objects.set(importPlanStorageKey(id), new Uint8Array([2]));
  for (let index = 0; index < mediaCount; index += 1) bucket.objects.set(importMediaStorageKey(id, `asset-${index}`), new Uint8Array([3]));
}

test('strict single removal follows paginated media listing and deletes ZIP/plan/media before D1', async () => {
  const d1 = new D1Fake();
  const bucket = new R2Fake(1);
  const id = idFor(1);
  try {
    insertJob(d1, { id });
    stageJob(bucket, id, 256);
    const result = await removeImportHistory(d1, bucket, id);
    assert.deepEqual(result.removedIds, [id]);
    assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS count FROM import_jobs WHERE id = ?').get(id).count, 0);
    assert.equal(bucket.objects.size, 0);
    assert.equal(bucket.deleteCalls.length, 1);
    assert.equal(bucket.deleteCalls[0].length, 258);
  } finally { d1.close(); }
});

test('canonical mismatch, unavailable listing, incomplete verification, and over-bound media retain the row', async () => {
  const d1 = new D1Fake();
  try {
    const mismatch = idFor(2);
    insertJob(d1, { id: mismatch, packageStorageKey: 'imports/staging/not-canonical.zip' });
    const mismatchResult = await clearImportHistory(d1, new R2Fake());
    assert.equal(mismatchResult.failed[0].code, 'STAGING_KEY_MISMATCH');

    const noList = idFor(3);
    insertJob(d1, { id: noList, createdAt: 2 });
    const noListBucket = { head: async () => null, delete: async () => {} };
    const noListResult = await clearImportHistory(d1, noListBucket);
    assert.ok(noListResult.failed.some((failure) => failure.id === noList && failure.code === 'R2_LIST_UNAVAILABLE'));

    const incomplete = idFor(31);
    insertJob(d1, { id: incomplete, createdAt: 2.5 });
    const incompleteResult = await clearImportHistory(d1, new IncompleteR2());
    assert.ok(incompleteResult.failed.some((failure) => failure.id === incomplete && failure.code === 'R2_LIST_INCOMPLETE'));

    const verify = idFor(32);
    insertJob(d1, { id: verify, createdAt: 2.6 });
    const verifyBucket = new VerificationFailureR2();
    stageJob(verifyBucket, verify);
    const verifyResult = await clearImportHistory(d1, verifyBucket);
    assert.ok(verifyResult.failed.some((failure) => failure.id === verify && failure.code === 'R2_VERIFY_FAILED'));
    assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS count FROM import_jobs WHERE id = ?').get(verify).count, 1);

    const overBound = idFor(4);
    const overBoundD1 = new D1Fake();
    insertJob(overBoundD1, { id: overBound, createdAt: 3 });
    const overBoundBucket = new R2Fake(1000);
    stageJob(overBoundBucket, overBound, 257);
    const overBoundResult = await clearImportHistory(overBoundD1, overBoundBucket);
    assert.ok(overBoundResult.failed.some((failure) => failure.id === overBound && failure.code === 'R2_MEDIA_BOUND_EXCEEDED'));
    assert.equal(overBoundD1.sqlite.prepare('SELECT COUNT(*) AS count FROM import_jobs WHERE id = ?').get(overBound).count, 1);
    assert.equal(overBoundBucket.deleteCalls.length, 0);
    overBoundD1.close();
  } finally { d1.close(); }
});

test('bulk cleanup continues after failures, uses a ten-row traversal cursor, and retries retained rows on a new sweep', async () => {
  const d1 = new D1Fake();
  const bucket = new R2Fake();
  try {
    for (let index = 0; index < 11; index += 1) {
      const id = idFor(20 + index);
      insertJob(d1, { id, createdAt: index + 1, packageStorageKey: index < 10 ? `imports/staging/wrong-${index}.zip` : importPackageStorageKey(id) });
      if (index === 10) stageJob(bucket, id);
    }
    const first = await clearImportHistory(d1, bucket);
    assert.equal(first.failed.length, 10);
    assert.deepEqual(first.removedIds, []);
    assert.ok(first.nextCursor);
    const second = await clearImportHistory(d1, bucket, first.nextCursor);
    assert.deepEqual(second.removedIds, [idFor(30)]);
    assert.equal(second.nextCursor, null);
    assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS count FROM import_jobs').get().count, 10);
    const retry = await clearImportHistory(d1, bucket);
    assert.equal(retry.failed.length, 10);
  } finally { d1.close(); }
});

test('history snapshot is globally eligible and newest-ten presentation backfills after removal without touching teaching media', async () => {
  const d1 = new D1Fake();
  const bucket = new R2Fake();
  const teachingKey = 'teaching-images/retained.png';
  bucket.objects.set(teachingKey, new Uint8Array([9]));
  try {
    for (let index = 0; index < 11; index += 1) {
      const id = idFor(50 + index);
      insertJob(d1, { id, createdAt: index + 1 });
      stageJob(bucket, id);
    }
    const initial = await listImportHistory(d1);
    assert.equal(initial.jobs.length, 10);
    assert.equal(initial.hasEligibleTerminalHistory, true);
    const removed = await removeImportHistory(d1, bucket, idFor(60));
    assert.equal(removed.history.jobs.length, 10);
    assert.ok(removed.history.jobs.some((job) => job.id === idFor(50)));
    assert.equal(bucket.objects.has(teachingKey), true);
    assert.equal(d1.sqlite.prepare("SELECT COUNT(*) AS count FROM import_jobs WHERE status IN ('failed', 'validating')").get().count, 0);
  } finally { d1.close(); }
});

test('failed and active jobs are never history-cleanup candidates', async () => {
  const d1 = new D1Fake();
  const bucket = new R2Fake();
  try {
    insertJob(d1, { id: idFor(70), status: 'failed' });
    insertJob(d1, { id: idFor(71), status: 'validating', createdAt: 2 });
    const snapshot = await clearImportHistory(d1, bucket);
    assert.deepEqual(snapshot.removedIds, []);
    assert.deepEqual(snapshot.failed, []);
    assert.equal(snapshot.history.hasEligibleTerminalHistory, false);
  } finally { d1.close(); }
});
