import assert from 'node:assert/strict';
import test from 'node:test';

import { runStudyRunDescriptorBenchmark } from '../scripts/learner-fsrs-run-benchmark.mjs';

test('chunked captured-work proofs materially reduce descriptor storage versus per-entry capabilities', async () => {
  const result = await runStudyRunDescriptorBenchmark({
    dueCount: 16,
    newCount: 48,
    chunkSize: 16,
    iterations: 2
  });
  assert.equal(result.representativeWorkload.total, 64);
  assert.equal(result.chosenChunkSize, 16);
  assert.ok(result.chosen.proofCount < result.perEntryCapability.proofCount);
  assert.ok(result.chosen.proofBytes < result.perEntryCapability.proofBytes);
  assert.ok(result.chosen.descriptorBytes < result.perEntryCapability.descriptorBytes);
  assert.ok(result.chosen.maxSingleProofBytes > result.perEntryCapability.maxSingleProofBytes);
  assert.match(result.interpretation, /browser quota\/engine limits must be assessed separately/i);
});
