import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSyntheticScheduledStudyRunDescriptor,
  runStudyRunDescriptorBenchmark
} from '../scripts/learner-fsrs-run-benchmark.mjs';

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
  assert.match(result.interpretation, /real chromium\/localstorage evidence/i);
});

test('synthetic benchmark uses the production Scheduled descriptor shape including resumable cursors', async () => {
  const descriptor = await buildSyntheticScheduledStudyRunDescriptor({
    dueCount: 2,
    newCount: 2,
    chunkSize: 2
  });
  assert.equal(descriptor.kind, 'scheduled');
  assert.equal(descriptor.duePosition, 0);
  assert.equal(descriptor.newPosition, 0);
  assert.equal(descriptor.capturedDue.length, 2);
  assert.equal(descriptor.capturedNew.length, 2);
});
