import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReviewMap } from '../src/core.js';

const manifest = {
  cases: [],
  assets: [],
  caseQuestions: [],
  questionPrompts: []
};

function reviewMap() {
  return {
    version: 1,
    bundleId: 'coverage-test',
    batchName: 'Coverage test',
    sourceFiles: [{ sourceId: 'source-1', filename: 'deck.pdf', repository: null, path: null, ref: null, pageCount: 2 }],
    cases: [],
    sourceCoverage: [
      { sourceId: 'source-1', page: 1, classification: 'teaching/reference material', caseIds: [], notes: null, previewPath: null },
      { sourceId: 'source-1', page: 2, classification: 'teaching/reference material', caseIds: [], notes: null, previewPath: null }
    ],
    unresolvedQuestions: [],
    batchWarnings: []
  };
}

test('source coverage must account for every declared source page exactly once', () => {
  const complete = reviewMap();
  assert.doesNotThrow(() => validateReviewMap(complete, manifest));

  const missing = reviewMap();
  missing.sourceCoverage.pop();
  assert.throws(() => validateReviewMap(missing, manifest), /Source coverage is missing source-1 page 2/);

  const beyond = reviewMap();
  beyond.sourceCoverage[1].page = 3;
  assert.throws(() => validateReviewMap(beyond, manifest), /exceeds declared pageCount 2/);
});
