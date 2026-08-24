// Import boundary regression coverage for the primary-Topic-only Case model.
// @ts-nocheck

import assert from 'node:assert/strict';
import test from 'node:test';

import { ContentPackageError, parseImportPackage } from '../src/lib/server/import/reviewed-content-package.js';
import {
  importPlanStorageKey,
  readStagedImportPlan,
  stageImportPackage
} from '../src/lib/server/storage/import-packages.js';

const JOB_ID = '11111111-1111-4111-8111-111111111111';

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
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, body.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    localChunks.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, body.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centralChunks.push(central);
    offset += local.length;
  }

  const centralBytes = concat(centralChunks);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralBytes.length, true);
  ev.setUint32(16, offset, true);
  return concat([...localChunks, centralBytes, end]);
}

function manifest(secondaryTopicIds = []) {
  return {
    version: 1,
    packageId: 'primary-only-import',
    topics: [
      { id: 'primary-topic', operation: 'create', name: 'Primary Topic', slug: 'primary-topic' },
      { id: 'legacy-secondary', operation: 'create', name: 'Legacy Secondary', slug: 'legacy-secondary' }
    ],
    cases: [
      {
        id: 'case-one',
        operation: 'create',
        title: 'Case one',
        primaryTopicId: 'primary-topic',
        secondaryTopicIds
      }
    ],
    assets: [],
    caseAssets: [],
    questionPrompts: [],
    caseQuestions: [],
    topicQuestions: []
  };
}

function archive(payload) {
  return zip([{ path: 'manifest.json', body: JSON.stringify(payload) }]);
}

class BucketFake {
  constructor() { this.objects = new Map(); }
  async head(key) {
    const bytes = this.objects.get(key);
    return bytes ? { key, size: bytes.byteLength } : null;
  }
  async put(key, body) {
    if (this.objects.has(key)) return null;
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
  async list({ prefix = '' } = {}) {
    return {
      objects: [...this.objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, bytes]) => ({ key, size: bytes.byteLength })),
      truncated: false
    };
  }
}

test('reviewed Import Package v1 keeps an empty secondaryTopicIds compatibility field', async () => {
  const parsed = await parseImportPackage(archive(manifest([])));
  assert.deepEqual(parsed.manifest.cases[0].secondaryTopicIds, []);
});

test('reviewed Import Package v1 rejects non-empty Additional Study Topics before planning or writes', async () => {
  await assert.rejects(
    () => parseImportPackage(archive(manifest(['legacy-secondary']))),
    (error) =>
      error instanceof ContentPackageError &&
      /Additional Study Topics are no longer supported/i.test(error.message) &&
      error.issues.some((issue) => /secondaryTopicIds to be empty/i.test(issue))
  );
});

test('resumable staging refuses a snapshot that could recreate a secondary Topic relationship', async () => {
  const bucket = new BucketFake();
  await assert.rejects(
    () => stageImportPackage(bucket, JOB_ID, new Uint8Array([1, 2, 3]), {
      packageSha256: 'a'.repeat(64),
      manifest: manifest(['legacy-secondary']),
      media: new Map()
    }),
    /secondaryTopicIds to be empty/i
  );
  assert.equal(bucket.objects.size, 0);
});

test('resumable processing refuses a previously staged legacy execution snapshot', async () => {
  const bucket = new BucketFake();
  const bytes = new TextEncoder().encode(JSON.stringify({
    version: 1,
    packageSha256: 'b'.repeat(64),
    manifest: manifest(['legacy-secondary'])
  }));
  bucket.objects.set(importPlanStorageKey(JOB_ID), bytes);

  await assert.rejects(
    () => readStagedImportPlan(bucket, JOB_ID),
    /secondaryTopicIds to be empty/i
  );
});