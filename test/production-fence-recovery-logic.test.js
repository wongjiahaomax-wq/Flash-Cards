import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LEGACY_BOOTSTRAP_LKG_VERSION,
  buildRecoveryRecord,
  evaluateStudyResponse,
  evaluateWorkerIdentity,
  validateRecoveryRecord
} from '../scripts/production-fence-recovery.mjs';

const BASE_URL = 'https://flash-cards.mmed-fm-flashcardstest.workers.dev';
const VERSION = LEGACY_BOOTSTRAP_LKG_VERSION;
const FUTURE_VERSION = '11111111-2222-3333-4444-555555555555';
const OTHER_VERSION = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SHA = 'a4f481f95b6b4c487c0b8eeafa9c205c44aba599';

function healthyProbe() {
  return evaluateStudyResponse(
    {
      status: 303,
      location: '/sign-in?redirect=%2Fstudy',
      fenceHeader: null
    },
    BASE_URL
  );
}

function metadataIdentity(version = FUTURE_VERSION) {
  return evaluateWorkerIdentity(
    {
      status: 200,
      body: {
        learnerRuntimeWorkerVersion: version,
        learnerRuntimeBuildSha: SHA
      }
    },
    FUTURE_VERSION
  );
}

function validRecord() {
  return buildRecoveryRecord({
    versionBefore: VERSION,
    versionAfter: VERSION,
    probe: healthyProbe(),
    baseUrl: BASE_URL,
    runId: '33749984574',
    runAttempt: '1',
    sha: SHA,
    capturedAt: '2026-09-03T11:31:30.163Z'
  });
}

test('exact unauthenticated /study application redirect is healthy', () => {
  const result = healthyProbe();
  assert.equal(result.healthy, true);
  assert.equal(result.status, 303);
  assert.equal(result.location, `${BASE_URL}/sign-in?redirect=%2Fstudy`);
  assert.equal(result.fence_header, null);
});

test('active learner-runtime fence is never healthy', () => {
  const result = evaluateStudyResponse(
    { status: 503, location: null, fenceHeader: 'active' },
    BASE_URL
  );
  assert.equal(result.healthy, false);
  assert.match(result.reasons.join(' '), /fence header is active/i);
});

test('generic Cloudflare failures, unrelated redirects, and arbitrary 200 responses fail closed', () => {
  for (const status of [500, 502, 503, 504]) {
    assert.equal(
      evaluateStudyResponse({ status, location: null, fenceHeader: null }, BASE_URL).healthy,
      false,
      `HTTP ${status} must fail closed`
    );
  }

  assert.equal(
    evaluateStudyResponse({ status: 303, location: '/login', fenceHeader: null }, BASE_URL).healthy,
    false
  );
  assert.equal(
    evaluateStudyResponse({ status: 200, location: null, fenceHeader: null }, BASE_URL).healthy,
    false
  );
});

test('Version Metadata binds the public edge to the exact control-plane Worker', () => {
  const matching = metadataIdentity();
  assert.equal(matching.healthy, true);
  assert.equal(matching.mode, 'version-metadata');
  assert.equal(matching.edge_worker_version, FUTURE_VERSION);

  const mismatch = evaluateWorkerIdentity(
    {
      status: 200,
      body: {
        learnerRuntimeWorkerVersion: OTHER_VERSION,
        learnerRuntimeBuildSha: SHA
      }
    },
    FUTURE_VERSION
  );
  assert.equal(mismatch.healthy, false);
  assert.match(mismatch.reasons.join(' '), /does not match control-plane Worker/i);
});

test('missing Version Metadata fails closed except for the single documented run-20 LKG bootstrap', () => {
  const legacy = evaluateWorkerIdentity({ status: 404, body: null }, LEGACY_BOOTSTRAP_LKG_VERSION);
  assert.equal(legacy.healthy, true);
  assert.equal(legacy.mode, 'legacy-known-lkg');

  const unknown = evaluateWorkerIdentity({ status: 404, body: null }, FUTURE_VERSION);
  assert.equal(unknown.healthy, false);
  assert.equal(unknown.mode, 'invalid');
  assert.match(unknown.reasons.join(' '), /did not expose a valid learnerRuntimeWorkerVersion/i);
});

test('normal unfenced legacy capture is bounded to the known run-20 recovery target', () => {
  const record = validRecord();
  assert.equal(record.verified_unfenced, true);
  assert.equal(record.worker_version_id, VERSION);
  assert.equal(record.verification.worker_version_before, VERSION);
  assert.equal(record.verification.worker_version_after, VERSION);
  assert.equal(record.verification.identity.mode, 'legacy-known-lkg');
  assert.equal(record.verification.status, 303);
  assert.equal(record.verification.location, `${BASE_URL}/sign-in?redirect=%2Fstudy`);

  assert.equal(
    validateRecoveryRecord(record, {
      baseUrl: BASE_URL,
      runId: '33749984574',
      runAttempt: '1',
      sha: SHA
    }),
    VERSION
  );
});

test('future recovery records require exact serving Worker identity', () => {
  assert.throws(
    () =>
      buildRecoveryRecord({
        versionBefore: FUTURE_VERSION,
        versionAfter: FUTURE_VERSION,
        probe: healthyProbe(),
        baseUrl: BASE_URL,
        runId: '33749984574',
        runAttempt: '1',
        sha: SHA
      }),
    /Worker identity probe is missing/i
  );

  const record = buildRecoveryRecord({
    versionBefore: FUTURE_VERSION,
    versionAfter: FUTURE_VERSION,
    probe: healthyProbe(),
    identity: metadataIdentity(),
    baseUrl: BASE_URL,
    runId: '33749984574',
    runAttempt: '1',
    sha: SHA,
    capturedAt: '2026-09-05T10:00:00.000Z'
  });
  assert.equal(record.verification.identity.edge_worker_version, FUTURE_VERSION);
  assert.equal(
    validateRecoveryRecord(record, {
      baseUrl: BASE_URL,
      runId: '33749984574',
      runAttempt: '1',
      sha: SHA
    }),
    FUTURE_VERSION
  );

  const tampered = structuredClone(record);
  tampered.verification.identity.edge_worker_version = OTHER_VERSION;
  assert.throws(
    () => validateRecoveryRecord(tampered, {
      baseUrl: BASE_URL,
      runId: '33749984574',
      runAttempt: '1',
      sha: SHA
    }),
    /does not bind the public edge to the recovery target/i
  );
});

test('capture refuses Worker changes and already-fenced application state', () => {
  assert.throws(
    () =>
      buildRecoveryRecord({
        versionBefore: VERSION,
        versionAfter: FUTURE_VERSION,
        probe: healthyProbe(),
        baseUrl: BASE_URL,
        runId: '33749984574',
        runAttempt: '1',
        sha: SHA
      }),
    /changed during unfenced verification/i
  );

  const fencedProbe = evaluateStudyResponse(
    { status: 503, location: null, fenceHeader: 'active' },
    BASE_URL
  );
  assert.throws(
    () =>
      buildRecoveryRecord({
        versionBefore: VERSION,
        versionAfter: VERSION,
        probe: fencedProbe,
        baseUrl: BASE_URL,
        runId: '33749984574',
        runAttempt: '1',
        sha: SHA
      }),
    /does not prove an unfenced Production application/i
  );
});

test('recovery rejects legacy IDs, unverified evidence, and provenance mismatches', () => {
  assert.throws(
    () =>
      validateRecoveryRecord(VERSION, {
        baseUrl: BASE_URL,
        runId: '33749984574',
        runAttempt: '1',
        sha: SHA
      }),
    /JSON object/i
  );

  const unverified = structuredClone(validRecord());
  unverified.verified_unfenced = false;
  assert.throws(
    () =>
      validateRecoveryRecord(unverified, {
        baseUrl: BASE_URL,
        runId: '33749984574',
        runAttempt: '1',
        sha: SHA
      }),
    /not positively verified/i
  );

  assert.throws(
    () =>
      validateRecoveryRecord(validRecord(), {
        baseUrl: BASE_URL,
        runId: '999',
        runAttempt: '1',
        sha: SHA
      }),
    /source run ID does not match/i
  );
  assert.throws(
    () =>
      validateRecoveryRecord(validRecord(), {
        baseUrl: BASE_URL,
        runId: '33749984574',
        runAttempt: '1',
        sha: '1111111111111111111111111111111111111111'
      }),
    /source SHA does not match/i
  );
});
