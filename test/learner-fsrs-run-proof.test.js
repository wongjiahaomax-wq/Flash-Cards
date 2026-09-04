import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StudyRunProofError,
  fingerprintStudyScope,
  issueCapturedMembershipProofs,
  issueScheduledRepeatOriginProof,
  issueScheduledRunBoundaryToken,
  verifyCapturedMembership,
  verifyScheduledRepeatOriginProof,
  verifyScheduledRunBoundaryToken
} from '../src/lib/server/learning/study-run-proof.js';

const secret = 'test-study-run-proof-secret-0123456789abcdefghijklmnopqrstuvwxyz';
const otherSecret = 'other-study-run-proof-secret-0123456789abcdefghijklmnopqrstuvwxyz';

function boundary(overrides = {}) {
  return {
    userId: 'learner-1',
    runId: 'run-1',
    runStartedAt: Date.UTC(2026, 8, 2, 0, 0, 0),
    scopeFingerprint: 'scope-1',
    generation: 2,
    reviewSequenceEpoch: 3,
    parameterRevision: 4,
    schedulerRevision: 1,
    schedulerLibraryVersion: '5.4.2',
    ...overrides
  };
}

test('scope fingerprint is deterministic for the canonical normalized v2 selection', async () => {
  const scope = {
    systems: [{
      systemId: 'cardio',
      mode: 'routes',
      routes: [
        { routeType: /** @type {const} */ ('topic'), routeId: 'rhythm' },
        { routeType: /** @type {const} */ ('tag'), routeId: 'ecg' }
      ]
    }]
  };
  assert.equal(
    await fingerprintStudyScope(scope),
    await fingerprintStudyScope({ systems: scope.systems.map((system) => ({ ...system, routes: [...system.routes] })) })
  );
  const reversed = {
    systems: [{ ...scope.systems[0], routes: [...scope.systems[0].routes].reverse() }]
  };
  assert.notEqual(
    await fingerprintStudyScope(scope),
    await fingerprintStudyScope(reversed),
    'v2 scope normalization owns canonical route order before fingerprinting'
  );
});

test('scheduled run boundary authenticates learner and revision/scope identity', async () => {
  const expected = boundary();
  const token = await issueScheduledRunBoundaryToken({ secret, boundary: expected });
  assert.deepEqual(
    await verifyScheduledRunBoundaryToken(token, { secret, userId: expected.userId }),
    expected
  );
  await assert.rejects(
    () => verifyScheduledRunBoundaryToken(token, { secret, userId: 'learner-2' }),
    (error) => error instanceof StudyRunProofError && error.code === 'wrong-owner'
  );
  await assert.rejects(
    () => verifyScheduledRunBoundaryToken(token, { secret: otherSecret, userId: expected.userId }),
    (error) => error instanceof StudyRunProofError && error.code === 'invalid-signature'
  );
});

test('captured membership chunks bind Case, queue class, run boundary and Due state fingerprint', async () => {
  const expected = boundary();
  const runToken = await issueScheduledRunBoundaryToken({ secret, boundary: expected });
  const dueProofs = await issueCapturedMembershipProofs({
    secret,
    runToken,
    boundary: expected,
    queueClass: 'due',
    chunkSize: 2,
    entries: [
      { caseId: 'case-a', stateRevision: 4, dueAt: 100 },
      { caseId: 'case-b', stateRevision: 7, dueAt: 200 },
      { caseId: 'case-c', stateRevision: 9, dueAt: 300 }
    ]
  });
  assert.equal(dueProofs.length, 2);
  assert.deepEqual(
    await verifyCapturedMembership({
      secret,
      userId: 'learner-1',
      runToken,
      membershipToken: dueProofs[0],
      queueClass: 'due',
      caseId: 'case-b'
    }),
    {
      queueClass: 'due',
      caseId: 'case-b',
      stateRevision: 7,
      dueAt: 200,
      boundary: expected
    }
  );
  await assert.rejects(
    () => verifyCapturedMembership({
      secret,
      userId: 'learner-1',
      runToken,
      membershipToken: dueProofs[0],
      queueClass: 'due',
      caseId: 'case-c'
    }),
    (error) => error instanceof StudyRunProofError && error.code === 'not-member'
  );
  await assert.rejects(
    () => verifyCapturedMembership({
      secret,
      userId: 'learner-1',
      runToken,
      membershipToken: dueProofs[0],
      queueClass: 'new',
      caseId: 'case-a'
    }),
    (error) => error instanceof StudyRunProofError && error.code === 'wrong-queue'
  );

  const otherBoundary = boundary({ runId: 'run-2' });
  const otherRunToken = await issueScheduledRunBoundaryToken({ secret, boundary: otherBoundary });
  await assert.rejects(
    () => verifyCapturedMembership({
      secret,
      userId: 'learner-1',
      runToken: otherRunToken,
      membershipToken: dueProofs[0],
      queueClass: 'due',
      caseId: 'case-a'
    }),
    (error) =>
      error instanceof StudyRunProofError
      && (error.code === 'wrong-run' || error.code === 'wrong-boundary')
  );
});

test('New membership proves captured identity without pretending localStorage is scheduler authority', async () => {
  const expected = boundary();
  const runToken = await issueScheduledRunBoundaryToken({ secret, boundary: expected });
  const [membershipToken] = await issueCapturedMembershipProofs({
    secret,
    runToken,
    boundary: expected,
    queueClass: 'new',
    entries: [{ caseId: 'new-a' }, { caseId: 'new-b' }]
  });
  const verified = await verifyCapturedMembership({
    secret,
    userId: 'learner-1',
    runToken,
    membershipToken,
    queueClass: 'new',
    caseId: 'new-b'
  });
  assert.equal(verified.queueClass, 'new');
  assert.equal(verified.caseId, 'new-b');
  assert.equal(verified.boundary.runId, 'run-1');
});

test('repeat-origin proof binds the committed resulting Case state to the same run and Case', async () => {
  const expected = boundary();
  const runToken = await issueScheduledRunBoundaryToken({ secret, boundary: expected });
  const repeatToken = await issueScheduledRepeatOriginProof({
    secret,
    runToken,
    boundary: expected,
    caseId: 'case-a',
    stateRevision: 11,
    dueAt: expected.runStartedAt + 60_000
  });
  assert.deepEqual(
    await verifyScheduledRepeatOriginProof({
      secret,
      userId: expected.userId,
      runToken,
      repeatToken,
      caseId: 'case-a'
    }),
    {
      queueClass: 'repeat',
      caseId: 'case-a',
      stateRevision: 11,
      dueAt: expected.runStartedAt + 60_000,
      boundary: expected
    }
  );
  await assert.rejects(
    () => verifyScheduledRepeatOriginProof({
      secret,
      userId: expected.userId,
      runToken,
      repeatToken,
      caseId: 'case-b'
    }),
    (error) => error instanceof StudyRunProofError && error.code === 'wrong-case'
  );
  const otherBoundary = boundary({ runId: 'run-2' });
  const otherRunToken = await issueScheduledRunBoundaryToken({ secret, boundary: otherBoundary });
  await assert.rejects(
    () => verifyScheduledRepeatOriginProof({
      secret,
      userId: expected.userId,
      runToken: otherRunToken,
      repeatToken,
      caseId: 'case-a'
    }),
    (error) => error instanceof StudyRunProofError && error.code === 'wrong-run'
  );
});
