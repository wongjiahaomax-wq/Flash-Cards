import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAssetSelection,
  clearAssetSelection,
  pruneAssetSelection,
  reconcileCasePickerSelection
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

test('Shift selection follows the currently displayed filtered/sorted order', () => {
  const anchored = applyAssetSelection({ selectedIds: [], orderedIds: displayed, assetId: 'asset-a', toggleKey: true });
  const ranged = applyAssetSelection({ ...anchored, orderedIds: displayed, assetId: 'asset-b', shiftKey: true });
  assert.deepEqual([...ranged.selectedIds], ['asset-a', 'asset-d', 'asset-b']);
  assert.equal(ranged.anchorId, 'asset-a');
  assert.equal(ranged.selectedIds.has('asset-c'), false);
});

test('filter changes prune hidden selected Assets and reset an invisible range anchor', () => {
  const pruned = pruneAssetSelection({
    selectedIds: ['asset-c', 'asset-a', 'asset-d'],
    orderedIds: ['asset-a', 'asset-b'],
    anchorId: 'asset-d'
  });
  assert.deepEqual([...pruned.selectedIds], ['asset-a']);
  assert.equal(pruned.anchorId, null);
});

test('Case picker prunes selection when results change but keeps still-visible Assets', () => {
  const reconciled = reconcileCasePickerSelection({
    selectedIds: ['asset-c', 'asset-a'],
    previousContextKey: 'case-1:fixed',
    nextContextKey: 'case-1:fixed',
    orderedIds: ['asset-a', 'asset-b']
  });
  assert.deepEqual([...reconciled.selectedIds], ['asset-a']);
  assert.equal(reconciled.contextKey, 'case-1:fixed');
});

test('Case picker resets selection when Case or attachment target changes', () => {
  const reconciled = reconcileCasePickerSelection({
    selectedIds: ['asset-a', 'asset-b'],
    previousContextKey: 'case-1:fixed',
    nextContextKey: 'case-1:stimulus-group-2',
    orderedIds: ['asset-a', 'asset-b']
  });
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
