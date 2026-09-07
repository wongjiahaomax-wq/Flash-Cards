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
globalThis.__appTest = {
  setBundle(nextBundle, fingerprint = 'test-fingerprint') {
    bundle = nextBundle;
    bundleFingerprint = fingerprint;
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
  approveEligibleQuestions,
  wireCurrent,
  approveCurrent,
  snapshot,
  restoreSaved,
  current() { return { bundle, indexes, visibleCases, index }; }
};\n`;

  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, makeElement());
      return elements.get(id);
    },
    querySelectorAll() { return []; },
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
    persistedStateMatches: (saved, bundleId, sourceFingerprint) => Boolean(saved && saved.bundleId === bundleId && saved.sourceFingerprint === sourceFingerprint),
    createAutosaveCoordinator: () => ({ flush: async () => true, active: null }),
    trimResourceUrlCache() {},
    hasActiveMissingAnswer: (items = []) => items.some(item => item.reviewStatus !== 'rejected' && (item.warnings ?? []).some(warning => warning.code === 'missing_answer')),
    createOperationGuard: () => ({ active: null, cancel() {}, begin() { return {}; }, isCurrent() { return true; }, finish() {} })
  };

  vm.runInNewContext(source, context, { filename: 'slide-review-app.js' });
  return { context, harness: context.__appTest };
}

function question(id, { answerMd = `Answer ${id}` } = {}) {
  return { id, caseId: 'case-1', questionPromptId: `prompt-${id}`, answerMd };
}

function questionReview(id, reviewStatus, warnings = []) {
  return {
    caseQuestionId: id,
    reviewStatus,
    confidence: 'high',
    warnings,
    promptSourceRefs: [],
    answerSourceRefs: [],
    reviewNotes: []
  };
}

function baseBundle({ questions, questionReviews, caseWarnings = [], caseStatus = 'needs_review', assets = [], unresolvedQuestions = [] }) {
  const files = new Map();
  files.overrides = new Map();
  return {
    files,
    manifest: {
      version: 1,
      packageId: 'browser-transition-test',
      topics: [{ id: 'topic-1' }],
      cases: [{ id: 'case-1', title: 'Case 1', vignetteMd: 'Vignette', primaryTopicId: 'topic-1', secondaryTopicIds: [] }],
      assets: [],
      caseAssets: [],
      questionPrompts: questions.map(item => ({ id: item.questionPromptId, promptMd: `Prompt ${item.id}` })),
      caseQuestions: questions,
      topicQuestions: []
    },
    reviewMap: {
      version: 1,
      bundleId: 'browser-transition-bundle',
      batchName: 'Browser transition test',
      sourceFiles: [],
      sourceCoverage: [],
      batchWarnings: [],
      unresolvedQuestions,
      cases: [{
        caseId: 'case-1',
        reviewStatus: caseStatus,
        confidence: 'high',
        warnings: caseWarnings,
        sourceRefs: [],
        caseBoundaryNotes: null,
        assets,
        questions: questionReviews,
        reviewNotes: []
      }]
    }
  };
}

function warnedAsset(id = 'asset-1') {
  return {
    assetId: id,
    reviewStatus: 'needs_review',
    confidence: 'high',
    warnings: [blockingWarning('Asset warning requires reconciliation.')],
    sourceRefs: [],
    extractionMethod: 'embedded_original',
    sha256: '00',
    reviewNotes: []
  };
}

async function changeStatusThroughBrowser(context, harness, meta, target, kind, id, confirmResult) {
  const select = makeElement({ value: 'approved', dataset: { statusKind: kind, statusId: id } });
  context.document.querySelectorAll = selector => selector === '[data-status-kind]' ? [select] : [];
  context.window.confirm = () => confirmResult;
  harness.wireCurrent(meta);
  const listener = select.listener('change');
  assert.equal(typeof listener, 'function');
  await listener();
  return select;
}

test('bulk Q&A approval changes only clean pending manifest Questions and survives snapshot restore', async () => {
  const { harness } = loadBrowserHarness();
  const relations = [
    question('q-clean'),
    question('q-warned'),
    question('q-needs'),
    question('q-rejected'),
    question('q-approved'),
    question('q-missing-review'),
    question('q-blank', { answerMd: '   ' })
  ];
  const unresolved = [{
    candidateId: 'unresolved-1',
    caseId: 'case-1',
    resolvedCaseQuestionId: null,
    reviewStatus: 'needs_review',
    confidence: 'low',
    warnings: [{ code: 'missing_answer', severity: 'blocking', message: 'No source answer.' }]
  }];
  const reviews = [
    questionReview('q-clean', 'pending'),
    questionReview('q-warned', 'pending', [blockingWarning('Question warning requires reconciliation.')]),
    questionReview('q-needs', 'needs_review'),
    questionReview('q-rejected', 'rejected'),
    questionReview('q-approved', 'approved'),
    questionReview('q-blank', 'pending')
  ];
  const bundle = baseBundle({ questions: relations, questionReviews: reviews, unresolvedQuestions: unresolved });
  harness.setBundle(bundle);
  harness.stubIo();

  const unresolvedBefore = structuredClone(bundle.reviewMap.unresolvedQuestions);
  await harness.approveEligibleQuestions(bundle.reviewMap.cases[0]);

  const byId = new Map(bundle.reviewMap.cases[0].questions.map(item => [item.caseQuestionId, item]));
  assert.equal(byId.get('q-clean').reviewStatus, 'approved');
  assert.equal(byId.get('q-warned').reviewStatus, 'pending');
  assert.equal(byId.get('q-needs').reviewStatus, 'needs_review');
  assert.equal(byId.get('q-rejected').reviewStatus, 'rejected');
  assert.equal(byId.get('q-approved').reviewStatus, 'approved');
  assert.equal(byId.get('q-blank').reviewStatus, 'pending');
  assert.equal(byId.has('q-missing-review'), false);
  assert.equal(bundle.reviewMap.cases[0].reviewStatus, 'needs_review', 'bulk Q&A must not approve the parent Case');
  assert.deepEqual(bundle.reviewMap.unresolvedQuestions, unresolvedBefore, 'bulk Q&A must not touch unresolved candidates');

  const saved = harness.snapshot();
  byId.get('q-clean').reviewStatus = 'pending';
  bundle.reviewMap.cases[0].reviewStatus = 'rejected';
  bundle.reviewMap.unresolvedQuestions[0].reviewStatus = 'rejected';
  assert.equal(await harness.restoreSaved(saved), true);

  const restored = harness.current().bundle.reviewMap;
  assert.equal(restored.cases[0].questions.find(item => item.caseQuestionId === 'q-clean').reviewStatus, 'approved');
  assert.equal(restored.cases[0].reviewStatus, 'needs_review');
  assert.equal(restored.unresolvedQuestions[0].reviewStatus, 'needs_review');
});

test('warned Asset and Question approval requires the explicit browser confirmation path', async () => {
  const { context, harness } = loadBrowserHarness();
  const relation = question('q-warned');
  const asset = warnedAsset();
  const review = questionReview('q-warned', 'needs_review', [blockingWarning('Question warning requires reconciliation.')]);
  const bundle = baseBundle({ questions: [relation], questionReviews: [review], assets: [asset] });
  harness.setBundle(bundle);
  harness.stubIo();
  const meta = bundle.reviewMap.cases[0];

  let select = await changeStatusThroughBrowser(context, harness, meta, asset, 'asset', asset.assetId, false);
  assert.equal(asset.reviewStatus, 'needs_review');
  assert.equal(select.value, 'needs_review');
  assert.equal(asset.warnings.length, 1);

  select = await changeStatusThroughBrowser(context, harness, meta, asset, 'asset', asset.assetId, true);
  assert.equal(asset.reviewStatus, 'approved');
  assert.equal(asset.warnings.length, 1, 'explicit override must retain the warning');

  select = await changeStatusThroughBrowser(context, harness, meta, review, 'question', review.caseQuestionId, false);
  assert.equal(review.reviewStatus, 'needs_review');
  assert.equal(select.value, 'needs_review');

  await changeStatusThroughBrowser(context, harness, meta, review, 'question', review.caseQuestionId, true);
  assert.equal(review.reviewStatus, 'approved');
  assert.equal(review.warnings.length, 1, 'explicit override must retain the warning');
});

test('Case override cannot waive a blocked child and requires its own explicit confirmation', async () => {
  const { context, harness } = loadBrowserHarness();
  const relation = question('q-1');
  const child = questionReview('q-1', 'needs_review', [blockingWarning('Child Question conflict.')]);
  const caseWarning = blockingWarning('Case-level source conflict.');
  const bundle = baseBundle({ questions: [relation], questionReviews: [child], caseWarnings: [caseWarning] });
  harness.setBundle(bundle);
  harness.stubIo();
  const meta = bundle.reviewMap.cases[0];

  let confirms = 0;
  context.window.confirm = () => { confirms += 1; return true; };
  await harness.approveCurrent();
  assert.equal(meta.reviewStatus, 'needs_review');
  assert.equal(child.reviewStatus, 'needs_review');
  assert.equal(confirms, 0, 'parent override must not be offered while a child blocker is unresolved');

  await changeStatusThroughBrowser(context, harness, meta, child, 'question', child.caseQuestionId, true);
  assert.equal(child.reviewStatus, 'approved');
  assert.equal(child.warnings.length, 1);

  context.window.confirm = () => false;
  await harness.approveCurrent();
  assert.equal(meta.reviewStatus, 'needs_review');
  assert.equal(meta.warnings.length, 1);

  context.window.confirm = () => true;
  await harness.approveCurrent();
  assert.equal(meta.reviewStatus, 'approved');
  assert.equal(meta.warnings.length, 1, 'Case override must retain the Case warning');
  assert.equal(child.reviewStatus, 'approved');
  assert.equal(child.warnings.length, 1, 'Case override must not modify the child warning');
});
