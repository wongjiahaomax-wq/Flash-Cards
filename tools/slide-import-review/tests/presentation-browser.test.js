import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createOperationGuard } from '../src/operation-guard.js';

function makeElement(overrides = {}) {
  const listeners = new Map();
  return {
    disabled: false,
    hidden: false,
    value: 'all',
    textContent: '',
    innerHTML: '',
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {},
    scrollIntoView() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    listener(type) { return listeners.get(type); },
    click() { return this.onclick?.(); },
    ...overrides
  };
}

function makeBundle({ sourceIds = ['source-1', 'source-2'] } = {}) {
  const sourceCoverage = sourceIds.flatMap((sourceId, index) => [3, 4].map(page => ({
    sourceId,
    page,
    classification: 'case',
    caseIds: ['case-1'],
    notes: null,
    previewPath: `source-previews/${sourceId}-page-${page}.jpg`
  })));
  const files = new Map(sourceCoverage.map(item => [item.previewPath, new Uint8Array([1, item.page + sourceIds.indexOf(item.sourceId)])]));
  files.overrides = new Map();
  files.getFile = async path => files.get(path);
  const answerSourceId = sourceIds[1] ?? sourceIds[0];
  const question = { id: 'question-1', caseId: 'case-1', questionPromptId: 'prompt-1', answerMd: 'Answer' };
  const questionReview = {
    caseQuestionId: question.id,
    reviewStatus: 'pending',
    confidence: 'high',
    warnings: [],
    promptSourceRefs: [{ sourceId: sourceIds[0], pages: [3] }],
    answerSourceRefs: [{ sourceId: answerSourceId, pages: [4] }],
    reviewNotes: []
  };
  return {
    files,
    manifest: {
      version: 1,
      packageId: 'presentation-browser-test',
      topics: [],
      cases: [{ id: 'case-1', title: 'Presentation Case', vignetteMd: 'Vignette', primaryTopicId: null, secondaryTopicIds: [] }],
      assets: [],
      caseAssets: [],
      questionPrompts: [{ id: 'prompt-1', promptMd: 'Prompt' }],
      caseQuestions: [question],
      topicQuestions: []
    },
    reviewMap: {
      version: 1,
      bundleId: 'presentation-browser-bundle',
      batchName: 'Presentation browser test',
      sourceFiles: sourceIds.map(sourceId => ({ sourceId, filename: `${sourceId}.pdf`, repository: null, path: null, ref: null, pageCount: 4 })),
      sourceCoverage,
      batchWarnings: [],
      unresolvedQuestions: [],
      cases: [{
        caseId: 'case-1',
        reviewStatus: 'pending',
        confidence: 'high',
        warnings: [],
        sourceRefs: [{ sourceId: sourceIds[0], pages: [3] }],
        caseBoundaryNotes: null,
        assets: [],
        questions: [questionReview],
        reviewNotes: []
      }]
    }
  };
}

function loadHarness() {
  let source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
  source = source.replace(/import\s+\{[\s\S]*?\}\s+from\s+'\.\/[^']+';\n/g, '');
  source += `
globalThis.__presentationTest = {
  setBundle(nextBundle) {
    bundle = nextBundle;
    bundleFingerprint = 'test-fingerprint';
    loadGeneration = 1;
    saveGeneration = 1;
    rebuildIndexes();
    visibleCases = bundle.reviewMap.cases;
    index = 0;
    selectedSourcePath = null;
  },
  setRender(fn) { renderCurrent = fn; },
  refsHtml,
  questionCard,
  wireCurrent,
  loadFile,
  current() { return { bundle, index, visibleCases, selectedSourcePath }; }
};
`;
  const elements = new Map();
  const selectorResults = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelector(selector) {
      if (selector.startsWith('[data-source-path=')) return selectorResults.get('.source-ref')?.[0] ?? null;
      return null;
    },
    querySelectorAll(selector) { return selectorResults.get(selector) ?? []; },
    addEventListener() {},
    createElement() { return makeElement(); }
  };
  const window = { addEventListener() {}, confirm: () => false };
  let objectUrl = 0;
  const URLApi = { createObjectURL() { objectUrl += 1; return `blob:presentation-${objectUrl}`; }, revokeObjectURL() {} };
  const context = {
    console,
    document,
    window,
    CSS: { escape: value => value },
    URL: URLApi,
    Blob,
    Map,
    Set,
    Date,
    Promise,
    Uint8Array,
    structuredClone,
    setTimeout,
    clearTimeout,
    ReviewBundleError: class ReviewBundleError extends Error {
      constructor(message, issues = []) { super(message); this.issues = issues.length ? issues : [message]; }
    },
    loadReviewBundle: async () => null,
    exportReviewedBundle: () => new Uint8Array(),
    finalizeBundle: async () => ({ zip: new Uint8Array() }),
    resolveUnresolvedQuestion() {},
    rejectUnresolvedQuestion() {},
    detectImageType: () => null,
    sha256Hex: async () => 'test-fingerprint',
    PRODUCTION_LIMITS: { maxImageBytes: 10_000_000 },
    persistedStateMatches: () => false,
    createAutosaveCoordinator: () => ({ flush: async () => true, active: null }),
    trimResourceUrlCache() {},
    hasActiveMissingAnswer: () => false,
    createOperationGuard
  };
  vm.runInNewContext(source, context, { filename: 'slide-review-presentation-app.js' });
  return { context, harness: context.__presentationTest, elements, selectorResults };
}

test('multi-source provenance preserves source identity and clickable selection while single-source bundles stay compact', async () => {
  const { harness, selectorResults, elements } = loadHarness();
  const multiSourceBundle = makeBundle();
  harness.setBundle(multiSourceBundle);
  const questionReview = multiSourceBundle.reviewMap.cases[0].questions[0];
  const multiSourceHtml = harness.questionCard(multiSourceBundle.manifest.caseQuestions[0], questionReview, 1);
  assert.match(multiSourceHtml, /source-1 p\.3/);
  assert.match(multiSourceHtml, /source-2 p\.4/);
  assert.match(multiSourceHtml, /data-source-path="source-previews\/source-2-page-4\.jpg"/);

  const link = makeElement({ dataset: { sourcePath: 'source-previews/source-2-page-4.jpg' } });
  selectorResults.set('.source-ref', [link]);
  selectorResults.set('.thumb', []);
  elements.set('source-large', makeElement());
  elements.get('source-large').innerHTML = '<img src="before">';
  harness.wireCurrent(multiSourceBundle.reviewMap.cases[0]);
  let prevented = false;
  await link.listener('click')({ preventDefault() { prevented = true; } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(prevented, true);
  assert.equal(harness.current().selectedSourcePath, 'source-previews/source-2-page-4.jpg');
  assert.match(elements.get('source-large').innerHTML, /blob:presentation-1/);

  const singleSourceBundle = makeBundle({ sourceIds: ['source-1'] });
  harness.setBundle(singleSourceBundle);
  const compactHtml = harness.questionCard(singleSourceBundle.manifest.caseQuestions[0], singleSourceBundle.reviewMap.cases[0].questions[0], 1);
  assert.match(compactHtml, />p\.3<\/button>/);
  assert.match(compactHtml, />p\.4<\/button>/);
  assert.doesNotMatch(compactHtml, /source-1 p\./);
});

test('styled file input keeps the real onchange load path executable', async () => {
  const { context, harness, elements } = loadHarness();
  harness.setRender(async () => {});
  const opened = { name: 'bundle-review.zip', arrayBuffer: async () => new ArrayBuffer(0) };
  let received = null;
  context.loadReviewBundle = async input => { received = input; return makeBundle({ sourceIds: ['source-1'] }); };
  await elements.get('zip-input').onchange({ target: { files: [opened] } });
  assert.equal(received, opened);
  assert.equal(elements.get('empty-start').hidden, true);
  assert.equal(elements.get('review-shell').hidden, false);
  assert.equal(elements.get('batch').textContent, 'Presentation browser test');
});
