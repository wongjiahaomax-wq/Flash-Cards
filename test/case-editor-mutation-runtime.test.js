// @ts-nocheck

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '$app/forms') {
      return {
        url: 'data:text/javascript,export%20async%20function%20applyAction(result)%7Bawait%20globalThis.__caseEditorApplyAction%3F.(result)%7D%20export%20function%20enhance(node%2C%20callback)%7Breturn%20globalThis.__caseEditorEnhance%3F.(node%2C%20callback)%20%7C%7C%20%7Bdestroy()%7B%7D%7D%7D',
        shortCircuit: true
      };
    }
    if (specifier === '$app/navigation') {
      return {
        url: 'data:text/javascript,export%20async%20function%20invalidateAll()%7Bawait%20globalThis.__caseEditorInvalidateAll%3F.()%7D%20export%20function%20replaceState()%7B%7D',
        shortCircuit: true
      };
    }
    if (specifier.startsWith('$lib/')) {
      return { url: new URL(`../src/lib/${specifier.slice('$lib/'.length)}`, import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

class FakeTextarea {
  constructor(name, value) {
    this.name = name;
    this.type = 'textarea';
    this.value = value;
    this.events = [];
  }
  dispatchEvent(event) {
    this.events.push(event.type);
    return true;
  }
}

globalThis.HTMLInputElement = class FakeInput {};
globalThis.HTMLTextAreaElement = FakeTextarea;
globalThis.HTMLSelectElement = class FakeSelect {};

test('successful coordinated save preserves the authoritative visible value without native reset', async () => {
  const { stableCaseEditorEnhance } = await import('../src/lib/case-editor-mutation.js');
  const control = new FakeTextarea('caption', 'Original caption');
  const form = {
    elements: [control],
    isConnected: true,
    getAttribute: (name) => name === 'action' ? '?/caption' : null,
    querySelectorAll: () => [],
    reset() { throw new Error('coordinated save must not reset the existing form'); }
  };
  globalThis.document = { querySelectorAll: () => [] };
  globalThis.__caseEditorApplyAction = async () => { control.value = 'Saved caption'; };

  const handle = stableCaseEditorEnhance({}, form, { reconcileSubmittedDraft: true, logicalKey: 'caption:asset-1' });
  const outcome = await handle({ result: { type: 'success' } });

  assert.equal(outcome.ok, true);
  assert.equal(control.value, 'Saved caption');
  assert.deepEqual(outcome.authoritativeSnapshot, [{ name: 'caption', type: 'textarea', value: 'Saved caption' }]);
});

test('redirect Case and Question saves preserve visible values for retained and replaced forms', async () => {
  const { stableCaseEditorEnhance } = await import('../src/lib/case-editor-mutation.js');
  const scenarios = [
    ['Save Case', '?/updateCase', 'title'],
    ['Save Question', '?/saveQuestion', 'prompt_md']
  ];

  for (const [label, action, fieldName] of scenarios) {
    for (const replaced of [false, true]) {
      const originalControl = new FakeTextarea(fieldName, `Original ${label}`);
      const originalForm = {
        elements: [originalControl],
        isConnected: true,
        dataset: { caseEditorLogicalKey: `${label}:logical` },
        getAttribute: (name) => name === 'action' ? action : null,
        querySelectorAll: () => [],
        reset() { throw new Error(`${label} must not use native reset`); }
      };
      const savedControl = new FakeTextarea(fieldName, `Saved ${label}`);
      const savedForm = {
        elements: [savedControl],
        isConnected: true,
        dataset: { caseEditorLogicalKey: `${label}:logical` },
        getAttribute: (name) => name === 'action' ? action : null,
        querySelectorAll: () => [],
        reset() { throw new Error(`${label} must not use native reset`); }
      };
      let currentForm = originalForm;
      globalThis.document = {
        baseURI: 'https://example.test/admin/cases/case-1',
        querySelectorAll: () => [currentForm]
      };
      globalThis.window = { scrollTo() {} };
      globalThis.__caseEditorInvalidateAll = async () => {
        if (replaced) {
          originalForm.isConnected = false;
          currentForm = savedForm;
        } else {
          originalControl.value = savedControl.value;
        }
      };

      const handle = stableCaseEditorEnhance(
        { scrollX: 0, scrollY: 0, activeElement: null, selectionStart: null, selectionEnd: null },
        originalForm,
        { reconcileSubmittedDraft: true, logicalKey: `${label}:logical` }
      );
      const outcome = await handle({ result: { type: 'redirect', location: '/admin/cases/case-1?status=case-saved' } });

      assert.equal(outcome.ok, true, `${label} redirect should succeed`);
      assert.equal(currentForm.elements[0].value, `Saved ${label}`, `${label} should retain the saved visible value (${replaced ? 'replaced' : 'retained'})`);
      assert.deepEqual(outcome.postSuccessSnapshot, [{ name: fieldName, type: 'textarea', value: `Saved ${label}` }]);
    }
  }
});

test('successful save does not reconstruct an unrelated form', async () => {
  const { stableCaseEditorEnhance } = await import('../src/lib/case-editor-mutation.js');
  const submittedControl = new FakeTextarea('title', 'Original title');
  const submittedForm = {
    elements: [submittedControl],
    isConnected: true,
    dataset: {},
    getAttribute: (name) => name === 'action' ? '?/updateCase' : null,
    querySelectorAll: () => []
  };
  const unrelatedControl = new FakeTextarea('prompt_md', 'Unsaved prompt');
  const unrelatedForm = {
    elements: [unrelatedControl],
    isConnected: true,
    getAttribute: (name) => name === 'action' ? '?/saveQuestion' : null,
    querySelectorAll: () => []
  };
  globalThis.document = {
    baseURI: 'https://example.test/admin/cases/case-1',
    querySelectorAll: () => [submittedForm, unrelatedForm]
  };
  globalThis.window = { scrollTo() {} };
  globalThis.__caseEditorInvalidateAll = async () => {
    unrelatedControl.value = 'Server-rendered prompt';
  };

  const handle = stableCaseEditorEnhance(
    { scrollX: 0, scrollY: 0, activeElement: null, selectionStart: null, selectionEnd: null },
    submittedForm,
    { reconcileSubmittedDraft: true }
  );
  await handle({ result: { type: 'redirect', location: '/admin/cases/case-1?status=case-saved' } });

  assert.equal(unrelatedControl.value, 'Server-rendered prompt');
});

test('two captured generic saves defer invalidation and retain a newer edit after partial completion', async () => {
  const { stableCaseEditorEnhance } = await import('../src/lib/case-editor-mutation.js');
  const makeForm = (key, value) => {
    const control = new FakeTextarea('caption', value);
    return {
      elements: [control], isConnected: true, dataset: { caseEditorLogicalKey: key },
      getAttribute: () => '?/saveCaption', querySelectorAll: () => []
    };
  };
  const first = makeForm('caption:one', 'First submitted');
  const second = makeForm('caption:two', 'Second submitted');
  globalThis.document = { baseURI: 'https://example.test/admin/cases/case-1', querySelectorAll: () => [first, second] };
  globalThis.window = { scrollTo() {} };
  let invalidations = 0;
  globalThis.__caseEditorInvalidateAll = async () => { invalidations += 1; };
  const firstSnapshot = [{ name: 'caption', type: 'textarea', value: 'First submitted' }];
  const secondSnapshot = [{ name: 'caption', type: 'textarea', value: 'Second submitted' }];
  const firstSave = stableCaseEditorEnhance({}, first, { reconcileSubmittedDraft: true, logicalKey: 'caption:one', deferInvalidation: true, submittedSnapshot: firstSnapshot });
  const secondSave = stableCaseEditorEnhance({}, second, { reconcileSubmittedDraft: true, logicalKey: 'caption:two', deferInvalidation: true, submittedSnapshot: secondSnapshot });

  second.elements[0].value = 'Second newer edit';
  const [firstOutcome, secondOutcome] = await Promise.all([
    firstSave({ result: { type: 'redirect', location: '/admin/cases/case-1?status=saved' } }),
    secondSave({ result: { type: 'redirect', location: '/admin/cases/case-1?status=saved' } })
  ]);

  assert.equal(firstOutcome.deferred, true);
  assert.equal(secondOutcome.deferred, true);
  assert.equal(invalidations, 0, 'a partial batch must not remount either generic form');
  assert.deepEqual(secondOutcome.submittedSnapshot, secondSnapshot);
  assert.equal(second.elements[0].value, 'Second newer edit');
});

test('individual save permits other saveable work but still blocks structural work', async () => {
  const { caseEditorUnsavedWorkMessage } = await import('../src/lib/case-editor-mutation.js');
  globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
  const detailsForm = { id: 'case-details-form', classList: { contains: () => false }, hasAttribute: () => false };
  const message = caseEditorUnsavedWorkMessage(detailsForm, {
    dirtyItems: () => [
      { key: 'case-details', label: 'Case details', fields: ['Vignette'], saveable: true },
      { key: 'question:2', label: 'Question 2', fields: ['Answer'], saveable: true },
      { key: 'structural:topic', label: 'Primary Topic replacement', fields: ['Topic search'], saveable: false }
    ]
  }, { allowSaveableWork: true });
  assert.doesNotMatch(message, /Question 2 — Answer/);
  assert.doesNotMatch(message, /Save all changes instead/);
  assert.match(message, /Primary Topic replacement/);
  assert.match(message, /Submit or discard it first/);
});

test('registered structural baselines ignore Svelte-initialized default mismatches', async () => {
  const { caseEditorUnsavedWorkMessage } = await import('../src/lib/case-editor-mutation.js');
  const previousForm = globalThis.HTMLFormElement;
  const previousSelect = globalThis.HTMLSelectElement;
  class FakeForm {}
  class FakeSelect {}
  globalThis.HTMLFormElement = FakeForm;
  globalThis.HTMLSelectElement = FakeSelect;
  const initializedSelect = Object.assign(new FakeSelect(), {
    options: [{ selected: true, defaultSelected: false }, { selected: false, defaultSelected: false }]
  });
  const registeredStructuralForm = Object.assign(new FakeForm(), {
    id: '',
    dataset: { caseEditorStructuralKey: 'structural:question-scope' },
    elements: [initializedSelect],
    classList: { contains: () => false },
    hasAttribute: () => false
  });
  try {
    globalThis.document = {
      querySelectorAll: () => [registeredStructuralForm],
      querySelector: () => null
    };
    const message = caseEditorUnsavedWorkMessage({ id: 'case-details-form', classList: { contains: () => false }, hasAttribute: () => false }, {
      dirtyItems: () => []
    }, { allowSaveableWork: true });
    assert.equal(message, '');
  } finally {
    globalThis.HTMLFormElement = previousForm;
    globalThis.HTMLSelectElement = previousSelect;
  }
});

test('individual save can preserve another structural draft', async () => {
  const { caseEditorUnsavedWorkMessage } = await import('../src/lib/case-editor-mutation.js');
  globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
  const message = caseEditorUnsavedWorkMessage({ id: 'case-details-form', classList: { contains: () => false }, hasAttribute: () => false }, {
    dirtyItems: () => [{ key: 'structural:new-question', label: 'Add Case question', fields: ['Prompt'], saveable: false }]
  }, { allowSaveableWork: true, allowStructuralWork: true });
  assert.equal(message, '');
});

test('Save All is blocked by named structural work', async () => {
  const { caseEditorUnsavedWorkMessage } = await import('../src/lib/case-editor-mutation.js');
  globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
  const message = caseEditorUnsavedWorkMessage(null, {
    dirtyItems: () => [{ key: 'structural:question', label: 'Add Case question', fields: ['Prompt'], saveable: false }]
  });
  assert.match(message, /Add Case question/);
  assert.match(message, /Submit or discard it first/);
  assert.doesNotMatch(message, /Save all changes instead/);
});

test('structural tracking does not rescan or refresh for status-only DOM mutations', async () => {
  const { registerCaseEditorStructuralForms } = await import('../src/lib/case-editor-mutation.js');
  class FakeForm {
    constructor() {
      this.elements = [new FakeTextarea('prompt_md', 'Saved prompt')];
      this.isConnected = true;
      this.dataset = {};
      this.id = '';
      this.classList = { contains: () => false };
      this.listeners = {};
    }
    getAttribute(name) { return name === 'action' ? '?/saveQuestion' : null; }
    matches(selector) { return selector === '.case-editor form'; }
    hasAttribute() { return false; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    removeEventListener() {}
    append(node) { this.status = node; }
  }
  const form = new FakeForm();
  const statusNode = {
    nodeType: 1,
    matches: () => false,
    querySelector: () => null,
    setAttribute() {},
    remove() {}
  };
  let queryCount = 0;
  let observerCallback;
  let registrations = 0;
  let refreshes = 0;
  globalThis.HTMLFormElement = FakeForm;
  globalThis.MutationObserver = class {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  };
  globalThis.document = {
    body: {},
    querySelectorAll: () => { queryCount += 1; return [form]; },
    querySelector: () => ({}) ,
    createElement: () => statusNode
  };
  const dispose = registerCaseEditorStructuralForms({
    register() { registrations += 1; return () => {}; },
    refresh() { refreshes += 1; }
  });
  const initialQueries = queryCount;
  observerCallback([{ addedNodes: [statusNode], removedNodes: [] }]);
  assert.equal(registrations, 1);
  assert.equal(refreshes, 0);
  assert.equal(queryCount, initialQueries);
  dispose();
});

test('generic coordinated Save All submits hidden IDs and checked values for multiple forms', async () => {
  const { registerCaseEditorForm } = await import('../src/lib/case-editor-mutation.js');
  const { createCaseEditorCoordinator } = await import('../src/lib/case-editor-coordinator.js');
  const Input = globalThis.HTMLInputElement;
  const makeInput = (name, type, value) => Object.assign(new Input(), { name, type, value });
  const makeForm = (action, controls, entries) => ({
    elements: controls,
    submissionEntries: entries,
    listeners: {},
    isConnected: true,
    dataset: {},
    getAttribute: (name) => name === 'action' ? action : null,
    querySelectorAll: () => [],
    addEventListener(type, listener) { this.listeners[type] = listener; },
    removeEventListener() {},
    append() {},
    reportValidity: () => true,
    requestSubmit() {}
  });
  const caption = new FakeTextarea('caption', 'Changed caption');
  const captionForm = makeForm('?/caption', [
    makeInput('case_id', 'hidden', 'case-1'),
    makeInput('asset_id', 'hidden', 'asset-1'),
    caption
  ], () => [['case_id', 'case-1'], ['asset_id', 'asset-1'], ['caption', caption.value]]);
  const active = makeInput('is_active', 'checkbox', 'on');
  active.checked = true;
  const groupForm = makeForm('?/updateStimulusGroup', [
    makeInput('case_id', 'hidden', 'case-1'),
    makeInput('group_id', 'hidden', 'group-1'),
    makeInput('name', 'text', 'ECG'),
    active
  ], () => [['case_id', 'case-1'], ['group_id', 'group-1'], ['name', groupForm.elements[2].value], ['is_active', 'on']]);
  const previousFormData = globalThis.FormData;
  globalThis.FormData = class {
    constructor(form) { this.values = form.submissionEntries(); }
    entries() { return this.values[Symbol.iterator](); }
  };
  globalThis.document = { createElement: () => ({ classList: { remove() {}, toggle() {} }, setAttribute() {}, remove() {} }) };
  globalThis.__caseEditorEnhance = () => ({ destroy() {} });
  const coordinator = createCaseEditorCoordinator();
  registerCaseEditorForm(captionForm, { coordinator, key: 'caption:asset-1' });
  registerCaseEditorForm(groupForm, { coordinator, key: 'group-settings:group-1' });
  captionForm.elements[2].value = 'Changed caption again';
  groupForm.elements[2].value = 'ECG revised';
  captionForm.listeners.input();
  groupForm.listeners.input();
  let payload;
  const result = await coordinator.saveAll(async (drafts) => { payload = drafts; return true; });

  assert.deepEqual(result, { attempted: 2, succeeded: 2, failed: 0 });
  assert.deepEqual(payload, [
    { kind: 'form', action: '?/caption', fields: [
      { name: 'case_id', value: 'case-1' },
      { name: 'asset_id', value: 'asset-1' },
      { name: 'caption', value: 'Changed caption again' }
    ] },
    { kind: 'form', action: '?/updateStimulusGroup', fields: [
      { name: 'case_id', value: 'case-1' },
      { name: 'group_id', value: 'group-1' },
      { name: 'name', value: 'ECG revised' },
      { name: 'is_active', value: 'on' }
    ] }
  ]);
  globalThis.FormData = previousFormData;
});

test('a structural form mounted after startup is enhanced and keeps a dirty Case draft on submit', async () => {
  const { registerCaseEditorStableForms, stableCaseEditorEnhance } = await import('../src/lib/case-editor-mutation.js');
  const { createCaseEditorCoordinator } = await import('../src/lib/case-editor-coordinator.js');
  class FakeForm {
    constructor() {
      this.elements = [new FakeTextarea('prompt_md', '')];
      this.isConnected = true;
      this.nodeType = 1;
      this.dataset = {};
      this.id = '';
      this.classList = { contains: () => false };
      this.listeners = {};
    }
    matches(selector) { return selector.includes('form'); }
    hasAttribute() { return false; }
    querySelector() { return null; }
    getAttribute(name) { return name === 'action' ? '?/saveStimulusOptionQuestion' : null; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    removeEventListener() {}
    querySelectorAll() { return []; }
  }
  const form = new FakeForm();
  let forms = [];
  let observerCallback;
  let enhancedCallback;
  globalThis.HTMLFormElement = FakeForm;
  globalThis.MutationObserver = class {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  };
  globalThis.document = {
    body: {},
    baseURI: 'https://example.test/admin/cases/case-1',
    querySelector: () => ({}),
    querySelectorAll: () => forms,
    createElement: () => ({ classList: { remove() {}, toggle() {} }, setAttribute() {}, remove() {} })
  };
  globalThis.__caseEditorEnhance = (_node, callback) => { enhancedCallback = callback; return { destroy() {} }; };
  globalThis.window = { scrollTo() {} };
  const coordinator = createCaseEditorCoordinator();
  let detailsDirty = true;
  coordinator.register('case-details', { label: 'Case details', isDirty: () => detailsDirty });
  const dispose = registerCaseEditorStableForms(({ formElement, cancel }) => {
    const stable = stableCaseEditorEnhance({}, formElement, { deferInvalidation: true });
    return (context) => stable(context);
  });
  forms = [form];
  observerCallback([{ addedNodes: [form], removedNodes: [] }]);
  assert.equal(form.dataset.caseEditorEnhanced, 'true');
  assert.ok(enhancedCallback, 'the later-mounted structural form should receive enhancement');
  const outcome = await enhancedCallback({ formElement: form, cancel: () => {} })({ result: { type: 'redirect', location: '/admin/cases/case-1?status=saved' } });
  assert.equal(outcome.deferred, true);
  assert.equal(detailsDirty, true, 'the unrelated Case details draft remains dirty');
  assert.equal(coordinator.dirtyItems()[0].key, 'case-details');
  dispose();
});
