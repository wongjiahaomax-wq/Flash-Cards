import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const blockingWarning = message => ({ code: 'source_inconsistency', severity: 'blocking', message });

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

function loadHarness() {
  let source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  source = source.replace(/import\s+\{[\s\S]*?\}\s+from\s+'\.\/[^']+';\n/g, '');
  source += `\n
globalThis.__dependencyInvalidationTest = {
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
  replaceImage,
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
  return { context, harness: context.__dependencyInvalidationTest, selectorResults };
}

function caseReview(caseId, { assets = [], questions = [] } = {}) {
  return {
    caseId,
    reviewStatus: 'approved',
    confidence: 'high',
    warnings: [],
    sourceRefs: [],
    caseBoundaryNotes: null,
    assets,
    questions,
    reviewNotes: []
  };
}

function assetReview(assetId, status = 'approved') {
  return {
    assetId,
    reviewStatus: status,
    confidence: 'high',
    warnings: [blockingWarning(`Asset ${assetId} warning.`)],
    sourceRefs: [],
    extractionMethod: 'embedded_original',
    sha256: '00',
    reviewNotes: []
  };
}

function questionReview(caseQuestionId) {
  return {
    caseQuestionId,
    reviewStatus: 'approved',
    confidence: 'high',
    warnings: [blockingWarning(`Question ${caseQuestionId} warning.`)],
    promptSourceRefs: [],
    answerSourceRefs: [],
    reviewNotes: []
  };
}

function baseBundle({ cases, assets = [], caseAssets = [], questionPrompts = [], caseQuestions = [], reviews }) {
  const files = new Map();
  files.overrides = new Map();
  return {
    files,
    manifest: {
      version: 1,
      packageId: 'dependency-invalidation-test',
      topics: [{ id: 'topic-1' }],
      cases,
      assets,
      caseAssets,
      questionPrompts,
      caseQuestions,
      topicQuestions: []
    },
    reviewMap: {
      version: 1,
      bundleId: 'dependency-invalidation-bundle',
      batchName: 'Dependency invalidation test',
      sourceFiles: [],
      sourceCoverage: [],
      batchWarnings: [],
      unresolvedQuestions: [],
      cases: reviews
    }
  };
}

const manifestCase = id => ({ id, title: id, vignetteMd: null, primaryTopicId: 'topic-1', secondaryTopicIds: [] });

async function fire(element, type = 'change') {
  const listener = element.listener(type);
  assert.equal(typeof listener, 'function');
  await listener();
}

test('editing a CaseAsset caption invalidates only that Case Asset review', async () => {
  const { harness, selectorResults } = loadHarness();
  const review = assetReview('asset-1');
  const otherReview = assetReview('asset-1');
  const bundle = baseBundle({
    cases: [manifestCase('case-1'), manifestCase('case-2')],
    assets: [{ id: 'asset-1', path: 'media/asset.png', mimeType: 'image/png', originalFilename: 'asset.png', altText: 'Alt', sourceLabel: null, sourceUrl: null, licence: null }],
    caseAssets: [
      { id: 'case-asset-1', caseId: 'case-1', assetId: 'asset-1', captionMd: 'Old caption', displayOrder: 0 },
      { id: 'case-asset-2', caseId: 'case-2', assetId: 'asset-1', captionMd: 'Other caption', displayOrder: 0 }
    ],
    reviews: [caseReview('case-1', { assets: [review] }), caseReview('case-2', { assets: [otherReview] })]
  });
  harness.setBundle(bundle);
  harness.stubIo();

  const caption = makeElement({ value: 'Changed caption', dataset: { relField: 'captionMd' } });
  const card = makeElement({
    dataset: { asset: 'asset-1' },
    querySelectorAll(selector) { return selector === '[data-rel-field]' ? [caption] : []; }
  });
  selectorResults.set('[data-asset]', [card]);
  harness.wireCurrent(bundle.reviewMap.cases[0]);
  await fire(caption);

  assert.equal(review.reviewStatus, 'needs_review');
  assert.equal(otherReview.reviewStatus, 'approved', 'case-specific relationship edits must not invalidate another Case');
  assert.equal(bundle.reviewMap.cases[0].reviewStatus, 'approved');
  assert.equal(review.warnings.length, 1);
});

test('editing a shared Prompt invalidates every approved CaseQuestion review that references it', async () => {
  const { harness, selectorResults } = loadHarness();
  const q1Review = questionReview('q-1');
  const q2Review = questionReview('q-2');
  const bundle = baseBundle({
    cases: [manifestCase('case-1'), manifestCase('case-2')],
    questionPrompts: [{ id: 'prompt-1', promptMd: 'Original shared prompt' }],
    caseQuestions: [
      { id: 'q-1', caseId: 'case-1', questionPromptId: 'prompt-1', answerMd: 'Answer one' },
      { id: 'q-2', caseId: 'case-2', questionPromptId: 'prompt-1', answerMd: 'Answer two' }
    ],
    reviews: [caseReview('case-1', { questions: [q1Review] }), caseReview('case-2', { questions: [q2Review] })]
  });
  harness.setBundle(bundle);
  harness.stubIo();

  const prompt = makeElement({ value: 'Changed shared prompt', dataset: { questionField: 'promptMd' } });
  const card = makeElement({
    dataset: { question: 'q-1' },
    querySelectorAll(selector) { return selector === '[data-question-field]' ? [prompt] : []; }
  });
  selectorResults.set('[data-question]', [card]);
  harness.wireCurrent(bundle.reviewMap.cases[0]);
  await fire(prompt);

  assert.equal(q1Review.reviewStatus, 'needs_review');
  assert.equal(q2Review.reviewStatus, 'needs_review');
  assert.equal(bundle.reviewMap.cases[0].reviewStatus, 'approved');
  assert.equal(bundle.reviewMap.cases[1].reviewStatus, 'approved');
  assert.equal(q1Review.warnings.length, 1);
  assert.equal(q2Review.warnings.length, 1);
});

test('editing shared Asset metadata invalidates every approved Case Asset review that references it', async () => {
  const { harness, selectorResults } = loadHarness();
  const a1Review = assetReview('asset-1');
  const a2Review = assetReview('asset-1');
  const bundle = baseBundle({
    cases: [manifestCase('case-1'), manifestCase('case-2')],
    assets: [{ id: 'asset-1', path: 'media/asset.png', mimeType: 'image/png', originalFilename: 'asset.png', altText: 'Old alt', sourceLabel: null, sourceUrl: null, licence: null }],
    caseAssets: [
      { id: 'case-asset-1', caseId: 'case-1', assetId: 'asset-1', captionMd: null, displayOrder: 0 },
      { id: 'case-asset-2', caseId: 'case-2', assetId: 'asset-1', captionMd: null, displayOrder: 0 }
    ],
    reviews: [caseReview('case-1', { assets: [a1Review] }), caseReview('case-2', { assets: [a2Review] })]
  });
  harness.setBundle(bundle);
  harness.stubIo();

  const alt = makeElement({ value: 'Changed shared alt', dataset: { assetField: 'altText' } });
  const card = makeElement({
    dataset: { asset: 'asset-1' },
    querySelectorAll(selector) { return selector === '[data-asset-field]' ? [alt] : []; }
  });
  selectorResults.set('[data-asset]', [card]);
  harness.wireCurrent(bundle.reviewMap.cases[0]);
  await fire(alt);

  assert.equal(a1Review.reviewStatus, 'needs_review');
  assert.equal(a2Review.reviewStatus, 'needs_review');
  assert.equal(bundle.reviewMap.cases[0].reviewStatus, 'approved');
  assert.equal(bundle.reviewMap.cases[1].reviewStatus, 'approved');
  assert.equal(a1Review.warnings.length, 1);
  assert.equal(a2Review.warnings.length, 1);
});

test('replacing a shared Asset updates every linked review hash and invalidates stale approvals', async () => {
  const { context, harness } = loadHarness();
  const a1Review = assetReview('asset-1');
  const a2Review = assetReview('asset-1');
  const bundle = baseBundle({
    cases: [manifestCase('case-1'), manifestCase('case-2')],
    assets: [{ id: 'asset-1', path: 'media/asset.png', mimeType: 'image/png', originalFilename: 'asset.png', altText: 'Alt', sourceLabel: null, sourceUrl: null, licence: null }],
    caseAssets: [
      { id: 'case-asset-1', caseId: 'case-1', assetId: 'asset-1', captionMd: null, displayOrder: 0 },
      { id: 'case-asset-2', caseId: 'case-2', assetId: 'asset-1', captionMd: null, displayOrder: 0 }
    ],
    reviews: [caseReview('case-1', { assets: [a1Review] }), caseReview('case-2', { assets: [a2Review] })]
  });
  harness.setBundle(bundle);
  harness.stubIo();
  context.detectImageType = () => 'image/png';
  context.sha256Hex = async () => 'new-sha';
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const file = { type: 'image/png', size: bytes.byteLength, name: 'replacement.png', arrayBuffer: async () => bytes.buffer };

  await harness.replaceImage('asset-1', file);

  assert.equal(a1Review.reviewStatus, 'needs_review');
  assert.equal(a2Review.reviewStatus, 'needs_review');
  assert.equal(a1Review.sha256, 'new-sha');
  assert.equal(a2Review.sha256, 'new-sha');
  assert.equal(a1Review.extractionMethod, 'human_replacement');
  assert.equal(a2Review.extractionMethod, 'human_replacement');
});
