// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createCaseEditorCoordinator } from '../src/lib/case-editor-coordinator.js';
import { captureEditableFormSnapshot, formCanHoldMeaningfulStructuralInput, formHasMeaningfulUnsubmittedInputAgainst, mutationMayChangeEditorFormTopology } from '../src/lib/case-editor-form-state.js';

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

function fakeForm(...elements) {
  return { elements };
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

test('selected upload file is part of the dirty snapshot', () => {
  const upload = new FakeInput('image', 'file');
  const form = fakeForm(upload);
  const baseline = captureEditableFormSnapshot(form);
  upload.files = [{ name: 'ecg.png', size: 1234, lastModified: 42, type: 'image/png' }];

  assert.equal(formHasMeaningfulUnsubmittedInputAgainst(form, baseline), true);
  assert.deepEqual(captureEditableFormSnapshot(form)[0].files, [{ name: 'ecg.png', size: 1234, lastModified: 42, type: 'image/png' }]);
});

test('coordinated save establishes a clean baseline but preserves edit-during-save dirtiness', async () => {
  const coordinator = createCaseEditorCoordinator();
  let draft = 'A';
  let baseline = 'A';
  let release;
  coordinator.register('caption', {
    label: 'Always-shown image',
    dirtyFields: () => draft === baseline ? [] : ['Caption'],
    isDirty: () => draft !== baseline,
    save: async () => {
      const submitted = draft;
      await new Promise((resolve) => { release = resolve; });
      if (draft === submitted) baseline = submitted;
      return true;
    }
  });

  draft = 'saved caption';
  const firstSave = coordinator.saveAll();
  release();
  await firstSave;
  assert.equal(coordinator.dirtyItems().length, 0);

  draft = 'newer caption';
  const secondSave = coordinator.saveAll();
  draft = 'edit while saving';
  release();
  await secondSave;
  assert.equal(coordinator.dirtyItems()[0].label, 'Always-shown image');
});

test('structural topology filter ignores status-node mutations', () => {
  const statusNode = { nodeType: 1, matches: () => false, querySelector: () => null };
  const formNode = { nodeType: 1, matches: (selector) => selector === 'form', querySelector: () => null };
  assert.equal(mutationMayChangeEditorFormTopology([{ addedNodes: [statusNode], removedNodes: [] }]), false);
  assert.equal(mutationMayChangeEditorFormTopology([{ addedNodes: [formNode], removedNodes: [] }]), true);
});

test('coordinated enhancer captures the stable result before reading reconciliation snapshots', () => {
  const mutation = readFileSync(new URL('../src/lib/case-editor-mutation.js', import.meta.url), 'utf8');
  assert.match(mutation, /const outcome = await stable\(\{ result \}\);\s*ok = outcome\.ok;/);
  assert.doesNotMatch(mutation, /ok = \(await stable\(\{ result \}\)\)\.ok;[\s\S]{0,180}outcome\./);
});
