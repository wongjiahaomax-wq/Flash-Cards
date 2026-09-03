import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('PR F exposes the authorized Admin per-learner retention control', () => {
  const service = source('src/lib/server/db/fsrs-retention-admin.js');
  const server = source('src/routes/admin/learner-retention/+page.server.js');
  const page = source('src/routes/admin/learner-retention/+page.svelte');
  const layout = source('src/routes/admin/+layout.svelte');

  for (const policy of ['24m', '36m', '60m', 'indefinite']) {
    assert.match(service, new RegExp(`'${policy}'`));
  }
  assert.match(service, /initialLearnerFsrsProfile/);
  assert.match(service, /buildDetailedHistoryCleanupStatements/);
  assert.match(server, /isProductionAdmin/);
  assert.match(server, /setLearnerDetailedHistoryRetention/);
  assert.match(page, /Detailed history retention/);
  assert.match(layout, /\/admin\/learner-retention/);
});

test('active Review specialized workflow owns Reset/Fresh supported-writer race validation', () => {
  const workflow = source('.github/workflows/learner-fsrs-active-review-benchmark.yml');
  const worker = source('scripts/learner-fsrs-active-review-d1-smoke-worker.js');
  const runner = source('scripts/learner-fsrs-active-review-d1-smoke.mjs');

  assert.match(workflow, /drizzle\/0024_learner_fsrs_reset_fresh\.sql/);
  assert.match(workflow, /test\/learner-fsrs-reset-fresh\.test\.js/);
  assert.match(workflow, /Run active Review plus Reset\/Fresh creation races through local workerd and D1/);
  assert.match(worker, /createScheduledActiveReview/);
  assert.match(worker, /resetLearnerFsrsProgress/);
  assert.match(worker, /freshLearnerFsrsStart/);
  assert.match(worker, /Promise\.allSettled/);
  assert.match(worker, /runCreationFirstBoundary/);
  assert.match(runner, /\/race-reset/);
  assert.match(runner, /\/race-fresh/);
  assert.match(runner, /\/creation-first-reset/);
  assert.match(runner, /\/creation-first-fresh/);
  assert.match(runner, /activeBoundaryBefore/);
});
