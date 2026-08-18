import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAssetSelection,
  chunkAssetIds,
  clearAssetSelection,
  pruneAssetSelection,
  reconcileCasePickerSelection,
  reconcileLibrarySelection,
  runSequentialAssetChunks
} from '../src/lib/admin-image-selection.js';

const displayed = ['asset-c', 'asset-a', 'asset-d', 'asset-b'];

test('Ctrl/Cmd-style toggle preserves other selected Assets and updates the anchor', () => {
  let state = applyAssetSelection({ selectedIds: [], orderedIds: displayed, assetId: 'asset-c', toggleKey: true });
  state = applyAssetSelection({ ...state, orderedIds: displayed, assetId: 'asset-d', toggleKey: true });
  assert.deepEqual([...state.selectedIds].sort(), ['asset-c', 'asset-d']);
  assert.equal(state.anchorId, 'asset-d');
  state = applyAssetSelection({ ...state, orderedIds: displayed, assetId: 'asset-c', toggleKey: true });
  assert.deepEqual([...state.selectedIds], ['asset-d']);
  assert.equal(state.anchorId, 'asset-c');
});

test('Shift selection follows the currently displayed filtered/sorted order only', () => {
  const anchored = applyAssetSelection({ selectedIds: ['asset-off-page'], orderedIds: displayed, assetId: 'asset-a', toggleKey: true });
  const ranged = applyAssetSelection({ ...anchored, orderedIds: displayed, assetId: 'asset-b', shiftKey: true });
  assert.deepEqual([...ranged.selectedIds], ['asset-off-page', 'asset-a', 'asset-d', 'asset-b']);
  assert.equal(ranged.anchorId, 'asset-a');
  assert.equal(ranged.selectedIds.has('asset-c'), false);
});

test('paged library preserves selected IDs when only the page changes', () => {
  const reconciled = reconcileLibrarySelection({
    selectedIds: ['page-1-a', 'page-1-b'],
    anchorId: 'page-1-b',
    previousContextKey: 'same-query',
    nextContextKey: 'same-query',
    orderedIds: ['page-2-a', 'page-2-b']
  });
  assert.deepEqual([...reconciled.selectedIds], ['page-1-a', 'page-1-b']);
  assert.equal(reconciled.anchorId, null);
});

test('paged library clears selection when search/filter/sort query context changes', () => {
  for (const nextContextKey of ['search-changed', 'usage-changed', 'status-changed', 'source-changed', 'sort-changed']) {
    const reconciled = reconcileLibrarySelection({
      selectedIds: ['asset-a', 'asset-b'],
      anchorId: 'asset-b',
      previousContextKey: 'old-query',
      nextContextKey,
      orderedIds: displayed
    });
    assert.equal(reconciled.selectedIds.size, 0);
    assert.equal(reconciled.anchorId, null);
  }
});

test('bounded Case picker still prunes hidden selected Assets', () => {
  const pruned = pruneAssetSelection({ selectedIds: ['asset-c', 'asset-a', 'asset-d'], orderedIds: ['asset-a', 'asset-b'], anchorId: 'asset-d' });
  assert.deepEqual([...pruned.selectedIds], ['asset-a']);
  assert.equal(pruned.anchorId, null);
});

test('Case picker prunes selection when results change but keeps still-visible Assets', () => {
  const reconciled = reconcileCasePickerSelection({ selectedIds: ['asset-c', 'asset-a'], previousContextKey: 'case-1:fixed', nextContextKey: 'case-1:fixed', orderedIds: ['asset-a', 'asset-b'] });
  assert.deepEqual([...reconciled.selectedIds], ['asset-a']);
  assert.equal(reconciled.contextKey, 'case-1:fixed');
});

test('Case picker resets selection when Case or attachment target changes', () => {
  const reconciled = reconcileCasePickerSelection({ selectedIds: ['asset-a', 'asset-b'], previousContextKey: 'case-1:fixed', nextContextKey: 'case-1:stimulus-group-2', orderedIds: ['asset-a', 'asset-b'] });
  assert.equal(reconciled.selectedIds.size, 0);
  assert.equal(reconciled.contextKey, 'case-1:stimulus-group-2');
});

test('plain selection replaces the existing set and clear selection resets state', () => {
  const selected = applyAssetSelection({ selectedIds: ['asset-c', 'asset-d'], orderedIds: displayed, assetId: 'asset-b' });
  assert.deepEqual([...selected.selectedIds], ['asset-b']);
  assert.equal(selected.anchorId, 'asset-b');
  const cleared = clearAssetSelection();
  assert.equal(cleared.selectedIds.size, 0);
  assert.equal(cleared.anchorId, null);
});

test('chunking uses at most 30 unique IDs for 1, 30, 31, 60 and 61 selections', () => {
  for (const expected of [1, 30, 31, 60, 61]) {
    const ids = Array.from({ length: expected }, (_, index) => `asset-${index}`);
    const chunks = chunkAssetIds([...ids, ids[0]], 30);
    assert.equal(chunks.flat().length, expected);
    assert.ok(chunks.every((chunk) => chunk.length <= 30));
    assert.equal(chunks.length, Math.ceil(expected / 30));
  }
});

test('multi-chunk execution is sequential and stops on the first failed chunk', async () => {
  const ids = Array.from({ length: 61 }, (_, index) => `asset-${index}`);
  /** @type {{ chunk: string[], processed: number }[]} */
  const calls = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const result = await runSequentialAssetChunks(ids, 30, async (chunk, state) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    calls.push({ chunk: [...chunk], processed: state.processed });
    await Promise.resolve();
    inFlight -= 1;
    if (calls.length === 2) throw new Error('batch conflict');
  });
  assert.equal(maxInFlight, 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].chunk.length, 30);
  assert.equal(calls[1].chunk.length, 30);
  assert.equal(result.ok, false);
  assert.equal(result.processed, 30);
  assert.equal(result.remainingIds.length, 31);
  assert.deepEqual(result.remainingIds, ids.slice(30));
});

test('successful multi-chunk execution accounts for all selected IDs', async () => {
  const ids = Array.from({ length: 61 }, (_, index) => `asset-${index}`);
  /** @type {string[][]} */
  const calls = [];
  const result = await runSequentialAssetChunks(ids, 30, async (chunk) => calls.push([...chunk]));
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map((chunk) => chunk.length), [30, 30, 1]);
  assert.equal(result.processed, 61);
  assert.deepEqual(result.remainingIds, []);
});
