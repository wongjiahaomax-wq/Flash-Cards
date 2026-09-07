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
        url: 'data:text/javascript,export%20async%20function%20invalidateAll()%7B%7D%20export%20function%20replaceState()%7B%7D',
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
