import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSingleFullTrafficVersion,
  getSingleFullTrafficVersionId
} from '../scripts/production-worker-deployment.mjs';

test('returns the only Worker version serving 100% of traffic', () => {
  const deployment = {
    versions: [{ version_id: 'version-good', percentage: 100 }]
  };

  assert.equal(getSingleFullTrafficVersionId(deployment), 'version-good');
});

test('rejects split traffic because rollback provenance would be ambiguous', () => {
  const deployment = {
    versions: [
      { version_id: 'version-a', percentage: 50 },
      { version_id: 'version-b', percentage: 50 }
    ]
  };

  assert.throws(
    () => getSingleFullTrafficVersionId(deployment),
    /exactly one active Worker version/
  );
});

test('rejects a single version that is not serving 100% of traffic', () => {
  const deployment = {
    versions: [{ version_id: 'version-a', percentage: 99 }]
  };

  assert.throws(
    () => getSingleFullTrafficVersionId(deployment),
    /serving exactly 100%/
  );
});

test('verifies the expected rollback version exactly', () => {
  const deployment = {
    versions: [{ version_id: 'version-good', percentage: 100 }]
  };

  assert.equal(
    assertSingleFullTrafficVersion(deployment, 'version-good'),
    'version-good'
  );
  assert.throws(
    () => assertSingleFullTrafficVersion(deployment, 'version-other'),
    /Expected Worker version version-other, found version-good/
  );
});
