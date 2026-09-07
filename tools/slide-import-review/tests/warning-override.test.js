import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeBundle, loadReviewBundle, writeStoredZip } from '../src/core.js';

const enc = new TextEncoder();
const jpg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
const blockingWarning = message => ({ code: 'source_medical_inconsistency', severity: 'blocking', message });

function manifest() {
  return {
    version: 1,
    packageId: 'warning-override-test',
    topics: [{ id: 'topic-unsorted', operation: 'create', name: 'Imported — Test — Unsorted', slug: 'imported-test-unsorted', descriptionMd: null, parentTopicId: null, isActive: true }],
    cases: [1, 2].map(number => ({ id: `case-${number}`, operation: 'create', title: `Case ${number}`, vignetteMd: `Vignette ${number}`, primaryTopicId: 'topic-unsorted', secondaryTopicIds: [], questionSelectionMode: 'all', isActive: true })),
    assets: [],
    caseAssets: [],
    questionPrompts: [1, 2].map(number => ({ id: `prompt-${number}`, operation: 'create', promptMd: `Question ${number}?`, isActive: true })),
    caseQuestions: [1, 2].map(number => ({ id: `question-${number}`, operation: 'create', caseId: `case-${number}`, questionPromptId: `prompt-${number}`, answerMd: `Answer ${number}`, isActive: true })),
    topicQuestions: []
  };
}

function caseReview(number) {
  const firstPage = number === 1 ? 1 : 3;
  return {
    caseId: `case-${number}`,
    reviewStatus: 'needs_review',
    confidence: 'high',
    warnings: [blockingWarning(`Case ${number} source conflict requires reviewer reconciliation.`)],
    sourceRefs: [{ sourceId: 'source-1', pages: [firstPage, firstPage + 1] }],
    caseBoundaryNotes: 'Question followed by answer.',
    assets: [],
    questions: [{
      caseQuestionId: `question-${number}`,
      reviewStatus: 'approved',
      confidence: 'high',
      warnings: [],
      promptSourceRefs: [{ sourceId: 'source-1', pages: [firstPage] }],
      answerSourceRefs: [{ sourceId: 'source-1', pages: [firstPage + 1] }],
      reviewNotes: []
    }],
    reviewNotes: []
  };
}

function reviewMap() {
  return {
    version: 1,
    bundleId: 'warning-override-bundle',
    batchName: 'Warning override test',
    sourceFiles: [{ sourceId: 'source-1', filename: 'deck.pdf', repository: null, path: null, ref: null, pageCount: 4 }],
    cases: [caseReview(1), caseReview(2)],
    sourceCoverage: [1, 2, 3, 4].map(page => ({ sourceId: 'source-1', page, classification: 'case', caseIds: [page <= 2 ? 'case-1' : 'case-2'], notes: null, previewPath: `source-previews/page-${page}.jpg` })),
    unresolvedQuestions: [],
    batchWarnings: []
  };
}

function reviewZip(map = reviewMap()) {
  const packageManifest = manifest();
  return writeStoredZip([
    { path: 'manifest.json', bytes: enc.encode(JSON.stringify(packageManifest)) },
    { path: 'review-map.json', bytes: enc.encode(JSON.stringify(map)) },
    ...[1, 2, 3, 4].map(page => ({ path: `source-previews/page-${page}.jpg`, bytes: jpg }))
  ]);
}

test('explicitly approved warned Cases survive reload and finalize without rediscovering their reconciled warning', async () => {
  const bundle = await loadReviewBundle(reviewZip());
  await assert.rejects(() => finalizeBundle(bundle), error => error.issues.some(issue => issue.includes('review state is needs_review')));

  for (const caseMeta of bundle.reviewMap.cases) caseMeta.reviewStatus = 'approved';
  assert.ok(bundle.reviewMap.cases.every(caseMeta => caseMeta.warnings.some(warning => warning.severity === 'blocking')), 'persisted warnings remain visible');

  const reviewedZip = writeStoredZip([
    { path: 'manifest.json', bytes: enc.encode(JSON.stringify(bundle.manifest)) },
    { path: 'review-map.json', bytes: enc.encode(JSON.stringify(bundle.reviewMap)) },
    ...[1, 2, 3, 4].map(page => ({ path: `source-previews/page-${page}.jpg`, bytes: jpg }))
  ]);
  const reloaded = await loadReviewBundle(reviewedZip);
  const output = await finalizeBundle(reloaded);
  assert.ok(output.zip.length > 0);
});

test('approved child warning is reconciled only for that approved child record', async () => {
  const map = reviewMap();
  for (const caseMeta of map.cases) caseMeta.reviewStatus = 'approved';
  map.cases[0].questions[0].warnings = [blockingWarning('Question answer mapping requires reviewer reconciliation.')];
  map.cases[0].questions[0].reviewStatus = 'approved';

  const bundle = await loadReviewBundle(reviewZip(map));
  const output = await finalizeBundle(bundle);
  assert.ok(output.zip.length > 0);

  bundle.reviewMap.cases[0].questions[0].reviewStatus = 'needs_review';
  await assert.rejects(() => finalizeBundle(bundle), error => error.issues.some(issue => issue.includes('Question question-1')));
});

test('record override never reconciles batch blockers or unresolved questions', async () => {
  const batchMap = reviewMap();
  for (const caseMeta of batchMap.cases) caseMeta.reviewStatus = 'approved';
  batchMap.batchWarnings.push({ code: 'other', severity: 'blocking', message: 'Batch-level blocker.' });
  const batchBundle = await loadReviewBundle(reviewZip(batchMap));
  await assert.rejects(() => finalizeBundle(batchBundle), error => error.issues.some(issue => issue.includes('Batch-level blocker.')));

  const unresolvedMap = reviewMap();
  for (const caseMeta of unresolvedMap.cases) caseMeta.reviewStatus = 'approved';
  unresolvedMap.unresolvedQuestions.push({
    candidateId: 'unresolved-question-1',
    caseId: 'case-1',
    sourcePrompt: 'Unanswered source question?',
    proposedPrompt: 'Unanswered source question?',
    promptSourceRefs: [{ sourceId: 'source-1', pages: [1] }],
    answerSourceRefs: [],
    reviewStatus: 'needs_review',
    confidence: 'low',
    warnings: [{ code: 'missing_answer', severity: 'blocking', message: 'No source-supported answer.' }],
    reviewNotes: [],
    resolvedQuestionPromptId: null,
    resolvedCaseQuestionId: null
  });
  const unresolvedBundle = await loadReviewBundle(reviewZip(unresolvedMap));
  await assert.rejects(() => finalizeBundle(unresolvedBundle), error => error.issues.some(issue => issue.includes('Unresolved Question')));
});
