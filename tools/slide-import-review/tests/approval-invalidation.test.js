import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const blockingWarning = message => ({ code: 'source_medical_inconsistency', severity: 'blocking', message });

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
    click() { this.onclick?.(); },
    ...overrides
  };
}

function loadBrowserHarness() {
  let source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  source = source.replace(/import\s+\{[\s\S]*?\}\s+from\s+'\.\/[^']+';\n/g, '');
  source += `\n
globalThis.__approvalInvalidationTest = {
  setBundle(nextBundle) {
    bundle = nextBundle;
    bundleFingerprint = 'test-fingerprint';
    loadGeneration = 1;
    saveGeneration = 1;
    rebuildIndexes();
    visibleCases = bundle.reviewMap.cases;
    index = 0;
  },
  stubIo() {
    persist = async () => true;
    renderCurrent = async () => {};
    refreshQueue = () => {};
  },
  wireCurrent,
  approveCurrent,
  current() { return { bundle, indexes }; }
};\n`;

  const elements = new Map();
  const selectorResults = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelectorAll(selector) { return selectorResults.get(selector) ?? []; },
    addEventListener() {}
  };
  const window = { addEventListener() {}, confirm: () => false };
  const context = {
    console,
    document,
    window,
    setTimeout,
    clearTimeout,
    Map,
    Set,
    Date,
    Promise,
    Uint8Array,
    structuredClone,
    ReviewBundleError: class ReviewBundleError extends Error {
      constructor(message, issues = []) { super(message); this.issues = issues; }
    },
    loadReviewBundle: async () => null,
    exportReviewedBundle: () => new Uint8Array(),
    finalizeBundle: async () => ({ zip: new Uint8Array() }),
    resolveUnresolvedQuestion() {},
    rejectUnresolvedQuestion() {},
    detectImageType: () => null,
    sha256Hex: async () => '00',
    PRODUCTION_LIMITS: { maxImageBytes: 10_000_000 },
    persistedStateMatches: () => true,
    createAutosaveCoordinator: () => ({ flush: async () => true, active: null }),
    trimResourceUrlCache() {},
    hasActiveMissingAnswer: () => false,
    createOperationGuard: () => ({ active: null, cancel() {}, begin() { return {}; }, isCurrent() { return true; }, finish() {} })
  };

  vm.runInNewContext(source, context, { filename: 'slide-review-app.js' });
  return { context, harness: context.__approvalInvalidationTest, selectorResults };
}

function reviewQuestion(id, status = 'approved') {
  return {
    caseQuestionId: id,
    reviewStatus: status,
    confidence: 'high',
    warnings: [blockingWarning('Question warning requires reconciliation.')],
    promptSourceRefs: [],
    answerSourceRefs: [],
    reviewNotes: []
  };
}

function reviewAsset(id, status = 'approved') {
  return {
    assetId: id,
    reviewStatus: status,
    confidence: 'high',
    warnings: [blockingWarning('Asset warning requires reconciliation.')],
    sourceRefs: [],
    extractionMethod: 'embedded_original',
    sha256: '00',
    reviewNotes: []
  };
}

function makeBundle({ caseStatus = 'approved', caseWarnings = [], question = null, questionReview = null, asset = null, assetReview = null } = {}) {
  const files = new Map();
  files.overrides = new Map();
  return {
    files,
    manifest: {
      version: 1,
      packageId: 'approval-invalidation-test',
      topics: [{ id: 'topic-1' }],
      cases: [{ id: 'case-1', title: 'Original Case', vignetteMd: 'Original vignette', primaryTopicId: 'topic-1', secondaryTopicIds: [] }],
      assets: asset ? [asset] : [],
      caseAssets: asset ? [{ id: 'case-asset-1', caseId: 'case-1', assetId: asset.id, captionMd: null, displayOrder: 0 }] : [],
      questionPrompts: question ? [{ id: question.questionPromptId, promptMd: 'Original prompt' }] : [],
      caseQuestions: question ? [question] : [],
      topicQuestions: []
    },
    reviewMap: {
      version: 1,
      bundleId: 'approval-invalidation-bundle',
      batchName: 'Approval invalidation test',
      sourceFiles: [],
      sourceCoverage: [],
      batchWarnings: [],
      unresolvedQuestions: [],
      cases: [{
        caseId: 'case-1',
        reviewStatus: caseStatus,
        confidence: 'high',
        warnings: caseWarnings,
        sourceRefs: [],
        caseBoundaryNotes: null,
        assets: assetReview ? [assetReview] : [],
        questions: questionReview ? [questionReview] : [],
        reviewNotes: []
      }]
    }
  };
}

async function fire(element, type = 'change') {
  const listener = element.listener(type);
  assert.equal(typeof listener, 'function');
  await listener();
}

async function tryChildApproval(context, harness, selectorResults, meta, kind, id, confirmResult) {
  const select = makeElement({ value: 'approved', dataset: { statusKind: kind, statusId: id } });
  selectorResults.clear();
  selectorResults.set('[data-status-kind]', [select]);
  context.window.confirm = () => confirmResult;
  harness.wireCurrent(meta);
  await fire(select);
  return select;
}

test('editing an approved warned Case invalidates reconciliation and requires explicit reapproval', async () => {
  const { context, harness, selectorResults } = loadBrowserHarness();
  const warning = blockingWarning('Case warning requires reconciliation.');
  const bundle = makeBundle({ caseStatus: 'approved', caseWarnings: [warning] });
  harness.setBundle(bundle);
  harness.stubIo();
  const meta = bundle.reviewMap.cases[0];
  const title = makeElement({ value: 'Changed Case', dataset: { edit: 'case.title' } });
  selectorResults.set('[data-edit]', [title]);
  harness.wireCurrent(meta);

  await fire(title);
  assert.equal(meta.reviewStatus, 'needs_review');
  assert.deepEqual(meta.warnings, [warning]);

  context.window.confirm = () => false;
  await harness.approveCurrent();
  assert.equal(meta.reviewStatus, 'needs_review');

  context.window.confirm = () => true;
  await harness.approveCurrent();
  assert.equal(meta.reviewStatus, 'approved');
  assert.deepEqual(meta.warnings, [warning]);
});

test('editing an approved warned Question invalidates only that Question and requires explicit child reapproval', async () => {
  const { context, harness, selectorResults } = loadBrowserHarness();
  const relation = { id: 'q-1', caseId: 'case-1', questionPromptId: 'prompt-1', answerMd: 'Original answer' };
  const questionMeta = reviewQuestion('q-1');
  const bundle = makeBundle({ caseStatus: 'approved', question: relation, questionReview: questionMeta });
  harness.setBundle(bundle);
  harness.stubIo();
  const meta = bundle.reviewMap.cases[0];
  const answer = makeElement({ value: 'Changed answer', dataset: { questionField: 'answerMd' } });
  const card = makeElement({
    dataset: { question: 'q-1' },
    querySelectorAll(selector) { return selector === '[data-question-field]' ? [answer] : []; }
  });
  selectorResults.set('[data-question]', [card]);
  harness.wireCurrent(meta);

  await fire(answer);
  assert.equal(questionMeta.reviewStatus, 'needs_review');
  assert.equal(meta.reviewStatus, 'approved', 'editing a child must not invalidate the parent Case approval');
  assert.equal(questionMeta.warnings.length, 1);

  let select = await tryChildApproval(context, harness, selectorResults, meta, 'question', 'q-1', false);
  assert.equal(questionMeta.reviewStatus, 'needs_review');
  assert.equal(select.value, 'needs_review');

  await tryChildApproval(context, harness, selectorResults, meta, 'question', 'q-1', true);
  assert.equal(questionMeta.reviewStatus, 'approved');
  assert.equal(questionMeta.warnings.length, 1);
});

test('editing an approved warned Asset invalidates only that Asset and requires explicit child reapproval', async () => {
  const { context, harness, selectorResults } = loadBrowserHarness();
  const asset = { id: 'asset-1', path: 'media/asset-1.png', mimeType: 'image/png', originalFilename: 'asset.png', altText: 'Original alt text', sourceLabel: null, sourceUrl: null, licence: null };
  const assetMeta = reviewAsset('asset-1');
  const bundle = makeBundle({ caseStatus: 'approved', asset, assetReview: assetMeta });
  harness.setBundle(bundle);
  harness.stubIo();
  const meta = bundle.reviewMap.cases[0];
  const altText = makeElement({ value: 'Changed alt text', dataset: { assetField: 'altText' } });
  const card = makeElement({
    dataset: { asset: 'asset-1' },
    querySelectorAll(selector) { return selector === '[data-asset-field]' ? [altText] : []; },
    querySelector() { return null; }
  });
  selectorResults.set('[data-asset]', [card]);
  harness.wireCurrent(meta);

  await fire(altText);
  assert.equal(assetMeta.reviewStatus, 'needs_review');
  assert.equal(meta.reviewStatus, 'approved', 'editing a child must not invalidate the parent Case approval');
  assert.equal(assetMeta.warnings.length, 1);

  let select = await tryChildApproval(context, harness, selectorResults, meta, 'asset', 'asset-1', false);
  assert.equal(assetMeta.reviewStatus, 'needs_review');
  assert.equal(select.value, 'needs_review');

  await tryChildApproval(context, harness, selectorResults, meta, 'asset', 'asset-1', true);
  assert.equal(assetMeta.reviewStatus, 'approved');
  assert.equal(assetMeta.warnings.length, 1);
});
