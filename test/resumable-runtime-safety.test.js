import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  deleteStagedImportPackage,
  importMediaStorageKey,
  importPackageStorageKey,
  importPlanStorageKey,
  readStagedImportMedia,
  readStagedImportPlan,
  stageImportPackage
} from '../src/lib/server/storage/import-packages.js';

const runtimeSource = readFileSync(
  new URL('../src/lib/server/import/resumable-content-package-runtime.js', import.meta.url),
  'utf8'
);
const routeSource = readFileSync(
  new URL('../src/routes/admin/import/+page.server.js', import.meta.url),
  'utf8'
);

class R2Fake {
  constructor() {
    this.objects = new Map();
  }

  async head(key) {
    const value = this.objects.get(key);
    return value ? { key, size: value.bytes.byteLength } : null;
  }

  async list(options = {}) {
    const prefix = options.prefix ?? '';
    return {
      objects: [...this.objects]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, size: value.bytes.byteLength })),
      truncated: false
    };
  }

  async put(key, body, options = {}) {
    const condition = options.onlyIf instanceof Headers
      ? options.onlyIf.get('if-none-match')
      : null;
    if (condition === '*' && this.objects.has(key)) return null;

    const bytes = body instanceof Uint8Array
      ? body.slice()
      : new Uint8Array(await body.arrayBuffer());
    this.objects.set(key, { bytes });
    return { key, size: bytes.byteLength };
  }

  async get(key) {
    const value = this.objects.get(key);
    if (!value) return null;
    return {
      key,
      size: value.bytes.byteLength,
      arrayBuffer: async () => value.bytes.slice().buffer
    };
  }

  async delete(key) {
    this.objects.delete(key);
  }
}

test('resumable Admin route uses the lightweight execution runtime', () => {
  assert.match(routeSource, /resumable-content-package-runtime\.js/);
});

test('process-next uses the staged execution snapshot instead of re-reading the complete ZIP', () => {
  const start = runtimeSource.indexOf('export async function processNextImportChunk');
  assert.ok(start >= 0);
  const processSource = runtimeSource.slice(start);

  assert.match(processSource, /planFromExecutionSnapshot/);
  assert.doesNotMatch(processSource, /readStagedImportPackage/);
  assert.doesNotMatch(processSource, /importPackageDigest/);
  assert.doesNotMatch(processSource, /parseImportPackage\(/);
});

test('write processing renews the exact lease after staging reads and before domain side effects', () => {
  const writePhase = runtimeSource.indexOf('if (WRITE_PHASES.includes(job.phase))');
  assert.ok(writePhase >= 0);
  const hydrate = runtimeSource.indexOf('await hydrateMediaForChunk', writePhase);
  const renew = runtimeSource.indexOf('await renewJobLease', hydrate);
  const apply = runtimeSource.indexOf('await applyImportChunk', renew);

  assert.ok(hydrate > writePhase, 'current Asset media should be read before the final lease fence');
  assert.ok(renew > hydrate, 'lease should be renewed after staging reads');
  assert.ok(apply > renew, 'domain side effects must start only after the lease fence succeeds');
});

test('server-derived staging snapshot stores exact ZIP, normalized plan, and only required media', async () => {
  const bucket = new R2Fake();
  const jobId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const packageBytes = new Uint8Array([1, 2, 3, 4]);
  const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const manifest = {
    version: 1,
    packageId: 'snapshot-test',
    topics: [],
    cases: [],
    assets: [
      {
        id: 'asset-one',
        operation: 'create',
        applicationId: null,
        path: 'media/one.png',
        mimeType: 'image/png',
        originalFilename: 'one.png',
        altText: 'Reviewed image',
        sourceLabel: null,
        sourceUrl: null,
        licence: null,
        isActive: true
      }
    ],
    caseAssets: [],
    questionPrompts: [],
    caseQuestions: [],
    topicQuestions: []
  };

  const staged = await stageImportPackage(bucket, jobId, packageBytes, {
    packageSha256: 'a'.repeat(64),
    manifest,
    media: new Map([['media/one.png', { bytes: imageBytes }]])
  });

  assert.equal(staged.stagedObjectCount, 3);
  assert.ok(bucket.objects.has(importPackageStorageKey(jobId)));
  assert.ok(bucket.objects.has(importPlanStorageKey(jobId)));
  assert.ok(bucket.objects.has(importMediaStorageKey(jobId, 'asset-one')));

  const plan = await readStagedImportPlan(bucket, jobId);
  assert.equal(plan.packageSha256, 'a'.repeat(64));
  assert.equal(plan.manifest.packageId, 'snapshot-test');

  const media = await readStagedImportMedia(bucket, jobId, 'asset-one');
  assert.deepEqual([...media], [...imageBytes]);

  await deleteStagedImportPackage(bucket, jobId);
  assert.equal(bucket.objects.size, 0);
});
