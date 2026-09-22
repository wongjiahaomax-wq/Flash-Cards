// @ts-nocheck

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  importMediaStorageKey,
  importPackageStorageKey,
  importPlanStorageKey,
  stageImportPackage
} from '../src/lib/server/storage/import-packages.js';

const JOB_ID = '22222222-2222-4222-8222-222222222222';

class ControlledBucket {
  constructor({ failingKey = null, cleanupFailureKey = null } = {}) {
    this.objects = new Map();
    this.failingKey = failingKey;
    this.cleanupFailureKey = cleanupFailureKey;
    this.activeMediaPuts = 0;
    this.maxMediaPuts = 0;
    this.startedMediaPuts = [];
    this.settledMediaPuts = [];
    this.cleanupStarted = false;
    this.cleanupObservedActivePuts = [];
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
    const bytes = body instanceof Uint8Array ? body.slice() : new Uint8Array(await body.arrayBuffer());
    const isMedia = key.includes('/media/');
    if (isMedia) {
      this.startedMediaPuts.push(key);
      this.activeMediaPuts += 1;
      this.maxMediaPuts = Math.max(this.maxMediaPuts, this.activeMediaPuts);
      await new Promise((resolve) => setTimeout(resolve, key === this.failingKey ? 2 : 10));
      this.activeMediaPuts -= 1;
      this.settledMediaPuts.push(key);
      if (key === this.failingKey) throw new Error('injected media failure');
    }
    this.objects.set(key, bytes);
    return { key, size: bytes.byteLength };
  }

  async delete(key) {
    this.cleanupStarted = true;
    this.cleanupObservedActivePuts.push(this.activeMediaPuts);
    if (key === this.cleanupFailureKey) throw new Error('injected cleanup failure');
    this.objects.delete(key);
  }
}

function snapshot(assetCount) {
  const media = new Map();
  const assets = [];
  for (let index = 0; index < assetCount; index += 1) {
    const path = `media/asset-${index}.png`;
    assets.push({ id: `asset-${index}`, operation: 'create', path, mimeType: 'image/png' });
    media.set(path, { bytes: new Uint8Array([index + 1, index + 2, index + 3]) });
  }
  return {
    packageSha256: 'b'.repeat(64),
    manifest: {
      version: 1,
      packageId: 'parallel-staging-test',
      topics: [],
      cases: [],
      assets,
      caseAssets: [],
      questionPrompts: [],
      caseQuestions: [],
      topicQuestions: []
    },
    media
  };
}

test('derived media staging uses at most four uploads and preserves ZIP/plan/key contracts', async () => {
  const bucket = new ControlledBucket();
  const staged = await stageImportPackage(bucket, JOB_ID, new Uint8Array([9, 8, 7]), snapshot(6));

  assert.equal(staged.stagedObjectCount, 8);
  assert.ok(bucket.maxMediaPuts <= 4, `media PUT concurrency exceeded four: ${bucket.maxMediaPuts}`);
  assert.ok(bucket.maxMediaPuts > 1, 'independent media PUTs should overlap');
  assert.ok(bucket.objects.has(importPackageStorageKey(JOB_ID)));
  assert.ok(bucket.objects.has(importPlanStorageKey(JOB_ID)));
  for (let index = 0; index < 6; index += 1) {
    assert.ok(bucket.objects.has(importMediaStorageKey(JOB_ID, `asset-${index}`)));
  }
});

test('failed media staging settles every started PUT before best-effort compensation', async () => {
  const failedKey = importMediaStorageKey(JOB_ID, 'asset-2');
  const bucket = new ControlledBucket({ failingKey: failedKey, cleanupFailureKey: importPackageStorageKey(JOB_ID) });

  await assert.rejects(
    () => stageImportPackage(bucket, JOB_ID, new Uint8Array([1, 2, 3]), snapshot(8)),
    /injected media failure/
  );

  assert.ok(bucket.startedMediaPuts.length <= 4, 'failure must stop scheduling new media uploads');
  assert.deepEqual(
    new Set(bucket.settledMediaPuts),
    new Set(bucket.startedMediaPuts),
    'cleanup must wait for every started media PUT to settle'
  );
  assert.ok(bucket.cleanupStarted, 'failed staging must attempt compensation');
  assert.ok(bucket.cleanupObservedActivePuts.every((count) => count === 0), 'compensation must not race an in-flight PUT');
  assert.ok(bucket.objects.has(importPackageStorageKey(JOB_ID)), 'a failed cleanup may retain private staging debris');
});
