import assert from 'node:assert/strict';
import test from 'node:test';

import { applyCaseSelection, reconcileVisibleCaseSelection } from '../src/lib/admin-case-selection.js';

const displayed = ['case-c', 'case-a', 'case-d', 'case-b'];

test('ordinary Case checkbox clicks preserve other selected Cases', () => {
  let state = applyCaseSelection({ selectedIds: [], orderedIds: displayed, caseId: 'case-c' });
  state = applyCaseSelection({ ...state, orderedIds: displayed, caseId: 'case-d' });
  assert.deepEqual([...state.selectedIds], ['case-c', 'case-d']);
  assert.equal(state.anchorId, 'case-d');
});

test('Shift-click selects the inclusive range in displayed order', () => {
  let state = applyCaseSelection({ selectedIds: [], orderedIds: displayed, caseId: 'case-a' });
  state = applyCaseSelection({ ...state, orderedIds: displayed, caseId: 'case-b', shiftKey: true });
  assert.deepEqual([...state.selectedIds], ['case-a', 'case-d', 'case-b']);
  assert.equal(state.anchorId, 'case-a');
});

test('Shift-click does not select Cases from an unloaded page', () => {
  const state = applyCaseSelection({
    selectedIds: ['case-off-page'],
    orderedIds: displayed,
    anchorId: 'case-off-page',
    caseId: 'case-b',
    shiftKey: true
  });
  assert.deepEqual([...state.selectedIds], ['case-off-page', 'case-b']);
});

test('failed retry selection keeps only freshly visible Cases and reports stale removals', () => {
  assert.deepEqual(
    reconcileVisibleCaseSelection({
      selectedIds: ['case-a', 'case-b', 'case-a', '', null],
      visibleIds: ['case-a', 'case-c']
    }),
    { selectedIds: ['case-a'], submittedCount: 2, removedCount: 1 }
  );
});

test('failed assignment retry can detect when every prior Case disappeared from the current result', () => {
  assert.deepEqual(
    reconcileVisibleCaseSelection({
      selectedIds: ['case-a', 'case-b'],
      visibleIds: ['case-c']
    }),
    { selectedIds: [], submittedCount: 2, removedCount: 2 }
  );
});
