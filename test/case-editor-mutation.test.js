// @ts-nocheck

import assert from 'node:assert/strict';
import test from 'node:test';

import { createCaseEditorCoordinator, sameCaseEditorSnapshot } from '../src/lib/case-editor-coordinator.js';

test('Case editor coordinator serializes Save All and only attempts current dirty drafts', async () => {
  const coordinator = createCaseEditorCoordinator();
  const events = [];
  let firstDirty = true;
  let secondDirty = false;
  coordinator.register('first', { isDirty: () => firstDirty, save: async () => { events.push('first'); firstDirty = false; return true; } });
  coordinator.register('second', { isDirty: () => secondDirty, save: async () => { events.push('second'); secondDirty = false; return true; } });

  const firstRun = await coordinator.saveAll();
  assert.deepEqual(firstRun, { attempted: 1, succeeded: 1, failed: 0 });
  assert.deepEqual(events, ['first']);
  assert.equal(coordinator.dirtyCount(), 0);

  firstDirty = true;
  secondDirty = true;
  const [runA, runB] = await Promise.all([coordinator.saveAll(), coordinator.saveAll()]);
  assert.deepEqual(runA, { attempted: 2, succeeded: 2, failed: 0 });
  assert.deepEqual(runB, { attempted: 0, succeeded: 0, failed: 0 });
  assert.deepEqual(events, ['first', 'first', 'second']);
});

test('Case editor snapshot equality distinguishes a newer in-flight edit', () => {
  const submitted = { title: 'A', vignetteMd: 'Original' };
  assert.equal(sameCaseEditorSnapshot(submitted, { title: 'A', vignetteMd: 'Original' }), true);
  assert.equal(sameCaseEditorSnapshot(submitted, { title: 'B', vignetteMd: 'Original' }), false);
});
