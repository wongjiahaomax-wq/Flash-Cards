import test from 'node:test';
import assert from 'node:assert/strict';
import { hasActiveMissingAnswer } from '../src/review-filters.js';

const warning = { code: 'missing_answer', severity: 'blocking', message: 'No answer' };

test('missing-answer filter excludes rejected unresolved questions', () => {
  assert.equal(hasActiveMissingAnswer([{ reviewStatus: 'rejected', warnings: [warning] }]), false);
  assert.equal(hasActiveMissingAnswer([{ reviewStatus: 'needs_review', warnings: [warning] }]), true);
});
