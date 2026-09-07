// @ts-nocheck

import assert from 'node:assert/strict';
import test from 'node:test';

import { canReorderCaseQuestion, coordinatedFormStatus, createCaseEditorCoordinator, createCoordinatedFormSaveState, reconcileSubmittedCaseEditorDraft, sameCaseEditorSnapshot, shouldClearSaveAllResult } from '../src/lib/case-editor-coordinator.js';

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

test('Case editor reconciliation keeps an in-flight A to B edit dirty after A succeeds', () => {
  const submittedA = { title: 'A', vignetteMd: 'Original' };
  const newerB = { title: 'B', vignetteMd: 'Original' };
  const reconciled = reconcileSubmittedCaseEditorDraft(newerB, submittedA, submittedA);

  assert.deepEqual(reconciled.baseline, submittedA);
  assert.deepEqual(reconciled.draft, newerB);
  assert.notDeepEqual(reconciled.draft, reconciled.baseline);
});

test('Case editor reconciliation resets a submitted draft when no newer edit exists', () => {
  const submitted = { title: 'A', vignetteMd: 'Updated' };
  const authoritative = { title: 'A', vignetteMd: 'Updated by server' };
  const reconciled = reconcileSubmittedCaseEditorDraft(submitted, submitted, authoritative);

  assert.deepEqual(reconciled.baseline, authoritative);
  assert.deepEqual(reconciled.draft, authoritative);
});

test('Save All continues after a partial failure and reports each outcome', async () => {
  const coordinator = createCaseEditorCoordinator();
  const events = [];
  let firstDirty = true;
  let secondDirty = true;
  coordinator.register('first', { isDirty: () => firstDirty, save: async () => { events.push('first'); return false; } });
  coordinator.register('second', { isDirty: () => secondDirty, save: async () => { events.push('second'); secondDirty = false; return true; } });

  assert.deepEqual(await coordinator.saveAll(), { attempted: 2, succeeded: 1, failed: 1 });
  assert.deepEqual(events, ['first', 'second']);
  assert.equal(coordinator.dirtyCount(), 1);
});

test('coordinator exposes descriptive dirty inventory and keeps structural work out of Save All', async () => {
  const coordinator = createCaseEditorCoordinator();
  let detailsDirty = true;
  let structuralDirty = true;
  let saves = 0;
  coordinator.register('case-details', {
    label: 'Case details',
    dirtyFields: () => ['Vignette'],
    isDirty: () => detailsDirty,
    save: async () => { saves += 1; detailsDirty = false; return true; }
  });
  coordinator.register('question-create', {
    saveable: false,
    label: 'Add Case question',
    dirtyFields: () => ['Prompt and answer entered'],
    isDirty: () => structuralDirty,
    status: () => 'Not submitted — use this form\'s action'
  });

  assert.deepEqual(coordinator.dirtyItems(), [
    { key: 'case-details', label: 'Case details', fields: ['Vignette'], status: 'Unsaved — included in Save all', saveable: true, target: null },
    { key: 'question-create', label: 'Add Case question', fields: ['Prompt and answer entered'], status: 'Not submitted — use this form\'s action', saveable: false, target: null }
  ]);
  assert.equal(coordinator.describeUnsavedWork(), 'Case details — Vignette; Add Case question — Prompt and answer entered');
  assert.deepEqual(await coordinator.saveAll(), { attempted: 1, succeeded: 1, failed: 0 });
  assert.equal(saves, 1);
  assert.equal(coordinator.dirtyItems()[0].key, 'question-create');
});

test('coordinator bounds the in-app leave summary', () => {
  const coordinator = createCaseEditorCoordinator();
  for (let index = 1; index <= 5; index += 1) {
    coordinator.register(`draft-${index}`, { label: `Draft ${index}`, isDirty: () => true, save: async () => true });
  }
  assert.equal(coordinator.describeUnsavedWork(3), 'Draft 1; Draft 2; Draft 3; and 2 more');
});

test('newly registered Case question drafts participate in Save All after revalidation', async () => {
  const coordinator = createCaseEditorCoordinator();
  let dirty = false;
  let saves = 0;
  coordinator.register('question:new-prompt', {
    isDirty: () => dirty,
    save: async () => { saves += 1; dirty = false; return true; }
  });
  dirty = true;

  assert.equal(coordinator.dirtyCount(), 1);
  assert.deepEqual(await coordinator.saveAll(), { attempted: 1, succeeded: 1, failed: 0 });
  assert.equal(saves, 1);
});

test('coordinator excludes the submitted logical form when checking unrelated dirty drafts', () => {
  const coordinator = createCaseEditorCoordinator();
  let captionDirty = true;
  let questionDirty = true;
  coordinator.register('form:caption:asset-1', { isDirty: () => captionDirty, save: async () => true });
  coordinator.register('question:prompt-1', { isDirty: () => questionDirty, save: async () => true });

  assert.equal(coordinator.dirtyCount('form:caption:asset-1'), 1);
  captionDirty = false;
  assert.equal(coordinator.dirtyCount(), 1);
});

test('question reorder blocks stale and in-flight identities', () => {
  const questions = [{ id: 'row-1', questionPromptId: 'prompt-1' }, { id: 'row-2', questionPromptId: 'prompt-2' }];
  assert.equal(canReorderCaseQuestion({ promptId: 'prompt-1', questions }), true);
  assert.equal(canReorderCaseQuestion({ promptId: 'prompt-1', questions, pendingQuestionIds: ['row-1'] }), false);
  assert.equal(canReorderCaseQuestion({ promptId: 'stale-prompt', questions }), false);
});

test('coordinated form status returns to Unsaved after a saved form is edited', () => {
  assert.equal(coordinatedFormStatus({ succeeded: true }), 'Saved');
  assert.equal(coordinatedFormStatus({ dirty: true, succeeded: true }), 'Unsaved changes');
  assert.equal(coordinatedFormStatus({ pending: true, dirty: true }), 'Saving…');
  assert.equal(coordinatedFormStatus({ dirty: true, succeeded: false }), 'Unsaved changes');
});

test('coordinated A to B save reports B as unsaved after A completes', () => {
  let draft = 'A';
  let baseline = 'A';
  const status = createCoordinatedFormSaveState(() => draft !== baseline);

  assert.equal(status.begin(), 'Saving…');
  draft = 'B';
  assert.equal(status.refresh(), 'Saving…');
  baseline = 'A';
  assert.equal(status.complete(true), 'Unsaved changes');
});

test('Save All result clearing waits for a later dirty revision', () => {
  assert.equal(shouldClearSaveAllResult({ resultRevision: 4, currentRevision: 4, dirtyCount: 1 }), false);
  assert.equal(shouldClearSaveAllResult({ resultRevision: 4, currentRevision: 5, dirtyCount: 1 }), true);
  assert.equal(shouldClearSaveAllResult({ resultRevision: 4, currentRevision: 5, dirtyCount: 0 }), false);
});
