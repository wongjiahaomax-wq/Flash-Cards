import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LazyZipArchive, loadReviewBundle, writeStoredZip, exportReviewedBundle, finalizeBundle, readZip
} from '../src/core.js';

const preview = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

function fixture() {
  const manifest = {
    version: 1, packageId: 'lazy-test', topics: [], cases: [], assets: [],
    caseAssets: [], questionPrompts: [], caseQuestions: [], topicQuestions: []
  };
  const reviewMap = {
    version: 1, bundleId: 'lazy-bundle', batchName: 'Lazy bundle', sourceFiles: [
      { sourceId: 'source-1', filename: 'deck.pdf', repository: null, path: null, ref: null, pageCount: 1 }
    ], cases: [], sourceCoverage: [
      { sourceId: 'source-1', page: 1, classification: 'teaching/reference material', caseIds: [], notes: null, previewPath: 'source-previews/page-1.jpg' }
    ], unresolvedQuestions: [], batchWarnings: []
  };
  return writeStoredZip([
    { path: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) },
    { path: 'review-map.json', bytes: new TextEncoder().encode(JSON.stringify(reviewMap)) },
    { path: 'source-previews/page-1.jpg', bytes: preview },
    { path: 'source-previews/unrelated.jpg', bytes: preview }
  ]);
}

test('review ZIP indexing keeps binary entries lazy and materializes requested entries on demand', async () => {
  const bundle = await loadReviewBundle(new Blob([fixture()]));
  assert.ok(bundle.files instanceof LazyZipArchive);
  assert.equal(bundle.files.has('source-previews/unrelated.jpg'), true);
  assert.equal(bundle.files.get('source-previews/unrelated.jpg'), undefined);
  assert.deepEqual([...await bundle.files.getFile('source-previews/page-1.jpg')], [...preview]);
  assert.equal(bundle.files.get('source-previews/unrelated.jpg'), undefined);
});

test('binary cache evicts unpinned entries by byte budget and overrides invalidate one path', async () => {
  const bundle = await loadReviewBundle(fixture());
  bundle.files.cacheLimit = 1024;
  await bundle.files.getFile('source-previews/page-1.jpg');
  await bundle.files.getFile('source-previews/unrelated.jpg');
  assert.equal(bundle.files.cacheBytes <= 1024, true);
  bundle.files.set('source-previews/page-1.jpg', new Uint8Array([1, 2, 3]));
  assert.deepEqual([...await bundle.files.getFile('source-previews/page-1.jpg')], [1, 2, 3]);
  assert.equal(bundle.files.overrides.has('source-previews/page-1.jpg'), true);
});

test('reviewed export can materialize a Blob-backed archive only when backup is requested', async () => {
  const bundle = await loadReviewBundle(new Blob([fixture()]));
  const output = await exportReviewedBundle(bundle);
  const roundTrip = await loadReviewBundle(output);
  assert.equal(roundTrip.files.has('source-previews/unrelated.jpg'), true);
  assert.equal(roundTrip.files.get('source-previews/unrelated.jpg'), undefined);
  assert.deepEqual([...await roundTrip.files.getFile('source-previews/unrelated.jpg')], [...preview]);
});

test('Blob-backed backup copies unchanged previews without inflating them into the archive cache', async () => {
  const bundle = await loadReviewBundle(new Blob([fixture()]));
  const reads = [];
  const copies = [];
  const originalGetFile = bundle.files.getFile.bind(bundle.files);
  const originalCopyEntry = bundle.files.copyEntry.bind(bundle.files);
  bundle.files.getFile = async (path, options) => { reads.push(path); return originalGetFile(path, options); };
  bundle.files.copyEntry = async path => { const copy = await originalCopyEntry(path); if (copy) copies.push(copy); return copy; };
  const cachedBefore = bundle.files.materializedBytes;
  const output = await exportReviewedBundle(bundle);
  assert.ok(output instanceof Blob);
  assert.equal(reads.some(path => path.startsWith('source-previews/')), false);
  assert.equal(copies.length, 2);
  assert.equal(copies.every(copy => copy.data instanceof Blob), true);
  assert.equal(copies.reduce((sum, copy) => sum + copy.data.size, 0), preview.byteLength * 2);
  assert.equal(bundle.files.materializedBytes, cachedBefore);
});

test('copying an unchanged stored entry for backup does not turn it into a persisted override', async () => {
  const bundle = await loadReviewBundle(fixture());
  const output = exportReviewedBundle(bundle);
  assert.ok(output instanceof Uint8Array);
  assert.equal(bundle.files.overrides.size, 0);
});

test('indexing rejects out-of-file local offsets before any binary entry is read', async () => {
  const bytes = fixture();
  const signature = [0x50, 0x4b, 0x01, 0x02];
  const central = bytes.findIndex((value, offset) => offset + 46 <= bytes.length && signature.every((part, i) => bytes[offset + i] === part));
  assert.ok(central > 0);
  bytes[central + 42] = 0xff; bytes[central + 43] = 0xff; bytes[central + 44] = 0xff; bytes[central + 45] = 0xff;
  await assert.rejects(() => loadReviewBundle(bytes), /local header range is invalid|Invalid local ZIP header/);
});

test('sequential materialization remains within the configured byte budget', async () => {
  const base = fixture();
  const entries = [];
  for (let i = 0; i < 40; i += 1) entries.push({ path: `source-previews/extra-${i}.jpg`, bytes: preview });
  const original = await loadReviewBundle(base);
  const expanded = writeStoredZip([
    { path: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(original.manifest)) },
    { path: 'review-map.json', bytes: new TextEncoder().encode(JSON.stringify(original.reviewMap)) },
    { path: 'source-previews/page-1.jpg', bytes: preview },
    ...entries
  ]);
  const bundle = await loadReviewBundle(expanded);
  bundle.files.cacheLimit = preview.byteLength * 2;
  for (const entry of entries) await bundle.files.getFile(entry.path);
  assert.ok(bundle.files.materializedBytes <= bundle.files.cacheLimit);
});

test('production finalization does not materialize review-only source previews', async () => {
  const bundle = await loadReviewBundle(fixture());
  const output = await finalizeBundle(bundle);
  const files = await readZip(output.zip);
  assert.deepEqual([...files.keys()], ['manifest.json']);
  assert.equal(bundle.files.get('source-previews/page-1.jpg'), undefined);
});
