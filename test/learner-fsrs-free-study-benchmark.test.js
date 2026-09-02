import assert from 'node:assert/strict';
import test from 'node:test';

import { runFreeStudyBenchmark } from '../scripts/learner-fsrs-free-study-benchmark.mjs';

test('Part E benchmark isolates Free completion timing and temporary receipt storage', () => {
  const result = runFreeStudyBenchmark({ completionCount: 200, cleanupLimit: 50 });

  assert.equal(result.kind, 'D1-compatible SQLite Part E benchmark');
  assert.equal(result.completion.activeReviewCreationIncluded, false);
  assert.match(result.completion.timingScope, /active-Review creation excluded/);
  assert.equal(result.completion.logicalRowsChangedPerCompletion, 4);
  assert.equal(result.rows.receiptRows, 200);
  assert.equal(result.rows.encounterFreeTimesStudied, 200);
  assert.equal(result.rows.learnerFreeCompleted, 200);
  assert.equal(result.cleanup.deleted, 200);
  assert.equal(result.cleanup.batches, 4);
  assert.equal(result.rows.remainingReceipts, 0);
  assert.ok(result.storage.temporaryReceiptRetainedBytes > 0);
  assert.ok(result.storage.approximateBytesPerRetainedReceipt > 0);
  assert.equal(
    result.storage.cleanupReclaimedBytes,
    result.storage.temporaryReceiptRetainedBytes
  );
  assert.ok(result.storage.persistentOutcomeDeltaBytes >= 0);
  assert.ok(result.completion.meanMs >= 0);
  assert.ok(result.cleanup.meanBatchMs >= 0);
  assert.equal(result.foreignKeyViolations.length, 0);
  assert.ok(
    result.queryPlans.expiredReceiptSelection.some((detail) =>
      detail.includes('free_review_completion_receipts_expiry_idx')
    ),
    `expected expiry index in cleanup plan: ${result.queryPlans.expiredReceiptSelection.join(' | ')}`
  );
});
