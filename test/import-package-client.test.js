// Executable client-state coverage for the Admin import preview lifecycle.
// @ts-nocheck

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';

import { createImportHistoryController } from '../src/lib/import-history-controller.js';
import { createImportPreviewController } from '../src/lib/import-preview-controller.js';
import { CLEAR_IMPORT_HISTORY_CONFIRMATION, createImportHistoryState } from '../src/lib/import-history-state.js';

function file(name, bytes) {
  const value = new Uint8Array(bytes);
  return { name, size: value.byteLength, async arrayBuffer() { return value.slice().buffer; } };
}

function success(previewDigest = 'preview-digest', previewModel = { cases: [] }) {
  return { type: 'success', data: { previewDigest, previewModel, preview: { cases: { create: 0, use: 0, skip: 0 } } } };
}

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await settle();
  }
  assert.fail('Timed out waiting for client state transition.');
}

test('Step-1 selected File is preserved and actually submits a preview request', async () => {
  const selected = file('selected.zip', [1, 2, 3]);
  const calls = [];
  const controller = createImportPreviewController();
  controller.selectPreviewFile(selected);
  const formData = new FormData();
  formData.set('package', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' }), selected.name);
  const result = await controller.submitPreview({
    formData,
    post: async (submitted) => {
      calls.push(submitted);
      return success();
    }
  });

  assert.equal(result.type, 'success');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].get('package').size, 3);
  assert.equal(controller.snapshot().selectedPreviewFile, selected);
  assert.equal(controller.snapshot().serverPreviewStatus, 'succeeded');
  assert.equal(controller.snapshot().localBinding, 'unchecked');
});

test('Step-1 A to B invalidates A and overlap prevention allows only one request', async () => {
  const firstResponse = deferred();
  const fileA = file('a.zip', [1]);
  const fileB = file('b.zip', [2]);
  let calls = 0;
  const controller = createImportPreviewController();

  controller.selectPreviewFile(fileA);
  const first = controller.submitPreview({
    formData: new FormData(),
    post: async () => {
      calls += 1;
      return firstResponse.promise;
    }
  });
  assert.equal(await controller.submitPreview({ formData: new FormData(), post: async () => { calls += 1; return success(); } }), null);

  controller.selectPreviewFile(fileB);
  firstResponse.resolve(success('digest-a'));
  await first;
  assert.equal(calls, 1);
  assert.equal(controller.snapshot().selectedPreviewFile, fileB);
  assert.equal(controller.snapshot().previewResult, null);
  assert.equal(controller.snapshot().serverPreviewStatus, 'invalidated');
});

test('Step-2 binding fences stale hashes to the current selection', async () => {
  const pending = new Map();
  const controller = createImportPreviewController({
    hashFile: (selected) => {
      const wait = deferred();
      pending.set(selected.name, wait);
      return wait.promise;
    }
  });
  const preview = file('preview.zip', [9]);
  const startA = file('a.zip', [1]);
  const startB = file('b.zip', [2]);
  controller.selectPreviewFile(preview);
  await controller.submitPreview({ formData: new FormData(), post: async () => success('digest-b') });

  controller.selectStartFile(startA);
  controller.selectStartFile(startB);
  pending.get('a.zip').resolve('digest-b');
  await settle();
  assert.equal(controller.snapshot().selectedStartFile, startB);
  assert.notEqual(controller.snapshot().localBinding, 'matched');

  pending.get('b.zip').resolve('digest-b');
  await settle();
  assert.equal(controller.snapshot().localBinding, 'matched');
  assert.equal(controller.canStart(), true);
});

test('Step-1 success revalidates, never substitutes, a different Step-2 selection', async () => {
  const response = deferred();
  const hash = deferred();
  const previewFile = file('preview.zip', [1]);
  const differentStartFile = file('different.zip', [2]);
  const controller = createImportPreviewController({ hashFile: () => hash.promise });

  controller.selectPreviewFile(previewFile);
  const request = controller.submitPreview({ formData: new FormData(), post: async () => response.promise });
  controller.selectStartFile(differentStartFile);
  response.resolve(success('preview-digest'));
  await settle();
  assert.equal(controller.snapshot().selectedStartFile, differentStartFile);
  assert.equal(controller.snapshot().localBinding, 'hashing');

  hash.resolve('different-digest');
  await request;
  await settle();
  assert.equal(controller.snapshot().selectedStartFile, differentStartFile);
  assert.equal(controller.snapshot().localBinding, 'mismatched');
  assert.equal(controller.canStart(), false);
});

test('successful binding is consumed before start while the visual preview remains', async () => {
  const preview = file('preview.zip', [3]);
  const start = file('start.zip', [4]);
  const controller = createImportPreviewController({ hashFile: async () => 'same-digest' });
  controller.selectPreviewFile(preview);
  await controller.submitPreview({ formData: new FormData(), post: async () => success('same-digest') });
  controller.selectStartFile(start);
  await settle();
  assert.equal(controller.canStart(), true);
  const before = controller.snapshot().previewResult;
  controller.consumeAuthorization();
  assert.equal(controller.canStart(), false);
  assert.equal(controller.snapshot().serverPreviewStatus, 'invalidated');
  assert.equal(controller.snapshot().localBinding, 'invalidated');
  assert.equal(controller.snapshot().previewResult, before);
});

test('media failure is warning-only and successful Blob URLs are revoked on invalidation', async () => {
  const urls = [];
  const revoked = [];
  const extractedPaths = [];
  const shared = { asset: { id: 'asset-ready', operation: 'create', mediaPath: 'media/ready.png', mimeType: 'image/png' } };
  const previewModel = { cases: [{ assets: [shared] }, { assets: [shared, { asset: { id: 'asset-bad', operation: 'create', mediaPath: 'media/bad.png', mimeType: 'image/png' } }] }] };
  const controller = createImportPreviewController({
    extractMedia: async (_bytes, [path]) => {
      extractedPaths.push(path);
      if (path === 'media/bad.png') throw new Error('display-only extraction failed');
      return new Map([[path, new Uint8Array([1, 2, 3])]]);
    },
    createObjectURL: () => { const url = `blob:${urls.length + 1}`; urls.push(url); return url; },
    revokeObjectURL: (url) => revoked.push(url)
  });
  const preview = file('preview.zip', [5]);
  controller.selectPreviewFile(preview);
  await controller.submitPreview({ formData: new FormData(), post: async () => success('digest', previewModel) });
  await waitFor(() => controller.snapshot().media['asset-ready']?.status === 'ready' && controller.snapshot().media['asset-bad']?.status === 'unavailable');
  assert.equal(controller.snapshot().serverPreviewStatus, 'succeeded');
  assert.deepEqual(extractedPaths, ['media/ready.png', 'media/bad.png']);
  assert.deepEqual(revoked, []);

  controller.selectPreviewFile(file('next.zip', [6]));
  assert.deepEqual(revoked, ['blob:1']);
});

test('history snapshots and terminal confirmation state remain isolated from active preview state', async () => {
  const history = createImportHistoryState({ jobs: [{ id: 'active', status: 'importing' }], hasEligibleTerminalHistory: false });
  const controller = createImportPreviewController();
  const preview = file('preview.zip', [7]);
  controller.selectPreviewFile(preview);
  await controller.submitPreview({ formData: new FormData(), post: async () => success() });
  history.upsert({ id: 'complete', status: 'complete' });
  assert.equal(history.value().hasEligibleTerminalHistory, true);
  assert.equal(history.value().jobs.find((job) => job.id === 'active').status, 'importing');
  assert.equal(controller.snapshot().serverPreviewStatus, 'succeeded');
  assert.ok(controller.snapshot().previewResult);
  history.replace({ jobs: [{ id: 'row-11', status: 'complete' }], hasEligibleTerminalHistory: true });
  assert.equal(controller.snapshot().serverPreviewStatus, 'succeeded');
  assert.deepEqual(CLEAR_IMPORT_HISTORY_CONFIRMATION, {
    title: 'Remove completed/cancelled import records from history?',
    content: 'Imported Flash-Cards content will not be deleted.',
    retained: 'Failed or active resumable imports will be kept.'
  });
});

test('history removal and clear continuation preserve active processing and the preview state', async () => {
  const previewController = createImportPreviewController();
  const previewFile = file('preview.zip', [8]);
  previewController.selectPreviewFile(previewFile);
  await previewController.submitPreview({ formData: new FormData(), post: async () => success('preview-digest') });
  const previewBeforeHistoryActions = previewController.snapshot();

  const firstProcess = deferred();
  const historyCalls = [];
  const clearResults = [
    {
      removedIds: ['old-complete'],
      failed: [{ id: 'blocked-failed', code: 'cleanup_failed', message: 'Staging cleanup incomplete.' }],
      nextCursor: 'cursor-2',
      history: { jobs: [{ id: 'active', status: 'importing' }], hasEligibleTerminalHistory: true }
    },
    {
      removedIds: ['next-complete'],
      failed: [],
      nextCursor: null,
      history: { jobs: [{ id: 'active', status: 'importing' }], hasEligibleTerminalHistory: false }
    }
  ];
  let processCalls = 0;
  const history = createImportHistoryController({
    jobs: [{ id: 'active', status: 'importing' }, { id: 'terminal', status: 'complete' }],
    hasEligibleTerminalHistory: true
  }, {
    postJobAction: async (action, id) => {
      assert.equal(action, 'process');
      assert.equal(id, 'active');
      processCalls += 1;
      if (processCalls === 1) return firstProcess.promise;
      return { job: { id: 'active', status: 'complete' } };
    },
    postHistoryAction: async (action, value) => {
      historyCalls.push([action, value]);
      if (action === 'removeHistory') return { removedIds: ['terminal'], failed: [], nextCursor: null, history: { jobs: [{ id: 'active', status: 'importing' }], hasEligibleTerminalHistory: false } };
      return clearResults.shift();
    },
    sleep: async () => {}
  });

  const processing = history.runImport('active');
  await waitFor(() => history.snapshot().runningJobId === 'active' && history.snapshot().requestInFlight);
  await history.removeHistory('terminal');
  assert.equal(history.snapshot().runningJobId, 'active');
  assert.equal(history.snapshot().requestInFlight, true);
  assert.equal(previewController.snapshot().previewResult, previewBeforeHistoryActions.previewResult);
  assert.equal(previewController.snapshot().serverPreviewStatus, 'succeeded');

  assert.equal(await history.confirmClear({ confirmed: false }), null);
  assert.deepEqual(historyCalls, [['removeHistory', 'terminal']]);

  history.openClearDialog('cursor-1');
  const partial = await history.confirmClear({ confirmed: true });
  assert.deepEqual(partial.failed, [{ id: 'blocked-failed', code: 'cleanup_failed', message: 'Staging cleanup incomplete.' }]);
  assert.equal(partial.nextCursor, 'cursor-2');
  assert.equal(history.snapshot().runningJobId, 'active');
  assert.equal(history.snapshot().requestInFlight, true);

  const continued = await history.confirmClear({ confirmed: true });
  assert.equal(continued.nextCursor, null);
  assert.deepEqual(historyCalls, [['removeHistory', 'terminal'], ['clearHistory', 'cursor-1'], ['clearHistory', 'cursor-2']]);
  assert.equal(history.snapshot().runningJobId, 'active');

  firstProcess.resolve({ job: { id: 'active', status: 'importing' } });
  await processing;
  assert.equal(processCalls, 2);
  assert.equal(history.snapshot().runningJobId, null);
  assert.equal(history.snapshot().jobs.find((job) => job.id === 'active').status, 'complete');
  assert.equal(previewController.snapshot().previewResult, previewBeforeHistoryActions.previewResult);
  previewController.destroy();
  history.destroy();
});

test('package-controlled HTML-like text renders literally and cannot create executable markup', async () => {
  const source = readFileSync(new URL('../src/lib/components/ImportPackageText.svelte', import.meta.url), 'utf8');
  const compiled = compile(source, { filename: 'ImportPackageText.svelte', generate: 'server' });
  const directory = mkdtempSync(join(process.cwd(), '.tmp-package-text-'));
  const modulePath = join(directory, 'ImportPackageText.mjs');
  writeFileSync(modulePath, compiled.js.code, 'utf8');
  try {
    const component = (await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`)).default;
    const hostile = '<img src=x onerror="alert(1)"> <script>alert(2)</script>';
    const html = render(component, { props: { value: hostile } }).html;
    assert.match(html, /&lt;img src=x onerror="alert\(1\)">/);
    assert.match(html, /&lt;script>alert\(2\)&lt;\/script>/);
    assert.doesNotMatch(html, /<img\b|<script\b/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
