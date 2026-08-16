// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  IMPORT_LEASE_MS,
  cancelImportJob
} from '../src/lib/server/import/resumable-content-package.js';

const importJobSql = readFileSync(
  new URL('../drizzle/0004_resumable_import_jobs.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

class D1StatementFake {
  constructor(sqlite, sql) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async first() {
    return this.sqlite.prepare(this.sql).get(...this.params) ?? null;
  }

  async run() {
    const result = this.sqlite.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class D1Fake {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }

  prepare(sql) {
    return new D1StatementFake(this.sqlite, sql);
  }
}

class R2Fake {
  constructor() {
    this.deleted = [];
  }

  async delete(key) {
    this.deleted.push(key);
  }
}

function insertJob(sqlite, overrides = {}) {
  const now = Date.now();
  const job = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    packageId: 'lease-safety-package',
    packageSha256: 'abc123',
    packageStorageKey: 'imports/staging/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.zip',
    status: 'validating',
    phase: 'validate_topics',
    cursor: 0,
    processedCount: 0,
    totalCount: 1,
    createdBy: 'admin-user',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    lastError: null,
    leaseToken: null,
    leaseExpiresAt: null,
    ...overrides
  };

  sqlite.prepare(`INSERT INTO import_jobs (
    id, package_id, package_sha256, package_storage_key, status, phase, cursor,
    processed_count, total_count, created_by, created_at, updated_at,
    completed_at, last_error, lease_token, lease_expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      job.id,
      job.packageId,
      job.packageSha256,
      job.packageStorageKey,
      job.status,
      job.phase,
      job.cursor,
      job.processedCount,
      job.totalCount,
      job.createdBy,
      job.createdAt,
      job.updatedAt,
      job.completedAt,
      job.lastError,
      job.leaseToken,
      job.leaseExpiresAt
    );

  return job;
}

test('resumable import lease provides a five-minute safety window', () => {
  assert.equal(IMPORT_LEASE_MS, 5 * 60_000);
});

test('cancellation refuses an expired lease token because the old request may still be executing', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(importJobSql);
  const d1 = new D1Fake(sqlite);
  const bucket = new R2Fake();
  const job = insertJob(sqlite, {
    leaseToken: 'still-running-request',
    leaseExpiresAt: Date.now() - 60_000
  });

  try {
    await assert.rejects(
      () => cancelImportJob(d1, bucket, job.id),
      /currently processing or has a stale lease/i
    );

    const blocked = sqlite.prepare('SELECT status, lease_token FROM import_jobs WHERE id = ?').get(job.id);
    assert.equal(blocked.status, 'validating');
    assert.equal(blocked.lease_token, 'still-running-request');
    assert.deepEqual(bucket.deleted, []);

    sqlite.prepare('UPDATE import_jobs SET lease_token = NULL, lease_expires_at = NULL WHERE id = ?').run(job.id);
    const cancelled = await cancelImportJob(d1, bucket, job.id);
    assert.equal(cancelled.status, 'cancelled');
    assert.deepEqual(bucket.deleted, [job.packageStorageKey]);
  } finally {
    sqlite.close();
  }
});
