import assert from 'node:assert/strict';
import test from 'node:test';

import { runStudyRunD1Benchmark } from '../scripts/learner-fsrs-run-d1-benchmark.mjs';

test('PR B run-planning D1 benchmark uses bounded indexed learner-state reads without N+1 queries', () => {
  const result = runStudyRunD1Benchmark({
    caseCount: 80,
    stateCount: 40,
    encounterCount: 48
  });
  assert.equal(result.rows.stateRows, 40);
  assert.equal(result.rows.encounterRows, 48);
  assert.deepEqual(result.foreignKeyViolations, []);
  assert.match(result.queryPlans.states.join('\n'), /INDEX/i);
  assert.match(result.queryPlans.encounters.join('\n'), /INDEX/i);
  assert.match(result.caveat, /browser descriptor\/proof cost is measured separately/i);
});
