import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createOperationGuard } from '../src/operation-guard.js';
import * as cropGeometry from '../src/crop.js';

function makeElement(overrides = {}) {
  const listeners = new Map();
  return {
    disabled: false, hidden: false, value: 'all', textContent: '', innerHTML: '', dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, scrollIntoView() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(type, listener) { listeners.set(type, listener); }, listener(type) { return listeners.get(type); },
    click() { return this.onclick?.(); }, ...overrides
  };
}

function pngBytes(...tail) { return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...tail]); }
function jpegBytes(...tail) { return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...tail, 0xff, 0xd9]); }

function makeBundle({ sourceRefs = [{ sourceId: 'source-1', pages: [1] }], sourceCoverage = [{ sourceId: 'source-1', page: 1, previewPath: 'source-previews/source-1.png' }], cases = 1, shared = false } = {}) {
  const files = new Map([['media/learner.png', pngBytes(1, 2, 3)], ...sourceCoverage.filter(item => item.previewPath).map(item => [item.previewPath, pngBytes(9, item.page)])]);
  files.overrides = new Map(); const mapSet = files.set.bind(files); files.set = (path, bytes) => { mapSet(path, bytes); files.overrides.set(path, bytes); return files; }; files.getFile = async path => files.get(path);
  const caseRows = Array.from({ length: cases }, (_, i) => ({ id: `case-${i + 1}`, title: `Case ${i + 1}`, vignetteMd: 'Vignette', primaryTopicId: 'topic-1', secondaryTopicIds: [] }));
  return {
    files,
    manifest: { version: 1, packageId: 'crop-browser-test', topics: [{ id: 'topic-1' }], cases: caseRows,
      assets: [{ id: 'asset-1', path: 'media/learner.png', mimeType: 'image/png', originalFilename: 'learner.png', altText: 'Learner image', sourceLabel: 'Stable label', sourceUrl: null, licence: null }],
      caseAssets: [{ id: 'case-asset-1', caseId: 'case-1', assetId: 'asset-1', captionMd: 'Caption', displayOrder: 0 }, ...(shared ? [{ id: 'case-asset-2', caseId: 'case-2', assetId: 'asset-1', captionMd: 'Other caption', displayOrder: 0 }] : [])], questionPrompts: [], caseQuestions: [], topicQuestions: [] },
    reviewMap: { version: 1, bundleId: 'crop-browser-bundle', batchName: 'Crop browser test',
      sourceFiles: sourceCoverage.map(item => ({ sourceId: item.sourceId, filename: `${item.sourceId}.png`, repository: null, path: null, ref: null, pageCount: Math.max(1, item.page) })), sourceCoverage, unresolvedQuestions: [], batchWarnings: [],
      cases: caseRows.map(item => ({ caseId: item.id, reviewStatus: item.id === 'case-1' ? 'needs_review' : 'pending', confidence: 'high', warnings: [], sourceRefs, caseBoundaryNotes: null,
        assets: item.id === 'case-1' || (shared && item.id === 'case-2') ? [{ assetId: 'asset-1', reviewStatus: item.id === 'case-2' ? 'rejected' : 'approved', confidence: 'high', warnings: [{ code: 'keep', severity: 'warning', message: 'Keep this warning.' }], sourceRefs, extractionMethod: 'embedded_original', sha256: 'old-sha', reviewNotes: ['Keep this note.'] }] : [], questions: [], reviewNotes: [] })) }
  };
}

function loadHarness() {
  let source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  source = source.replace(/import\s+\{[\s\S]*?\}\s+from\s+'\.\/[^']+';\r?\n/g, '').replace(/import\s+\*\s+as\s+cropGeometry\s+from\s+'\.\/crop\.js';\r?\n/g, '');
  source += `
globalThis.__cropTest = {
  setBundle(nextBundle) { bundle = nextBundle; bundleFingerprint = 'test-fingerprint'; loadGeneration = 1; saveGeneration = 1; rebuildIndexes(); visibleCases = bundle.reviewMap.cases; index = 0; selectedSourcePath = null; cropSession = null; },
  setSelectedSourcePath(path) { selectedSourcePath = path; }, setCrop(value) { cropSession.crop = value; }, setPersist(fn) { persist = fn; }, setRender(fn) { renderCurrent = fn; }, setGeneration(value) { loadGeneration = value; },
  enterCrop, cancelCrop, saveCrop, wireCurrent, wireCropEditor, assetCard, snapshot, restoreSaved, cropSession() { return cropSession; }, guard() { return operationGuard; },
  current() { return { bundle, index, visibleCases, dirty, cropSession }; }, loadFile
};`;
  const elements = new Map(), selectorResults = new Map();
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, makeElement()); return elements.get(id); },
    querySelectorAll(selector) { return selectorResults.get(selector) ?? []; },
    addEventListener(type, listener) { this.listeners.set(type, listener); }, listeners: new Map(),
    dispatch(type, event) { return this.listeners.get(type)?.(event); },
    createElement(type) { if (type !== 'canvas') return makeElement(); return { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob(callback, mimeType, quality) { this.mimeType = mimeType; this.quality = quality; callback(new Blob([pngBytes(4, 5, 6)], { type: mimeType })); } }; }
  };
  const window = { listeners: new Map(), addEventListener(type, listener) { this.listeners.set(type, listener); }, confirm: () => false };
  let objectUrl = 0;
  const URLApi = { createObjectURL() { objectUrl += 1; return `blob:crop-${objectUrl}`; }, revokeObjectURL() {} };
  class FakeImage { naturalWidth = 100; naturalHeight = 50; set src(value) { this._src = value; Promise.resolve().then(() => this.onload?.()); } }
  const context = { console, document, window, setTimeout, clearTimeout, Map, Set, Date, Promise, Uint8Array, structuredClone, Blob, URL: URLApi, Image: FakeImage, ...cropGeometry,
    ReviewBundleError: class ReviewBundleError extends Error { constructor(message, issues = []) { super(message); this.issues = issues.length ? issues : [message]; } },
    loadReviewBundle: async () => null, exportReviewedBundle: () => new Uint8Array(), finalizeBundle: async () => ({ zip: new Uint8Array() }), resolveUnresolvedQuestion() {}, rejectUnresolvedQuestion() {},
    detectImageType(bytes) { return bytes?.[0] === 0x89 ? 'image/png' : null; }, sha256Hex: async () => 'new-sha', PRODUCTION_LIMITS: { maxImageBytes: 10_000_000 }, persistedStateMatches: () => true,
    createAutosaveCoordinator: () => ({ flush: async () => true, active: null }), trimResourceUrlCache() {}, hasActiveMissingAnswer: () => false, createOperationGuard };
  vm.runInNewContext(source, context, { filename: 'slide-review-crop-app.js' });
  return { context, harness: context.__cropTest, selectorResults, elements, document };
}

test('crop source eligibility never falls back to an unrelated Case source', async () => {
  const { harness } = loadHarness();
  const bundle = makeBundle({ sourceRefs: [{ sourceId: 'source-1', pages: [1] }], sourceCoverage: [{ sourceId: 'source-1', page: 1, previewPath: 'source-previews/linked.png' }, { sourceId: 'source-2', page: 9, previewPath: 'source-previews/unrelated.png' }] });
  harness.setBundle(bundle); harness.setSelectedSourcePath('source-previews/unrelated.png');
  assert.equal(await harness.enterCrop('asset-1'), true); assert.equal(harness.cropSession().sourcePath, 'source-previews/linked.png');
  const multiple = makeBundle({ sourceRefs: [{ sourceId: 'source-1', pages: [1] }, { sourceId: 'source-2', pages: [9] }], sourceCoverage: [{ sourceId: 'source-1', page: 1, previewPath: 'source-previews/linked.png' }, { sourceId: 'source-2', page: 9, previewPath: 'source-previews/other.png' }] });
  harness.setBundle(multiple); harness.setSelectedSourcePath('source-previews/unrelated.png');
  assert.match(harness.assetCard(multiple.manifest.caseAssets[0], multiple.reviewMap.cases[0].assets[0], new Map([['media/learner.png', 'learner-url']])), /class="[^"]*adjust-crop"[^>]+disabled/);
  harness.setSelectedSourcePath('source-previews/other.png'); assert.equal(await harness.enterCrop('asset-1'), true); assert.equal(harness.cropSession().sourcePath, 'source-previews/other.png');
});

test('Adjust crop and Cancel are inline transitions and Cancel does not mutate or persist', async () => {
  const { harness, selectorResults } = loadHarness(), bundle = makeBundle(); harness.setBundle(bundle); let persists = 0, renders = 0;
  harness.setPersist(async () => { persists += 1; }); harness.setRender(async () => { renders += 1; });
  const adjust = makeElement({ dataset: { asset: 'asset-1' } }), cancel = makeElement({ dataset: { cropCancel: 'asset-1' } });
  selectorResults.set('.adjust-crop', [adjust]); selectorResults.set('[data-crop-cancel]', []); selectorResults.set('[data-crop-editor]', []); selectorResults.set('[data-asset]', []);
  harness.wireCurrent(bundle.reviewMap.cases[0]); await adjust.listener('click')(); assert.deepEqual(harness.cropSession().crop, { x: 0, y: 0, width: 1, height: 1 });
  selectorResults.set('.adjust-crop', []); selectorResults.set('[data-crop-cancel]', [cancel]); harness.wireCurrent(bundle.reviewMap.cases[0]);
  const before = structuredClone({ bytes: [...bundle.files.get('media/learner.png')], review: bundle.reviewMap.cases[0].assets[0] }); await cancel.listener('click')();
  assert.equal(harness.cropSession(), null); assert.deepEqual([...bundle.files.get('media/learner.png')], before.bytes); assert.deepEqual(bundle.reviewMap.cases[0].assets[0], before.review); assert.equal(persists, 0); assert.ok(renders >= 2);
});

test('pointer crop wiring captures one pointer, ignores secondary pointers, and cleans up on cancel/lost capture', async () => {
  const { harness, selectorResults } = loadHarness(), bundle = makeBundle(); harness.setBundle(bundle); harness.setSelectedSourcePath('source-previews/source-1.png'); await harness.enterCrop('asset-1'); harness.setCrop({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 });
  const frame = makeElement({ dataset: {}, style: {} }); let captured = null;
  const surface = makeElement({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 100 }), setPointerCapture(id) { captured = id; }, hasPointerCapture: id => captured === id, releasePointerCapture(id) { if (captured === id) captured = null; } });
  const editor = makeElement({ dataset: { cropEditor: 'asset-1' }, querySelector(selector) { return selector === '[data-crop-surface]' ? surface : selector === '.crop-frame' ? frame : null; } }); selectorResults.set('[data-crop-editor]', [editor]); harness.wireCropEditor('asset-1');
  const target = { closest: () => ({ dataset: { cropMode: 'move' } }) }, down = surface.listener('pointerdown'), move = surface.listener('pointermove'), up = surface.listener('pointerup'), cancel = surface.listener('pointercancel'), lost = surface.listener('lostpointercapture');
  down({ pointerId: 7, isPrimary: true, clientX: 20, clientY: 20, target, preventDefault() {} }); down({ pointerId: 8, isPrimary: true, clientX: 20, clientY: 20, target, preventDefault() {} }); assert.equal(captured, 7);
  const initial = harness.cropSession().crop; move({ pointerId: 8, clientX: 180, clientY: 80, target, preventDefault() {} }); assert.deepEqual(harness.cropSession().crop, initial); move({ pointerId: 7, clientX: 80, clientY: 50, target, preventDefault() {} }); assert.notDeepEqual(harness.cropSession().crop, initial);
  up({ pointerId: 8 }); assert.equal(captured, 7); cancel({ pointerId: 7 }); assert.equal(captured, null); down({ pointerId: 9, isPrimary: true, clientX: 20, clientY: 20, target, preventDefault() {} }); lost({ pointerId: 9 }); assert.equal(captured, null);
});

test('deferred crop Save owns the guard before SHA, blocks protected work, then commits the exact Asset path', async () => {
  const { harness, context, elements } = loadHarness(), bundle = makeBundle(); harness.setBundle(bundle); harness.setSelectedSourcePath('source-previews/source-1.png'); await harness.enterCrop('asset-1'); let resolveSha, persistCalls = 0, finalizeCalls = 0, backupCalls = 0, opened = 0;
  context.sha256Hex = () => new Promise(resolve => { resolveSha = resolve; }); context.finalizeBundle = async () => { finalizeCalls += 1; return { zip: new Uint8Array() }; }; context.exportReviewedBundle = () => { backupCalls += 1; return new Uint8Array(); }; context.loadReviewBundle = async () => { opened += 1; return null; }; harness.setPersist(async () => { persistCalls += 1; });
  const pending = harness.saveCrop('asset-1'); for (let i = 0; i < 12 && !resolveSha; i += 1) { await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); } assert.equal(typeof resolveSha, 'function'); assert.equal(harness.guard().active.kind, 'crop-save'); assert.deepEqual([...bundle.files.get('media/learner.png')], [...pngBytes(1, 2, 3)]); assert.equal(await harness.saveCrop('asset-1'), false); elements.get('finalize').click(); elements.get('export-reviewed').click(); await harness.loadFile('later-bundle'); await Promise.resolve(); assert.equal(finalizeCalls, 0); assert.equal(backupCalls, 0); assert.equal(opened, 0);
  const unload = { preventDefault() {} }; context.window.listeners.get('beforeunload')(unload); assert.equal(unload.returnValue, ''); resolveSha('new-sha'); assert.equal(await pending, true); assert.equal(harness.guard().active, null); assert.equal(persistCalls, 1); assert.equal(bundle.reviewMap.cases[0].assets[0].extractionMethod, 'human_crop'); assert.equal(bundle.reviewMap.cases[0].assets[0].reviewStatus, 'needs_review'); assert.deepEqual(bundle.files.get('media/learner.png'), pngBytes(4, 5, 6));
  let seenBytes; context.exportReviewedBundle = () => { seenBytes = [...bundle.files.get('media/learner.png')]; return new Uint8Array(); }; await elements.get('export-reviewed').click(); assert.deepEqual(seenBytes, [...pngBytes(4, 5, 6)]);
});

test('SHA failure is atomic and exact-token cleanup allows a subsequent crop Save', async () => {
  const { harness, context, elements } = loadHarness(), bundle = makeBundle(); harness.setBundle(bundle); harness.setSelectedSourcePath('source-previews/source-1.png'); await harness.enterCrop('asset-1'); const reviewBefore = structuredClone(bundle.reviewMap.cases[0].assets[0]);
  context.sha256Hex = async () => { throw new Error('forced SHA failure'); }; harness.setPersist(async () => {}); assert.equal(await harness.saveCrop('asset-1'), false); assert.equal(harness.guard().active, null); assert.deepEqual([...bundle.files.get('media/learner.png')], [...pngBytes(1, 2, 3)]); assert.deepEqual(bundle.reviewMap.cases[0].assets[0], reviewBefore);
  const unload = { preventDefault() {} }; context.window.listeners.get('beforeunload')(unload); assert.equal(unload.returnValue, undefined); context.sha256Hex = async () => 'new-sha'; assert.equal(await harness.saveCrop('asset-1'), true); assert.equal(harness.guard().active, null); assert.equal(elements.get('zip-input').disabled, false);
});

test('crop raster, MIME, and size failures leave the learner Asset untouched', async () => {
  for (const failure of ['decode', 'mime', 'size']) {
    const { harness, context } = loadHarness(), bundle = makeBundle(); harness.setBundle(bundle); harness.setSelectedSourcePath('source-previews/source-1.png'); await harness.enterCrop('asset-1');
    const before = [...bundle.files.get('media/learner.png')], reviewBefore = structuredClone(bundle.reviewMap.cases[0].assets[0]);
    if (failure === 'decode') context.Image = class { set src(value) { Promise.resolve().then(() => this.onerror?.()); } };
    if (failure === 'mime') { let calls = 0; context.detectImageType = () => ++calls === 1 ? 'image/png' : 'image/jpeg'; }
    if (failure === 'size') context.PRODUCTION_LIMITS.maxImageBytes = 2;
    assert.equal(await harness.saveCrop('asset-1'), false); assert.deepEqual([...bundle.files.get('media/learner.png')], before); assert.deepEqual(bundle.reviewMap.cases[0].assets[0], reviewBefore); assert.equal(harness.guard().active, null);
  }
});

test('successful crop preserves stable metadata, rejected linked reviews, and exact-fingerprint media override restore', async () => {
  const { harness, context } = loadHarness(), bundle = makeBundle({ cases: 2, shared: true }); harness.setBundle(bundle); harness.setSelectedSourcePath('source-previews/source-1.png'); await harness.enterCrop('asset-1'); harness.setPersist(async () => {});
  assert.equal(await harness.saveCrop('asset-1'), true);
  const asset = bundle.manifest.assets[0], approved = bundle.reviewMap.cases[0].assets[0], rejected = bundle.reviewMap.cases[1].assets[0];
  assert.equal(asset.path, 'media/learner.png'); assert.equal(asset.mimeType, 'image/png'); assert.equal(asset.originalFilename, 'learner.png'); assert.equal(asset.altText, 'Learner image'); assert.equal(asset.sourceLabel, 'Stable label');
  assert.equal(bundle.manifest.caseAssets[0].captionMd, 'Caption'); assert.equal(approved.reviewStatus, 'needs_review'); assert.equal(approved.extractionMethod, 'human_crop'); assert.equal(approved.sha256, 'new-sha'); assert.equal(rejected.reviewStatus, 'rejected'); assert.equal(rejected.extractionMethod, 'human_crop'); assert.equal(rejected.sha256, 'new-sha'); assert.deepEqual(approved.warnings, [{ code: 'keep', severity: 'warning', message: 'Keep this warning.' }]); assert.deepEqual(approved.sourceRefs, [{ sourceId: 'source-1', pages: [1] }]); assert.deepEqual(approved.reviewNotes, ['Keep this note.']);
  const saved = harness.snapshot(); bundle.files.set('media/learner.png', pngBytes(8)); assert.equal(await harness.restoreSaved(saved), true); assert.deepEqual(bundle.files.get('media/learner.png'), pngBytes(4, 5, 6));
  context.sha256Hex = async () => 'unused';
});

test('stale crop completion cannot commit or release a newer operation token', async () => {
  const { harness, context } = loadHarness(), bundle = makeBundle(); harness.setBundle(bundle); harness.setSelectedSourcePath('source-previews/source-1.png'); await harness.enterCrop('asset-1'); let resolveSha;
  context.sha256Hex = () => new Promise(resolve => { resolveSha = resolve; }); harness.setPersist(async () => {}); const pending = harness.saveCrop('asset-1');
  for (let i = 0; i < 12 && !resolveSha; i += 1) { await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); }
  const oldToken = harness.guard().active; harness.guard().cancel(); const newer = harness.guard().begin('backup', 'Backing up…'); resolveSha('new-sha'); assert.equal(await pending, false); assert.equal(harness.guard().active, newer); assert.deepEqual([...bundle.files.get('media/learner.png')], [...pngBytes(1, 2, 3)]); harness.guard().finish(newer); assert.equal(harness.guard().active, null); assert.notEqual(oldToken, newer);
});

test('persistence failure keeps committed in-memory crop state but releases the crop token', async () => {
  const { harness, elements } = loadHarness(), bundle = makeBundle(); harness.setBundle(bundle); harness.setSelectedSourcePath('source-previews/source-1.png'); await harness.enterCrop('asset-1'); harness.setPersist(async () => { throw new Error('persistence unavailable'); });
  assert.equal(await harness.saveCrop('asset-1'), false); assert.equal(harness.guard().active, null); assert.deepEqual(bundle.files.get('media/learner.png'), pngBytes(4, 5, 6)); assert.equal(bundle.reviewMap.cases[0].assets[0].extractionMethod, 'human_crop'); assert.match(elements.get('errors').innerHTML, /persistence unavailable/);
  const next = harness.guard().begin('backup', 'Backing up…'); assert.ok(next); harness.guard().finish(next);
});

test('JPEG crop encoding preserves the MIME, uses quality 0.98, and does not upscale natural pixels', async () => {
  const { harness, context } = loadHarness(), bundle = makeBundle(); bundle.manifest.assets[0].mimeType = 'image/jpeg'; harness.setBundle(bundle); harness.setSelectedSourcePath('source-previews/source-1.png'); await harness.enterCrop('asset-1');
  let canvas;
  context.detectImageType = bytes => bytes?.[0] === 0x89 ? 'image/png' : bytes?.[0] === 0xff ? 'image/jpeg' : null;
  context.document.createElement = () => { canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob(callback, mimeType, quality) { canvas.mimeType = mimeType; canvas.quality = quality; callback(new Blob([jpegBytes(4, 5)], { type: mimeType })); } }; return canvas; };
  harness.setPersist(async () => {}); assert.equal(await harness.saveCrop('asset-1'), true); assert.equal(canvas.width, 100); assert.equal(canvas.height, 50); assert.equal(canvas.mimeType, 'image/jpeg'); assert.equal(canvas.quality, 0.98); assert.deepEqual(bundle.files.get('media/learner.png'), jpegBytes(4, 5));
});

test('global reviewer shortcuts are inert for an active protected operation and resume after exact release', async () => {
  const { harness, document } = loadHarness(), bundle = makeBundle({ cases: 2 }); harness.setBundle(bundle); let persists = 0, renders = 0; harness.setPersist(async () => { persists += 1; }); harness.setRender(async () => { renders += 1; });
  const token = harness.guard().begin('crop-save', 'Saving crop…'), snapshot = { status: bundle.reviewMap.cases[0].reviewStatus, index: harness.current().index };
  for (const key of ['a', 'r', 'x', ' ', 'ArrowLeft', 'ArrowRight']) await document.dispatch('keydown', { key, target: { matches: () => false }, preventDefault() {} });
  assert.equal(bundle.reviewMap.cases[0].reviewStatus, snapshot.status); assert.equal(harness.current().index, snapshot.index); assert.equal(persists, 0); assert.equal(renders, 0); assert.equal(harness.guard().active, token); harness.guard().finish(token);
  await document.dispatch('keydown', { key: 'ArrowRight', target: { matches: () => false }, preventDefault() {} }); assert.equal(harness.current().index, 1);
});
