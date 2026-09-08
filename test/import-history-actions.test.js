// Executable coverage for the Admin import-history route actions.
// @ts-nocheck

import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

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

import {
  importMediaStorageKey,
  importPackageStorageKey,
  importPlanStorageKey
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
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    applyCurrentSchema(this.sqlite);
  }
  prepare(sql) { return new D1Statement(this, sql); }
  close() { this.sqlite.close(); }
}

class R2Fake {
  constructor() { this.objects = new Map(); }
  async head(key) { return this.objects.has(key) ? { key, size: 1 } : null; }
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
  async list(options = {}) {
    const all = [...this.objects.keys()].filter((key) => key.startsWith(options.prefix ?? '')).sort();
    const start = options.cursor ? Number(options.cursor) : 0;
    const page = all.slice(start, start + (options.limit ?? 1000)).map((key) => ({ key, size: 1 }));
    const next = start + page.length;
    return { objects: page, truncated: next < all.length, ...(next < all.length ? { cursor: String(next) } : {}) };
  }
}

function idFor(number) {
  return `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
}

function insertJob(d1, { id, packageStorageKey = importPackageStorageKey(id) }) {
  d1.sqlite.prepare(`INSERT INTO import_jobs (id, package_id, package_sha256, package_storage_key, status, phase, cursor, processed_count, total_count, created_by, created_at, updated_at)
    VALUES (?, 'route-action-test', ?, ?, 'complete', 'finalize', 0, 0, 0, 'admin', 1, 1)`)
    .run(id, 'a'.repeat(64), packageStorageKey);
}

function stageJob(bucket, id) {
  bucket.objects.set(importPackageStorageKey(id), new Uint8Array([1]));
  bucket.objects.set(importPlanStorageKey(id), new Uint8Array([2]));
  bucket.objects.set(importMediaStorageKey(id, 'asset-1'), new Uint8Array([3]));
}

function formData(entries = []) {
  const data = new FormData();
  for (const [key, value] of entries) data.set(key, value);
  return data;
}

function actionEvent(action, { d1, bucket, user = { role: 'admin' }, data = new FormData(), env } = {}) {
  return {
    request: new Request(`http://localhost/admin/import?/${action}`, { method: 'POST', body: data }),
    locals: { user },
    platform: { env: env ?? { DB: d1, MEDIA: bucket } }
  };
}

const { actions } = await import('../src/routes/admin/import/+page.server.js');

test('history route actions enforce Admin, binding, ID, and confirmation guards', async () => {
  const d1 = new D1Fake();
  const bucket = new R2Fake();
  try {
    for (const action of ['removeHistory', 'clearHistory']) {
      const unauthorized = await actions[action](actionEvent(action, { d1, bucket, user: { role: 'learner' } }));
      assert.equal(unauthorized.status, 403);

      for (const env of [{}, { MEDIA: bucket }, { DB: d1 }]) {
        const unavailable = await actions[action](actionEvent(action, { user: { role: 'admin' }, env }));
        assert.equal(unavailable.status, 503);
      }
    }

    const missingId = await actions.removeHistory(actionEvent('removeHistory', { d1, bucket }));
    assert.equal(missingId.status, 400);
    assert.match(missingId.data.error, /record ID is required/i);

    const missingConfirmation = await actions.clearHistory(actionEvent('clearHistory', { d1, bucket }));
    assert.equal(missingConfirmation.status, 400);
    assert.match(missingConfirmation.data.error, /confirmation is required/i);
  } finally {
    d1.close();
  }
});

test('removeHistory and clearHistory wire successful and failing cleanup results', async () => {
  const d1 = new D1Fake();
  const bucket = new R2Fake();
  try {
    const removableId = idFor(1);
    insertJob(d1, { id: removableId });
    stageJob(bucket, removableId);
    const removed = await actions.removeHistory(actionEvent('removeHistory', {
      d1,
      bucket,
      data: formData([['jobId', removableId]])
    }));
    assert.deepEqual(removed.removedIds, [removableId]);
    assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS count FROM import_jobs WHERE id = ?').get(removableId).count, 0);
    assert.equal(bucket.objects.size, 0);

    const retainedId = idFor(2);
    insertJob(d1, { id: retainedId, packageStorageKey: 'imports/staging/not-canonical.zip' });
    const failedRemove = await actions.removeHistory(actionEvent('removeHistory', {
      d1,
      bucket,
      data: formData([['jobId', retainedId]])
    }));
    assert.equal(failedRemove.status, 409);
    assert.match(failedRemove.data.error, /canonical staging key/i);
    assert.equal(d1.sqlite.prepare('SELECT COUNT(*) AS count FROM import_jobs WHERE id = ?').get(retainedId).count, 1);
  } finally {
    d1.close();
  }

  const clearD1 = new D1Fake();
  const clearBucket = new R2Fake();
  try {
    const clearId = idFor(3);
    insertJob(clearD1, { id: clearId });
    stageJob(clearBucket, clearId);
    const cleared = await actions.clearHistory(actionEvent('clearHistory', {
      d1: clearD1,
      bucket: clearBucket,
      data: formData([['confirm', 'on']])
    }));
    assert.deepEqual(cleared.removedIds, [clearId]);
    assert.equal(clearD1.sqlite.prepare('SELECT COUNT(*) AS count FROM import_jobs WHERE id = ?').get(clearId).count, 0);
    assert.equal(clearBucket.objects.size, 0);

    const failedClear = await actions.clearHistory(actionEvent('clearHistory', {
      d1: clearD1,
      bucket: clearBucket,
      data: formData([['confirm', 'on'], ['cursor', 'invalid-cursor']])
    }));
    assert.equal(failedClear.status, 409);
    assert.match(failedClear.data.error, /traversal cursor is invalid/i);
  } finally {
    clearD1.close();
  }
});
