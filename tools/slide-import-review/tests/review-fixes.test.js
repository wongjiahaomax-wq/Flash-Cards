import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateReviewMap,
  finalizeBundle,
  persistedStateMatches,
  sha256Hex
} from '../src/core.js';

const png = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);

async function reviewedFixture() {
  const hash = await sha256Hex(png);
  const manifest = {
    version: 1,
    packageId: 'review-fixes',
    topics: [{ id: 'topic-1', operation: 'create', name: 'Holding', slug: 'holding', descriptionMd: null, parentTopicId: null, isActive: true }],
    cases: [{ id: 'case-1', operation: 'create', title: 'Case 1', vignetteMd: 'Vignette', primaryTopicId: 'topic-1', secondaryTopicIds: [], questionSelectionMode: 'all', isActive: true }],
    assets: [
      { id: 'asset-keep', operation: 'create', path: 'media/keep.png', mimeType: 'image/png', originalFilename: 'keep.png', altText: 'Keep', sourceLabel: null, sourceUrl: null, licence: null, isActive: true },
      { id: 'asset-reject', operation: 'create', path: 'media/reject.png', mimeType: 'image/png', originalFilename: 'reject.png', altText: 'Reject', sourceLabel: null, sourceUrl: null, licence: null, isActive: true }
    ],
    caseAssets: [
      { id: 'case-asset-keep', operation: 'create', caseId: 'case-1', assetId: 'asset-keep', displayOrder: 0, captionMd: null },
      { id: 'case-asset-reject', operation: 'create', caseId: 'case-1', assetId: 'asset-reject', displayOrder: 1, captionMd: null }
    ],
    questionPrompts: [
      { id: 'prompt-keep', operation: 'create', promptMd: 'Keep this?', isActive: true },
      { id: 'prompt-reject', operation: 'create', promptMd: 'Reject this?', isActive: true }
    ],
    caseQuestions: [
      { id: 'question-keep', operation: 'create', caseId: 'case-1', questionPromptId: 'prompt-keep', answerMd: 'Keep answer', isActive: true },
      { id: 'question-reject', operation: 'create', caseId: 'case-1', questionPromptId: 'prompt-reject', answerMd: 'Reject answer', isActive: true }
    ],
    topicQuestions: []
  };
  const reviewMap = {
    version: 1,
    bundleId: 'bundle-review-fixes',
    batchName: 'Review fixes',
    sourceFiles: [{ sourceId: 'source-1', filename: 'deck.pdf', repository: null, path: null, ref: null, pageCount: 2 }],
    cases: [{
      caseId: 'case-1',
      reviewStatus: 'approved',
      confidence: 'high',
      warnings: [],
      sourceRefs: [{ sourceId: 'source-1', pages: [1, 2] }],
      caseBoundaryNotes: null,
      assets: [
        { assetId: 'asset-keep', reviewStatus: 'approved', confidence: 'high', warnings: [], sourceRefs: [{ sourceId: 'source-1', pages: [1] }], extractionMethod: 'embedded_original', sha256: hash, reviewNotes: [] },
        { assetId: 'asset-reject', reviewStatus: 'rejected', confidence: 'high', warnings: [], sourceRefs: [{ sourceId: 'source-1', pages: [1] }], extractionMethod: 'embedded_original', sha256: hash, reviewNotes: [] }
      ],
      questions: [
        { caseQuestionId: 'question-keep', reviewStatus: 'approved', confidence: 'high', warnings: [], promptSourceRefs: [{ sourceId: 'source-1', pages: [1] }], answerSourceRefs: [{ sourceId: 'source-1', pages: [2] }], reviewNotes: [] },
        { caseQuestionId: 'question-reject', reviewStatus: 'rejected', confidence: 'high', warnings: [], promptSourceRefs: [{ sourceId: 'source-1', pages: [1] }], answerSourceRefs: [{ sourceId: 'source-1', pages: [2] }], reviewNotes: [] }
      ],
      reviewNotes: []
    }],
    sourceCoverage: [
      { sourceId: 'source-1', page: 1, classification: 'case', caseIds: ['case-1'], notes: null, previewPath: null },
      { sourceId: 'source-1', page: 2, classification: 'case', caseIds: ['case-1'], notes: null, previewPath: null }
    ],
    unresolvedQuestions: [],
    batchWarnings: []
  };
  const files = new Map([
    ['media/keep.png', png],
    ['media/reject.png', png]
  ]);
  return { manifest, reviewMap, files };
}

test('rejected manifest-backed child Asset and Question are pruned while review history remains intact', async () => {
  const bundle = await reviewedFixture();
  const output = await finalizeBundle(bundle);

  assert.deepEqual(output.manifest.caseAssets.map(item => item.assetId), ['asset-keep']);
  assert.deepEqual(output.manifest.assets.map(item => item.id), ['asset-keep']);
  assert.deepEqual(output.manifest.caseQuestions.map(item => item.id), ['question-keep']);
  assert.deepEqual(output.manifest.questionPrompts.map(item => item.id), ['prompt-keep']);

  assert.equal(bundle.manifest.caseAssets.length, 2);
  assert.equal(bundle.manifest.caseQuestions.length, 2);
  assert.equal(bundle.reviewMap.cases[0].assets.find(item => item.assetId === 'asset-reject').reviewStatus, 'rejected');
  assert.equal(bundle.reviewMap.cases[0].questions.find(item => item.caseQuestionId === 'question-reject').reviewStatus, 'rejected');
});

test('review-map source references cannot exceed declared source pageCount', async () => {
  const { manifest, reviewMap } = await reviewedFixture();
  const badRef = structuredClone(reviewMap);
  badRef.cases[0].sourceRefs[0].pages = [3];
  assert.throws(() => validateReviewMap(badRef, manifest), /beyond declared pageCount 2/);

  const badCoverage = structuredClone(reviewMap);
  badCoverage.sourceCoverage[1].page = 3;
  assert.throws(() => validateReviewMap(badCoverage, manifest), /exceeds declared pageCount 2/);
});

test('persisted reviewer state only resumes for the exact opened bundle fingerprint', () => {
  const saved = { bundleId: 'bundle-1', sourceFingerprint: 'abc123' };
  assert.equal(persistedStateMatches(saved, 'bundle-1', 'abc123'), true);
  assert.equal(persistedStateMatches(saved, 'bundle-1', 'different'), false);
  assert.equal(persistedStateMatches({ bundleId: 'bundle-1' }, 'bundle-1', 'abc123'), false);
  assert.equal(persistedStateMatches(saved, 'bundle-2', 'abc123'), false);
});

test('browser reviewer skips rejected children during Case approval and fingerprints input ZIPs', () => {
  const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.equal((source.match(/review\.reviewStatus==='rejected'\)continue;/g) ?? []).length, 2);
  assert.match(source, /sourceFingerprint=await sha256Hex\(raw\)/);
  assert.match(source, /persistedStateMatches\(saved,loaded\.reviewMap\.bundleId,sourceFingerprint\)/);
});
