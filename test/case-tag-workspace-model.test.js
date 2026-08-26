import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectedCaseTagIds,
  stageCaseTagChanges
} from '../src/lib/components/taxonomy-workspace/case-tag-workspace-model.ts';

const assignments = [
  { caseId: 'case-a', tagId: 'rate', tagName: 'Rate control' },
  { caseId: 'case-b', tagId: 'electrolytes', tagName: 'Electrolytes' }
];
const tags = [
  { id: 'rate', name: 'Rate control' },
  { id: 'electrolytes', name: 'Electrolytes' },
  { id: 'anticoag', name: 'Anticoagulation' }
];
const cases = [
  { id: 'case-a', title: 'AF with RVR' },
  { id: 'case-b', title: 'Post-operative AF' }
];

test('Case Tag staging supports bulk add/remove and projects locally', () => {
  let changes = stageCaseTagChanges(assignments, [], cases, tags[2], 'add');
  assert.equal(changes.length, 2);
  assert.deepEqual(changes.map((change) => change.expectedAttached), [false, false]);
  assert.equal(projectedCaseTagIds(assignments, changes, 'case-a').has('anticoag'), true);
  assert.equal(projectedCaseTagIds(assignments, changes, 'case-b').has('anticoag'), true);

  changes = stageCaseTagChanges(assignments, changes, [cases[0]], tags[2], 'remove');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].caseId, 'case-b');
  assert.equal(projectedCaseTagIds(assignments, changes, 'case-a').has('anticoag'), false);

  changes = stageCaseTagChanges(assignments, changes, [cases[0]], tags[0], 'remove');
  const removal = changes.find((change) => change.caseId === 'case-a' && change.tagId === 'rate');
  assert.equal(removal?.operation, 'remove');
  assert.equal(removal?.expectedAttached, true);
  assert.equal(projectedCaseTagIds(assignments, changes, 'case-a').has('rate'), false);
});

test('staging a Case Tag back to loaded membership removes the pending pair', () => {
  let changes = stageCaseTagChanges(assignments, [], [cases[0]], tags[0], 'remove');
  assert.equal(changes.length, 1);
  changes = stageCaseTagChanges(assignments, changes, [cases[0]], tags[0], 'add');
  assert.deepEqual(changes, []);
});

test('Case Tag staging skips no-ops and enforces the 60-Case selection limit', () => {
  assert.deepEqual(stageCaseTagChanges(assignments, [], [cases[0]], tags[0], 'add'), []);

  const tooMany = Array.from({ length: 61 }, (_, index) => ({ id: `case-${index}`, title: `Case ${index}` }));
  assert.throws(
    () => stageCaseTagChanges([], [], tooMany, tags[2], 'add'),
    /no more than 60 Cases/i
  );
});
