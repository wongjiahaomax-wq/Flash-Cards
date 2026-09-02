import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FSRS_LIBRARY_VERSION,
  FSRS_SCHEDULER_REVISION,
  createDefaultFsrsParameters,
  serializeFsrsParameters
} from '../src/lib/server/learning/fsrs-scheduler.js';
import {
  StudyRunPlanningError,
  buildFreeStudyRunDescriptor,
  buildScheduledStudyRunDescriptor
} from '../src/lib/server/learning/study-run-planner.js';
import { verifyCapturedMembership } from '../src/lib/server/learning/study-run-proof.js';

const secret = 'test-study-run-planner-secret-0123456789abcdefghijklmnopqrstuvwxyz';
const now = Date.UTC(2026, 8, 2, 12, 0, 0);

function profile() {
  return {
    generation: 1,
    reviewSequenceEpoch: 1,
    parameterRevision: 1,
    schedulerRevision: FSRS_SCHEDULER_REVISION,
    schedulerLibraryVersion: FSRS_LIBRARY_VERSION,
    parametersJson: serializeFsrsParameters(createDefaultFsrsParameters())
  };
}

/** @param {string} caseId @param {{stability:number,dueAt:number,stateRevision?:number}} input */
function state(caseId, { stability, dueAt, stateRevision = 1 }) {
  return {
    userId: 'learner',
    caseId,
    dueAt: new Date(dueAt),
    stability,
    difficulty: 5,
    state: 2,
    elapsedDays: 5,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 2,
    lapses: 0,
    lastReviewAt: new Date(now - (5 * 24 * 60 * 60 * 1000)),
    generation: 1,
    reviewSequenceEpoch: 1,
    parameterRevision: 1,
    schedulerRevision: FSRS_SCHEDULER_REVISION,
    schedulerLibraryVersion: FSRS_LIBRARY_VERSION,
    stateRevision
  };
}

test('Scheduled planner captures Due/New once, orders risk first, and keeps future state out of the run', async () => {
  const descriptor = await buildScheduledStudyRunDescriptor({
    userId: 'learner',
    systemId: 'cardio',
    routes: [{ routeType: 'topic', routeId: 'rhythm' }],
    candidates: [
      { id: 'due-low' },
      { id: 'due-high' },
      { id: 'future' },
      { id: 'new-seen' },
      { id: 'new-unseen' }
    ],
    profile: profile(),
    preferences: { scheduledOrder: 'due_first', expandedLearning: false },
    states: [
      state('due-low', { stability: 1, dueAt: now - 1_000, stateRevision: 5 }),
      state('due-high', { stability: 20, dueAt: now - 2_000, stateRevision: 3 }),
      state('future', { stability: 10, dueAt: now + 60_000, stateRevision: 2 })
    ],
    encounters: [
      {
        userId: 'learner',
        caseId: 'new-seen',
        firstScheduledCompletedAt: new Date(now - 10_000),
        freeFirstSeenAt: null,
        freeLastSeenAt: null,
        freeTimesStudied: 0
      }
    ],
    proofSecret: secret,
    now,
    rng: () => 0.25,
    runId: 'run-1',
    membershipChunkSize: 2
  });

  assert.equal(descriptor.kind, 'scheduled');
  assert.equal(descriptor.runStartedAt, now);
  assert.deepEqual(descriptor.capturedDue.map((entry) => entry.caseId), ['due-low', 'due-high']);
  assert.deepEqual(descriptor.capturedNew.map((entry) => entry.caseId), ['new-unseen', 'new-seen']);
  assert.equal(descriptor.capturedDue.some((entry) => entry.caseId === 'future'), false);
  assert.deepEqual(descriptor.repeatEntries, []);
  assert.deepEqual(descriptor.completedCaseIds, []);
  assert.equal(descriptor.consecutiveNewCompleted, 0);
  assert.equal(descriptor.scheduledOrder, 'due_first');
  assert.equal(descriptor.expandedLearning, false);

  const firstDue = descriptor.capturedDue[0];
  const verified = await verifyCapturedMembership({
    secret,
    userId: 'learner',
    runToken: descriptor.runBoundaryToken,
    membershipToken: descriptor.membershipProofs.due[firstDue.proofIndex],
    queueClass: 'due',
    caseId: firstDue.caseId
  });
  assert.equal(verified.stateRevision, firstDue.stateRevision);
  assert.equal(verified.dueAt, firstDue.dueAt);
});

test('Scheduled planner fails closed when persisted Case state crosses the scheduler/generation boundary', async () => {
  await assert.rejects(
    () => buildScheduledStudyRunDescriptor({
      userId: 'learner',
      systemId: 'cardio',
      routes: [{ routeType: 'topic', routeId: 'rhythm' }],
      candidates: [{ id: 'case-a' }],
      profile: profile(),
      preferences: { scheduledOrder: 'due_first', expandedLearning: false },
      states: [{ ...state('case-a', { stability: 1, dueAt: now - 1_000 }), generation: 2 }],
      encounters: [],
      proofSecret: secret,
      now,
      runId: 'run-2'
    }),
    (error) => error instanceof StudyRunPlanningError && error.code === 'state-boundary-mismatch'
  );
});

test('Free planner builds one deduplicated shuffle bag and does not create scheduler fields', () => {
  const descriptor = buildFreeStudyRunDescriptor({
    userId: 'learner',
    systemId: 'cardio',
    routes: [{ routeType: 'tag', routeId: 'ecg' }],
    candidates: [{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'c' }],
    preferences: { expandedLearning: true },
    now,
    rng: () => 0,
    runId: 'free-1'
  });
  assert.equal(descriptor.kind, 'free');
  assert.deepEqual(new Set(descriptor.bag), new Set(['a', 'b', 'c']));
  assert.equal(descriptor.bag.length, 3);
  assert.equal(descriptor.expandedLearning, true);
  assert.equal(descriptor.position, 0);
  assert.equal('schedulerBoundary' in descriptor, false);
  assert.equal('runBoundaryToken' in descriptor, false);
});
