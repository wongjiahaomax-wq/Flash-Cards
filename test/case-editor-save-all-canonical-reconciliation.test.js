// @ts-nocheck

import assert from 'node:assert/strict';
import test from 'node:test';

import { createCaseEditorCoordinator, reconcileSubmittedCaseEditorDraft } from '../src/lib/case-editor-coordinator.js';

test('Save All uses canonical persisted baseline when a newer edit arrives during the batch', async () => {
  const coordinator = createCaseEditorCoordinator();
  let draft = 'Original';
  let baseline = 'Original';
  let release;

  coordinator.register('case-details', {
    label: 'Case details',
    dirtyFields: () => draft === baseline ? [] : ['Internal title'],
    isDirty: () => draft !== baseline,
    prepareSave: () => draft,
    saveAllPayload: (snapshot) => ({ snapshot }),
    commitSaveAll: (submitted, authoritative) => {
      const reconciled = reconcileSubmittedCaseEditorDraft(draft, submitted, authoritative ?? submitted);
      baseline = reconciled.baseline;
      draft = reconciled.draft;
    }
  });

  draft = '  Canonical title  ';
  const save = coordinator.saveAll(async (drafts) => {
    assert.deepEqual(drafts, [{ snapshot: '  Canonical title  ' }]);
    await new Promise((resolve) => { release = resolve; });
    return { ok: true, authoritative: ['Canonical title'] };
  });

  draft = 'Newer title';
  release();
  assert.deepEqual(await save, { attempted: 1, succeeded: 1, failed: 0 });
  assert.equal(baseline, 'Canonical title', 'baseline must match the normalized persisted value');
  assert.equal(draft, 'Newer title', 'edit made during Save All must remain visible and dirty');
  assert.deepEqual(coordinator.dirtyItems().map((item) => item.fields), [['Internal title']]);

  draft = 'Canonical title';
  assert.equal(coordinator.dirtyItems().length, 0, 'reverting to the canonical persisted value is clean');
});
