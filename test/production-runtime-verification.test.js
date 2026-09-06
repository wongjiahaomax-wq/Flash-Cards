import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateRuntimeStatus } from '../scripts/verify-production-runtime.mjs';

const SHA = '1234567890abcdef1234567890abcdef12345678';

function status(overrides = {}) {
  return {
    learnerRuntimeCutoverVersion: 2,
    learnerRuntimeScopeVersion: 2,
    learnerRuntimeWriteFence: false,
    learnerRuntimeBuildSha: SHA,
    learnerRuntimeWorkerVersion: '12345678-1234-1234-1234-1234567890ab',
    ...overrides
  };
}

test('production runtime verifier accepts only the exact expected open build', () => {
  const result = evaluateRuntimeStatus(status(), SHA, false);
  assert.equal(result.ok, true);
});

test('production runtime verifier rejects a stale serving build and preserves diagnostics', () => {
  const staleSha = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const result = evaluateRuntimeStatus(status({ learnerRuntimeBuildSha: staleSha }), SHA, false);

  assert.equal(result.ok, false);
  assert.equal(result.actual.learnerRuntimeBuildSha, staleSha);
  assert.equal(result.actual.learnerRuntimeWorkerVersion, '12345678-1234-1234-1234-1234567890ab');
});

test('production runtime verifier enforces the expected fence state', () => {
  assert.equal(evaluateRuntimeStatus(status({ learnerRuntimeWriteFence: true }), SHA, true).ok, true);
  assert.equal(evaluateRuntimeStatus(status({ learnerRuntimeWriteFence: false }), SHA, true).ok, false);
});

test('production runtime verifier rejects wrong runtime versions', () => {
  assert.equal(evaluateRuntimeStatus(status({ learnerRuntimeCutoverVersion: 1 }), SHA, false).ok, false);
  assert.equal(evaluateRuntimeStatus(status({ learnerRuntimeScopeVersion: 1 }), SHA, false).ok, false);
});
