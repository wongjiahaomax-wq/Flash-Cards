// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCaseEditorCoordinator, reconcileSubmittedCaseEditorDraft } from '../src/lib/case-editor-coordinator.js';
import { captureEditableFormSnapshot, changedFormFieldLabels, formCanHoldMeaningfulStructuralInput, formHasMeaningfulUnsubmittedInput, formHasMeaningfulUnsubmittedInputAgainst, formHasSelectedFile, mutationMayChangeEditorFormTopology, reconcileEditableFormSaveSnapshot } from '../src/lib/case-editor-form-state.js';

class FakeInput {
  constructor(name, type = 'text', value = '') {
    this.name = name;
    this.type = type;
    this.value = value;
    this.defaultValue = value;
    this.checked = false;
    this.defaultChecked = false;
    this.files = [];
  }
}

class FakeTextarea extends FakeInput {}
class FakeSelect extends FakeInput {
  constructor(name, options) {
    super(name, 'select-one', '');
    this.options = options;
  }
}

globalThis.HTMLInputElement = FakeInput;
globalThis.HTMLTextAreaElement = FakeTextarea;
globalThis.HTMLSelectElement = FakeSelect;

function fakeForm(...args) {
  const action = typeof args[0] === 'string' ? args.shift() : '';
  return { elements: args, getAttribute: (name) => name === 'action' ? action : null };
}

test('explicit form baseline keeps Svelte-initialized controls pristine', () => {
  const selector = new FakeSelect('target', [{ selected: true, defaultSelected: false }, { selected: false, defaultSelected: false }]);
  const form = fakeForm(selector);
  const baseline = captureEditableFormSnapshot(form);

  assert.equal(formHasMeaningfulUnsubmittedInputAgainst(form, baseline), false);
  selector.options[1].selected = true;
  selector.options[0].selected = false;
  selector.value = 'second';
  assert.equal(formHasMeaningfulUnsubmittedInputAgainst(form, baseline), true);
});

test('structural tracking only admits forms with meaningful editable controls', () => {
  assert.equal(formCanHoldMeaningfulStructuralInput(fakeForm(new FakeInput('case_id', 'hidden'))), false);
  assert.equal(formCanHoldMeaningfulStructuralInput(fakeForm(new FakeInput('submit', 'submit'))), false);
  assert.equal(formCanHoldMeaningfulStructuralInput(fakeForm(new FakeTextarea('prompt_md'))), true);
});

test('picker search and picker UI never become structural unsaved work', () => {
  const pickerSearch = fakeForm(new FakeInput('', 'search', 'initial'));
  pickerSearch.hasAttribute = (name) => name === 'data-case-editor-picker-search';
  pickerSearch.elements[0].value = 'typed query';
  assert.equal(formHasMeaningfulUnsubmittedInput(pickerSearch), false);
  assert.equal(formCanHoldMeaningfulStructuralInput(pickerSearch), false);

  const picker = fakeForm(new FakeInput('image', 'file'));
  picker.hasAttribute = (name) => name === 'data-case-editor-picker';
  picker.elements[0].files = [{ name: 'preview.png', size: 1, lastModified: 1, type: 'image/png' }];
  assert.equal(formHasMeaningfulUnsubmittedInput(picker), false);
  assert.equal(formHasSelectedFile(picker), false);
});

test('selected upload file is part of the dirty snapshot', () => {
  const upload = new FakeInput('image', 'file');
  const form = fakeForm(upload);
  const baseline = captureEditableFormSnapshot(form);
  upload.files = [{ name: 'ecg.png', size: 1234, lastModified: 42, type: 'image/png' }];

  assert.equal(formHasMeaningfulUnsubmittedInputAgainst(form, baseline), true);
  assert.deepEqual(captureEditableFormSnapshot(form)[0].files, [{ name: 'ecg.png', size: 1234, lastModified: 42, type: 'image/png' }]);
  assert.equal(formHasSelectedFile(form), true);
});

test('pristine editor inventory has zero dirty items', () => {
  const coordinator = createCaseEditorCoordinator();
  const form = fakeForm(new FakeTextarea('prompt_md', 'text', 'Saved prompt'));
  const baseline = captureEditableFormSnapshot(form);
  coordinator.register('structural:question', { isDirty: () => formHasMeaningfulUnsubmittedInputAgainst(form, baseline), saveable: false });
  assert.deepEqual(coordinator.dirtyItems(), []);
});

test('coordinated save retains the visible authoritative value and establishes its baseline', () => {
  const form = fakeForm(new FakeTextarea('caption', 'text', 'Old caption'));
  const submitted = captureEditableFormSnapshot(form);
  form.elements[0].value = 'Saved caption';
  const authoritative = captureEditableFormSnapshot(form);
  const reconciled = reconcileSubmittedCaseEditorDraft(authoritative, submitted, authoritative);
  assert.deepEqual(reconciled.draft, authoritative);
  assert.deepEqual(reconciled.baseline, authoritative);
  assert.equal(form.elements[0].value, 'Saved caption');
});

test('canonical form readback replaces normalized submitted value but preserves a newer edit', () => {
  const submitted = [{ name: 'caption', type: 'text', value: '  Saved caption  ' }];
  const canonical = { caption: 'Saved caption' };

  const clean = reconcileEditableFormSaveSnapshot(submitted, submitted, canonical);
  assert.deepEqual(clean.baseline, [{ name: 'caption', type: 'text', value: 'Saved caption' }]);
  assert.deepEqual(clean.draft, clean.baseline);

  const newer = [{ name: 'caption', type: 'text', value: 'Newer edit' }];
  const dirty = reconcileEditableFormSaveSnapshot(newer, submitted, canonical);
  assert.equal(dirty.baseline[0].value, 'Saved caption');
  assert.equal(dirty.draft[0].value, 'Newer edit');
});

test('coordinated save establishes an authoritative baseline while preserving edit-during-save dirtiness', async () => {
  const coordinator = createCaseEditorCoordinator();
  let draft = 'O';
  let baseline = 'O';
  let release;
  coordinator.register('caption', {
    label: 'Always-shown image',
    dirtyFields: () => draft === baseline ? [] : ['Caption'],
    isDirty: () => draft !== baseline,
    prepareSave: () => draft,
    saveAllPayload: (snapshot) => ({ snapshot }),
    commitSaveAll: (snapshot) => { baseline = snapshot; }
  });

  draft = 'A';
  const firstSave = coordinator.saveAll(async () => {
    const submitted = draft;
    await new Promise((resolve) => { release = resolve; });
    baseline = submitted;
    return true;
  });
  draft = 'B';
  release();
  await firstSave;
  assert.equal(coordinator.dirtyItems()[0].fields[0], 'Caption');
  draft = 'A';
  assert.equal(coordinator.dirtyItems().length, 0, 'reverting the newer edit to the saved value is clean');
});

test('Save All passes authoritative persisted values to each captured commit', async () => {
  const coordinator = createCaseEditorCoordinator();
  let committed = null;
  coordinator.register('caption', {
    isDirty: () => true,
    prepareSave: () => '  submitted  ',
    saveAllPayload: (snapshot) => ({ snapshot }),
    commitSaveAll: (prepared, authoritative) => { committed = { prepared, authoritative }; }
  });

  const result = await coordinator.saveAll(async () => ({ ok: true, authoritative: ['submitted'] }));
  assert.deepEqual(result, { attempted: 1, succeeded: 1, failed: 0 });
  assert.deepEqual(committed, { prepared: '  submitted  ', authoritative: 'submitted' });
});

test('failed coordinated save leaves the draft dirty', async () => {
  const coordinator = createCaseEditorCoordinator();
  let draft = 'Changed';
  const baseline = 'Original';
  coordinator.register('caption', { label: 'Always-shown image', isDirty: () => draft !== baseline, prepareSave: () => draft, saveAllPayload: () => ({}), commitSaveAll: () => {} });
  const result = await coordinator.saveAll(async () => false);
  assert.deepEqual(result, { attempted: 1, succeeded: 0, failed: 1 });
  assert.equal(coordinator.dirtyItems()[0].label, 'Always-shown image');
});

test('rejected Save All request reports failure and leaves captured drafts dirty', async () => {
  const coordinator = createCaseEditorCoordinator();
  let draft = 'Changed';
  const baseline = 'Original';
  coordinator.register('caption', {
    label: 'Always-shown image',
    isDirty: () => draft !== baseline,
    prepareSave: () => draft,
    saveAllPayload: (snapshot) => ({ snapshot }),
    commitSaveAll: () => { draft = baseline; }
  });

  const result = await coordinator.saveAll(async () => {
    throw new TypeError('network failed');
  });

  assert.deepEqual(result, { attempted: 1, succeeded: 0, failed: 1 });
  assert.equal(coordinator.isSavingAll(), false);
  assert.equal(coordinator.dirtyItems()[0].label, 'Always-shown image');
});

test('Save All skips structural work and saves every saveable snapshot', async () => {
  const coordinator = createCaseEditorCoordinator();
  let structuralDirty = true;
  let detailsDirty = true;
  coordinator.register('structural:add-question', {
    label: 'Add Case question',
    saveable: false,
    isDirty: () => structuralDirty
  });
  coordinator.register('case-details', {
    label: 'Case details',
    isDirty: () => detailsDirty,
    prepareSave: () => 'Updated vignette',
    saveAllPayload: (snapshot) => ({ snapshot }),
    commitSaveAll: () => { detailsDirty = false; }
  });

  const result = await coordinator.saveAll(async (drafts) => {
    assert.deepEqual(drafts, [{ snapshot: 'Updated vignette' }]);
    return true;
  });

  assert.deepEqual(result, { attempted: 1, succeeded: 1, failed: 0 });
  assert.deepEqual(coordinator.dirtyItems().map((item) => ({ label: item.label, saveable: item.saveable })), [
    { label: 'Add Case question', saveable: false }
  ]);
  structuralDirty = false;
});

test('Save All captures Case details and Question before either save begins', async () => {
  const coordinator = createCaseEditorCoordinator();
  const events = [];
  let detailsDraft = 'Updated title';
  let questionDraft = 'Updated prompt';
  coordinator.register('case-details', {
    label: 'Case details',
    isDirty: () => Boolean(detailsDraft),
    prepareSave: () => { events.push(`prepare:details:${detailsDraft}`); return detailsDraft; },
    saveAllPayload: (snapshot) => ({ snapshot }),
    commitSaveAll: (snapshot) => { events.push(`commit:details:${snapshot}`); detailsDraft = ''; }
  });
  coordinator.register('question:q1', {
    label: 'Question 1',
    isDirty: () => Boolean(questionDraft),
    prepareSave: () => { events.push(`prepare:question:${questionDraft}`); return questionDraft; },
    saveAllPayload: (snapshot) => ({ snapshot }),
    commitSaveAll: (snapshot) => { events.push(`commit:question:${snapshot}`); questionDraft = ''; }
  });

  assert.deepEqual(await coordinator.saveAll(async () => true), { attempted: 2, succeeded: 2, failed: 0 });
  assert.deepEqual(events, [
    'prepare:details:Updated title',
    'prepare:question:Updated prompt',
    'commit:details:Updated title',
    'commit:question:Updated prompt'
  ]);
});

test('structural successful submit rebaselines the submitted form', () => {
  const coordinator = createCaseEditorCoordinator();
  let baseline = { value: 'Old System' };
  let current = { value: 'New System' };
  coordinator.register('structural:system', {
    saveable: false,
    isDirty: () => current.value !== baseline.value,
    rebaseline: (snapshot) => { baseline = snapshot; }
  });
  assert.equal(coordinator.dirtyItems().length, 1);
  assert.equal(coordinator.rebaseline('structural:system', { value: 'New System' }), true);
  assert.deepEqual(coordinator.dirtyItems(), []);
});

test('contextual structural labels identify Topic and System controls', () => {
  const createTopic = fakeForm('?/createCaseTopic', new FakeInput('name', 'text', 'Old'));
  createTopic.elements[0].value = 'New';
  assert.deepEqual(changedFormFieldLabels(createTopic, [{ name: 'name', type: 'text', value: 'Old' }]), ['Topic name']);
  const primaryTopic = fakeForm('?/promoteTopic', new FakeInput('', 'search', 'Old topic'));
  primaryTopic.elements[0].value = 'New topic';
  assert.deepEqual(changedFormFieldLabels(primaryTopic, [{ name: '', type: 'search', value: 'Old topic' }]), ['Topic search']);
});

test('structural topology filter ignores status-node mutations', () => {
  const statusNode = { nodeType: 1, matches: () => false, querySelector: () => null };
  const formNode = { nodeType: 1, matches: (selector) => selector.includes('form'), querySelector: () => null };
  const controlNode = { nodeType: 1, matches: (selector) => selector.includes('textarea'), querySelector: () => null };
  assert.equal(mutationMayChangeEditorFormTopology([{ addedNodes: [statusNode], removedNodes: [] }]), false);
  assert.equal(mutationMayChangeEditorFormTopology([{ addedNodes: [formNode], removedNodes: [] }]), true);
  assert.equal(mutationMayChangeEditorFormTopology([{ addedNodes: [], removedNodes: [controlNode] }]), true);
});

test('Save All header remains available when structural items are also dirty', () => {
  const header = readFileSync(new URL('../src/lib/components/case-editor/CaseEditorHeader.svelte', import.meta.url), 'utf8');
  assert.match(header, /\{#if saveableCount\}<button class="button primary save-all-button"/);
  assert.doesNotMatch(header, /saveableCount && !structuralItems\.length/);
  assert.doesNotMatch(header, /caseEditorUnsavedWorkMessage/);
});

test('coordinated enhancer captures the stable result before reading reconciliation snapshots', () => {
  const mutation = readFileSync(new URL('../src/lib/case-editor-mutation.js', import.meta.url), 'utf8');
  assert.match(mutation, /outcome = await stable\(\{ result \}\);\s*ok = outcome\.ok;/);
  assert.doesNotMatch(mutation, /ok = \(await stable\(\{ result \}\)\)\.ok;[\s\S]{0,180}outcome\./);
  assert.match(mutation, /baseline = outcome\.deferred \? outcome\.submittedSnapshot : outcome\.authoritativeSnapshot \?\? outcome\.submittedSnapshot/);
  assert.match(mutation, /rebaseline\(snapshot\)/);
});
