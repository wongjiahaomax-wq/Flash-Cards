// @ts-nocheck

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '$app/forms') {
      return {
        url: 'data:text/javascript,export%20async%20function%20applyAction(result)%7Bawait%20globalThis.__caseEditorApplyAction%3F.(result)%7D%20export%20function%20enhance()%7Bthrow%20new%20Error(%22enhance%20is%20not%20used%20in%20this%20test%22)%7D',
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

test('individual save names other saveable and structural work instead of preserving it', async () => {
  const { caseEditorUnsavedWorkMessage } = await import('../src/lib/case-editor-mutation.js');
  globalThis.document = { querySelectorAll: () => [], querySelector: () => null };
  const detailsForm = { id: 'case-details-form', classList: { contains: () => false }, hasAttribute: () => false };
  const message = caseEditorUnsavedWorkMessage(detailsForm, {
    dirtyItems: () => [
      { key: 'case-details', label: 'Case details', fields: ['Vignette'], saveable: true },
      { key: 'question:2', label: 'Question 2', fields: ['Answer'], saveable: true },
      { key: 'structural:topic', label: 'Primary Topic replacement', fields: ['Topic search'], saveable: false }
    ]
  });
  assert.match(message, /Question 2 — Answer/);
  assert.match(message, /Save all changes instead/);
  assert.match(message, /Primary Topic replacement/);
  assert.match(message, /Submit or discard it first/);
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
