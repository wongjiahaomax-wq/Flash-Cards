import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SCHEDULED_STUDY_CONSECUTIVE_NEW_LIMIT,
  applyScheduledCompletion,
  beginScheduledWork,
  selectNextScheduledWork,
  skipScheduledWork
} from '../src/lib/scheduled-study-run.js';

function descriptor(overrides = {}) {
  return {
    version: 1,
    kind: 'scheduled',
    scheduledOrder: 'due_first',
    capturedDue: [
      { caseId: 'due-1', stateRevision: 2, dueAt: 100, proofIndex: 0 },
      { caseId: 'due-2', stateRevision: 7, dueAt: 90, proofIndex: 0 }
    ],
    duePosition: 0,
    capturedNew: [
      { caseId: 'new-1', proofIndex: 0 },
      { caseId: 'new-2', proofIndex: 0 }
    ],
    newPosition: 0,
    membershipProofs: {
      due: ['due-proof'],
      new: ['new-proof']
    },
    repeatEntries: [],
    completedCaseIds: [],
    consecutiveNewCompleted: 0,
    currentReviewId: null,
    currentWork: null,
    ...overrides
  };
}

test('matured authenticated repeat takes priority over captured Due/New work', () => {
  const result = selectNextScheduledWork(descriptor({
    repeatEntries: [
      { caseId: 'repeat-later', stateRevision: 4, dueAt: 300, workProof: 'later-proof' },
      { caseId: 'repeat-now', stateRevision: 5, dueAt: 150, workProof: 'now-proof' }
    ]
  }), { serverNow: 200 });

  assert.equal(result.status, 'ready');
  assert.equal(result.work.queueClass, 'repeat');
  assert.equal(result.work.caseId, 'repeat-now');
  assert.equal(result.work.workProof, 'now-proof');
});

test('repeat maturity has no browser-clock fallback and future repeat yields an explicit waiting state', () => {
  assert.throws(
    () => selectNextScheduledWork(descriptor(), {}),
    /server-authoritative time/i
  );

  const result = selectNextScheduledWork(descriptor({
    capturedDue: [],
    capturedNew: [],
    repeatEntries: [{ caseId: 'repeat', stateRevision: 2, dueAt: 500, workProof: 'proof' }]
  }), { serverNow: 200 });
  assert.deepEqual(result, { status: 'waiting', nextRepeatDueAt: 500 });
});

test('Due-first and New-first preferences consume only the captured queues with fallback', () => {
  const dueFirst = selectNextScheduledWork(descriptor(), { serverNow: 200 });
  assert.equal(dueFirst.work.queueClass, 'due');
  assert.equal(dueFirst.work.caseId, 'due-1');
  assert.equal(dueFirst.work.workProof, 'due-proof');

  const newFirst = selectNextScheduledWork(descriptor(), { serverNow: 200, scheduledOrder: 'new_first' });
  assert.equal(newFirst.work.queueClass, 'new');
  assert.equal(newFirst.work.caseId, 'new-1');
  assert.equal(newFirst.work.workProof, 'new-proof');

  const fallback = selectNextScheduledWork(descriptor({ capturedDue: [] }), { serverNow: 200 });
  assert.equal(fallback.work.queueClass, 'new');
});

test('50-New guard blocks another introduction but never blocks Due or a matured repeat', () => {
  const atLimit = descriptor({ consecutiveNewCompleted: SCHEDULED_STUDY_CONSECUTIVE_NEW_LIMIT });
  const due = selectNextScheduledWork(atLimit, { serverNow: 200, scheduledOrder: 'new_first' });
  assert.equal(due.work.queueClass, 'due');

  const repeat = selectNextScheduledWork(descriptor({
    consecutiveNewCompleted: SCHEDULED_STUDY_CONSECUTIVE_NEW_LIMIT,
    repeatEntries: [{ caseId: 'repeat', stateRevision: 3, dueAt: 100, workProof: 'repeat-proof' }]
  }), { serverNow: 200 });
  assert.equal(repeat.work.queueClass, 'repeat');

  const blocked = selectNextScheduledWork(descriptor({
    capturedDue: [],
    consecutiveNewCompleted: SCHEDULED_STUDY_CONSECUTIVE_NEW_LIMIT
  }), { serverNow: 200 });
  assert.deepEqual(blocked, { status: 'new-limit-reached', limit: 50 });
});

test('committed New increments the streak, Due resets it, and repeat is neutral', () => {
  const newWork = selectNextScheduledWork(descriptor(), { serverNow: 200, scheduledOrder: 'new_first' }).work;
  let run = beginScheduledWork(descriptor(), newWork, 'review-new');
  run = applyScheduledCompletion(run, {
    eventId: 'review-new',
    caseId: 'new-1',
    queueClass: 'new',
    repeatEntry: { caseId: 'new-1', stateRevision: 1, dueAt: 500, workProof: 'repeat-new' }
  });
  assert.equal(run.newPosition, 1);
  assert.equal(run.consecutiveNewCompleted, 1);
  assert.equal(run.repeatEntries.length, 1);
  assert.deepEqual(run.completedCaseIds, ['new-1']);

  const dueWork = selectNextScheduledWork(run, { serverNow: 200 }).work;
  run = beginScheduledWork(run, dueWork, 'review-due');
  run = applyScheduledCompletion(run, {
    eventId: 'review-due',
    caseId: 'due-1',
    queueClass: 'due',
    repeatEntry: null
  });
  assert.equal(run.duePosition, 1);
  assert.equal(run.consecutiveNewCompleted, 0);

  const matured = selectNextScheduledWork(run, { serverNow: 600 }).work;
  assert.equal(matured.queueClass, 'repeat');
  run = beginScheduledWork(run, matured, 'review-repeat');
  run = applyScheduledCompletion(run, {
    eventId: 'review-repeat',
    caseId: 'new-1',
    queueClass: 'repeat',
    repeatEntry: { caseId: 'new-1', stateRevision: 2, dueAt: 900, workProof: 'repeat-new-2' }
  });
  assert.equal(run.consecutiveNewCompleted, 0);
  assert.equal(run.repeatEntries.length, 1);
  assert.equal(run.repeatEntries[0].stateRevision, 2);
  assert.equal(run.repeatEntries[0].workProof, 'repeat-new-2');
});

test('completion replay after local advancement is harmless and skip advances only the authenticated work item', () => {
  const dueWork = selectNextScheduledWork(descriptor(), { serverNow: 200 }).work;
  let run = beginScheduledWork(descriptor(), dueWork, 'review-1');
  const receipt = {
    eventId: 'review-1',
    caseId: 'due-1',
    queueClass: 'due',
    repeatEntry: null
  };
  run = applyScheduledCompletion(run, receipt);
  const replayed = applyScheduledCompletion(run, receipt);
  assert.deepEqual(replayed, run);

  const nextDue = selectNextScheduledWork(run, { serverNow: 200 }).work;
  const skipped = skipScheduledWork(run, nextDue);
  assert.equal(skipped.duePosition, 2);
});
