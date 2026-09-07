// @ts-nocheck

import assert from 'node:assert/strict';
import test from 'node:test';

import { canReorderCaseQuestion, coordinatedFormStatus, createCaseEditorCoordinator, createCoordinatedFormSaveState, reconcileSubmittedCaseEditorDraft, sameCaseEditorSnapshot, shouldClearSaveAllResult } from '../src/lib/case-editor-coordinator.js';

test('Case editor coordinator serializes Save All and only attempts current dirty drafts', async () => {
  const coordinator = createCaseEditorCoordinator();
  const events = [];
  let firstDirty = true;
  let secondDirty = false;
  coordinator.register('first', { isDirty: () => firstDirty, prepareSave: () => 'first', saveAllPayload: () => ({}), commitSaveAll: () => { events.push('first'); firstDirty = false; } });
  coordinator.register('second', { isDirty: () => secondDirty, prepareSave: () => 'second', saveAllPayload: () => ({}), commitSaveAll: () => { events.push('second'); secondDirty = false; } });

  const firstRun = await coordinator.saveAll(async () => true);
  assert.deepEqual(firstRun, { attempted: 1, succeeded: 1, failed: 0 });
  assert.deepEqual(events, ['first']);
  assert.equal(coordinator.dirtyCount(), 0);

  firstDirty = true;
  secondDirty = true;
  const [runA, runB] = await Promise.all([coordinator.saveAll(async () => true), coordinator.saveAll(async () => true)]);
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

test('Save All failure keeps every captured draft dirty', async () => {
  const coordinator = createCaseEditorCoordinator();
  const events = [];
  let firstDirty = true;
  let secondDirty = true;
  coordinator.register('first', { isDirty: () => firstDirty, prepareSave: () => 'first', saveAllPayload: () => ({}), commitSaveAll: () => { events.push('first'); firstDirty = false; } });
  coordinator.register('second', { isDirty: () => secondDirty, prepareSave: () => 'second', saveAllPayload: () => ({}), commitSaveAll: () => { events.push('second'); secondDirty = false; } });

  assert.deepEqual(await coordinator.saveAll(async () => false), { attempted: 2, succeeded: 0, failed: 2 });
  assert.deepEqual(events, []);
  assert.equal(coordinator.dirtyCount(), 2);
});

test('partial Save All failure retains stable-ID updates for a safe retry', async () => {
  const coordinator = createCaseEditorCoordinator();
  const drafts = [
    { id: 'asset-1', value: 'Caption A' },
    { id: 'group-1', value: 'Group B' }
  ];
  const dirty = new Set(drafts.map((draft) => draft.id));
  for (const draft of drafts) {
    coordinator.register(`form:${draft.id}`, {
      isDirty: () => dirty.has(draft.id),
      prepareSave: () => draft,
      saveAllPayload: (snapshot) => ({ kind: 'form', fields: snapshot }),
      commitSaveAll: () => dirty.delete(draft.id)
    });
  }

  const requests = [];
  let attempt = 0;
  const submit = async (batch) => {
    requests.push(batch);
    // Model an earlier writer persisting before a later writer fails. The
    // coordinator must retain the whole captured batch for the retry.
    if (attempt++ === 0) return false;
    return true;
  };
  assert.deepEqual(await coordinator.saveAll(submit), { attempted: 2, succeeded: 0, failed: 2 });
  assert.equal(coordinator.dirtyCount(), 2);
  assert.deepEqual(await coordinator.saveAll(submit), { attempted: 2, succeeded: 2, failed: 0 });
  assert.deepEqual(requests[1], requests[0], 'retry must reapply the same stable-ID updates');
  assert.equal(coordinator.dirtyCount(), 0);
});

test('one Save All request carries Case details, Question, and generic drafts and only commits after success', async () => {
  const coordinator = createCaseEditorCoordinator();
  let detailsDirty = true;
  let questionDirty = true;
  let captionDirty = true;
  const committed = [];
  const entry = (kind, clear) => ({
    isDirty: () => clear.dirty,
    prepareSave: () => ({ kind }),
    saveAllPayload: (snapshot) => snapshot,
    commitSaveAll: () => { clear.dirty = false; committed.push(kind); }
  });
  coordinator.register('case-details', entry('case-details', { get dirty() { return detailsDirty; }, set dirty(value) { detailsDirty = value; } }));
  coordinator.register('question:q1', entry('question', { get dirty() { return questionDirty; }, set dirty(value) { questionDirty = value; } }));
  coordinator.register('form:caption', entry('form', { get dirty() { return captionDirty; }, set dirty(value) { captionDirty = value; } }));
  let requestCount = 0;
  let payload = null;
  const result = await coordinator.saveAll(async (drafts) => { requestCount += 1; payload = drafts; return true; });
  assert.deepEqual(result, { attempted: 3, succeeded: 3, failed: 0 });
  assert.equal(requestCount, 1);
  assert.deepEqual(payload.map((draft) => draft.kind), ['case-details', 'question', 'form']);
  assert.deepEqual(committed, ['case-details', 'question', 'form']);
  assert.equal(coordinator.hasUnsavedWork(), false);
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
    prepareSave: () => 'details', saveAllPayload: () => ({}), commitSaveAll: () => { saves += 1; detailsDirty = false; }
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
  assert.deepEqual(await coordinator.saveAll(async () => true), { attempted: 1, succeeded: 1, failed: 0 });
  assert.equal(saves, 1);
  assert.equal(coordinator.dirtyItems()[0].key, 'question-create');
});

test('coordinator bounds the in-app leave summary', () => {
  const coordinator = createCaseEditorCoordinator();
  for (let index = 1; index <= 5; index += 1) {
    coordinator.register(`draft-${index}`, { label: `Draft ${index}`, isDirty: () => true, prepareSave: () => index, saveAllPayload: () => ({}), commitSaveAll: () => {} });
  }
  assert.equal(coordinator.describeUnsavedWork(3), 'Draft 1; Draft 2; Draft 3; and 2 more');
});

test('newly registered Case question drafts participate in Save All after revalidation', async () => {
  const coordinator = createCaseEditorCoordinator();
  let dirty = false;
  let saves = 0;
  coordinator.register('question:new-prompt', {
    isDirty: () => dirty,
    prepareSave: () => 'question', saveAllPayload: () => ({}), commitSaveAll: () => { saves += 1; dirty = false; }
  });
  dirty = true;

  assert.equal(coordinator.dirtyCount(), 1);
  assert.deepEqual(await coordinator.saveAll(async () => true), { attempted: 1, succeeded: 1, failed: 0 });
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
