// @ts-nocheck

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '$app/forms') {
      return {
        url: 'data:text/javascript,export%20async%20function%20applyAction()%7B%7D%20export%20function%20enhance(node%2C%20callback)%7Breturn%20globalThis.__stableFormEnhance(node%2C%20callback)%7D',
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

class FakeForm {
  constructor(name) {
    this.name = name;
    this.id = '';
    this.nodeType = 1;
    this.isConnected = true;
    this.dataset = {};
    this.classList = { contains: () => false };
  }
  getAttribute(name) { return name === 'action' ? '?/saveQuestion' : null; }
  matches(selector) { return selector.includes('form'); }
  hasAttribute(name) {
    if (name === 'data-case-editor-enhanced') return this.dataset.caseEditorEnhanced === 'true';
    return false;
  }
  querySelector() { return null; }
}

test('stable structural enhancements survive repeated topology syncs and clean up only removed forms', async () => {
  const { registerCaseEditorStableForms } = await import('../src/lib/case-editor-mutation.js');
  globalThis.HTMLFormElement = FakeForm;

  const first = new FakeForm('first');
  const second = new FakeForm('second');
  let forms = [first];
  let observerCallback;
  const enhanceCounts = new Map();
  const destroyCounts = new Map();

  globalThis.__stableFormEnhance = (form) => {
    enhanceCounts.set(form, (enhanceCounts.get(form) ?? 0) + 1);
    return {
      destroy() { destroyCounts.set(form, (destroyCounts.get(form) ?? 0) + 1); }
    };
  };
  globalThis.MutationObserver = class {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  };
  globalThis.document = {
    body: {},
    querySelector: () => ({}),
    querySelectorAll: () => forms
  };

  const dispose = registerCaseEditorStableForms(() => {});
  assert.equal(enhanceCounts.get(first), 1);
  assert.equal(first.dataset.caseEditorEnhanced, 'true');

  forms = [first, second];
  observerCallback([{ addedNodes: [second], removedNodes: [] }]);
  assert.equal(enhanceCounts.get(first), 1, 'existing form must not be re-enhanced');
  assert.equal(destroyCounts.get(first) ?? 0, 0, 'existing form must not be destroyed');
  assert.equal(enhanceCounts.get(second), 1, 'new form should be enhanced once');
  assert.equal(first.dataset.caseEditorEnhanced, 'true');
  assert.equal(second.dataset.caseEditorEnhanced, 'true');

  observerCallback([{ addedNodes: [{ nodeType: 1, matches: (selector) => selector.includes('input'), querySelector: () => null }], removedNodes: [] }]);
  assert.equal(enhanceCounts.get(first), 1);
  assert.equal(enhanceCounts.get(second), 1);
  assert.equal(destroyCounts.get(first) ?? 0, 0);
  assert.equal(destroyCounts.get(second) ?? 0, 0);

  first.isConnected = false;
  forms = [second];
  observerCallback([{ addedNodes: [], removedNodes: [first] }]);
  assert.equal(destroyCounts.get(first), 1, 'removed form should be destroyed once');
  assert.equal(first.dataset.caseEditorEnhanced, undefined);
  assert.equal(destroyCounts.get(second) ?? 0, 0, 'remaining form must stay enhanced');
  assert.equal(second.dataset.caseEditorEnhanced, 'true');

  dispose();
  assert.equal(destroyCounts.get(second), 1, 'dispose should clean up the remaining registration');
});

test('standalone endpoint forms remain native while named page actions are enhanced', async () => {
  const { registerCaseEditorStableForms } = await import('../src/lib/case-editor-mutation.js');
  globalThis.HTMLFormElement = FakeForm;
  const endpoint = new FakeForm('endpoint');
  endpoint.getAttribute = (name) => name === 'action' ? '/admin/cases/case-1/question-scope' : null;
  const pageAction = new FakeForm('page-action');
  let forms = [endpoint];
  let observerCallback;
  const enhanced = [];
  globalThis.__stableFormEnhance = (form) => {
    enhanced.push(form);
    return { destroy() {} };
  };
  globalThis.MutationObserver = class {
    constructor(callback) { observerCallback = callback; }
    observe() {}
    disconnect() {}
  };
  globalThis.document = {
    body: {},
    querySelector: () => ({}),
    querySelectorAll: () => forms
  };

  const dispose = registerCaseEditorStableForms(() => {});
  assert.deepEqual(enhanced, []);
  forms = [endpoint, pageAction];
  observerCallback([{ addedNodes: [pageAction], removedNodes: [] }]);
  assert.deepEqual(enhanced, [pageAction]);
  dispose();
});
