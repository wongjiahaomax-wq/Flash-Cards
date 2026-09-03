import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { completeFsrsPreviewRequest } from '../src/lib/fsrs-preview-completion.js';
import {
  fsrsPreviewRunReturnHref,
  requestNextFsrsPreviewWork
} from '../src/lib/fsrs-preview-open.js';
import {
  applyFreeCompletion,
  beginFreeWork,
  selectNextFreeWork,
  skipFreeWork
} from '../src/lib/free-study-run.js';
import {
  clearFsrsPreviewRun,
  FSRS_PREVIEW_RUN_STORAGE_KEY,
  isFsrsPreviewRunOwnedBy,
  readFsrsPreviewRun,
  readFsrsPreviewRunForUser,
  writeFsrsPreviewRun
} from '../src/lib/fsrs-preview-run-storage.js';
import {
  applyScheduledCompletion,
  beginScheduledWork,
  selectNextScheduledWork
} from '../src/lib/scheduled-study-run.js';
import {
  STUDY_RUN_DEFAULT_DISTINCT_CASE_TARGET,
  parseStudyRunDistinctCaseTarget
} from '../src/lib/study-run-size.js';
import {
  getLearnerStudyPreviewHref,
  isLocalFsrsPreviewRequest,
  validateLocalFsrsPreviewRunOwner
} from '../src/lib/server/learning/local-fsrs-preview.js';

function freeDescriptor(overrides = {}) {
  return {
    version: 1,
    kind: 'free',
    userId: 'user-1',
    runId: 'run-1',
    runStartedAt: 1_000,
    selectedScope: { systemId: 'system-1', routes: [{ routeType: 'topic', routeId: 'topic-1' }] },
    expandedLearning: false,
    distinctCaseTarget: 10,
    bag: ['case-a', 'case-b'],
    position: 0,
    currentReviewId: null,
    ...overrides
  };
}

function scheduledDescriptor(overrides = {}) {
  return {
    version: 1,
    kind: 'scheduled',
    userId: 'user-1',
    runId: 'run-1',
    runStartedAt: 1_000,
    selectedScope: { systemId: 'system-1', routes: [{ routeType: 'topic', routeId: 'topic-1' }] },
    scopeFingerprint: 'scope-1',
    runBoundaryToken: 'run-token-1',
    schedulerBoundary: {
      generation: 1,
      reviewSequenceEpoch: 1,
      parameterRevision: 1,
      schedulerRevision: 1,
      schedulerLibraryVersion: 'test-scheduler'
    },
    scheduledOrder: 'due_first',
    expandedLearning: false,
    distinctCaseTarget: 10,
    capturedDue: [],
    duePosition: 0,
    capturedNew: [{ caseId: 'case-a', proofIndex: 0 }],
    newPosition: 0,
    membershipProofs: { version: 1, chunkSize: 100, due: [], new: ['new-proof-1'] },
    repeatEntries: [],
    completedCaseIds: [],
    consecutiveNewCompleted: 0,
    currentReviewId: null,
    currentWork: null,
    ...overrides
  };
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  /** @param {string} key */
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  /** @param {string} key @param {string} value */
  setItem(key, value) { this.values.set(key, String(value)); }
  /** @param {string} key */
  removeItem(key) { this.values.delete(key); }
}

/** @param {{mode:'scheduled'|'free'}} input */
function completionServices({ mode }) {
  let committed = false;
  let activeReads = 0;
  let completionCalls = 0;
  return {
    services: {
      async getActiveReviewById() {
        activeReads += 1;
        throw new Error('matching retry descriptor must reach the completion receipt before active Review lookup');
      },
      async completeScheduledReview() {
        assert.equal(mode, 'scheduled');
        completionCalls += 1;
        const status = committed ? 'replayed' : 'completed';
        committed = true;
        return {
          status,
          eventId: 'review-1',
          caseId: 'case-a',
          queueClass: 'new',
          repeatEntry: null
        };
      },
      async completeFreeReview() {
        assert.equal(mode, 'free');
        completionCalls += 1;
        const status = committed ? 'replayed' : 'completed';
        committed = true;
        return { status, receiptId: 'review-1', caseId: 'case-a' };
      },
      async issueScheduledRunBoundaryToken() {
        throw new Error('matching retry descriptor must not reconstruct the Scheduled run token');
      }
    },
    counts() { return { activeReads, completionCalls }; }
  };
}

test('run-size form contract defaults to 10 and accepts only 5, 10, 20, or All available', () => {
  assert.equal(STUDY_RUN_DEFAULT_DISTINCT_CASE_TARGET, 10);
  assert.equal(parseStudyRunDistinctCaseTarget(undefined), 10);
  assert.equal(parseStudyRunDistinctCaseTarget(''), 10);
  assert.equal(parseStudyRunDistinctCaseTarget('5'), 5);
  assert.equal(parseStudyRunDistinctCaseTarget('10'), 10);
  assert.equal(parseStudyRunDistinctCaseTarget('20'), 20);
  assert.equal(parseStudyRunDistinctCaseTarget('all'), null);
  assert.throws(() => parseStudyRunDistinctCaseTarget('25'), /5, 10, 20, or All available/);
});

test('Free browser run opens and advances exactly one bag entry per completion', () => {
  const descriptor = freeDescriptor();
  assert.deepEqual(selectNextFreeWork(descriptor), { status: 'ready', caseId: 'case-a' });
  const active = beginFreeWork(descriptor, 'case-a', 'review-1');
  assert.equal(active.currentReviewId, 'review-1');
  const completed = applyFreeCompletion(active, { receiptId: 'review-1', caseId: 'case-a' });
  assert.equal(completed.position, 1);
  assert.equal(completed.currentReviewId, null);
  assert.deepEqual(selectNextFreeWork(completed), { status: 'ready', caseId: 'case-b' });
});

test('Free Study enforces 5/10/20 distinct-Case boundaries and All available', () => {
  const bag = Array.from({ length: 25 }, (_, index) => `case-${index + 1}`);
  for (const target of [5, 10, 20]) {
    assert.deepEqual(
      selectNextFreeWork(freeDescriptor({ bag, distinctCaseTarget: target, position: target - 1 })),
      { status: 'ready', caseId: bag[target - 1] }
    );
    assert.deepEqual(
      selectNextFreeWork(freeDescriptor({ bag, distinctCaseTarget: target, position: target })),
      { status: 'complete' }
    );
  }
  assert.deepEqual(
    selectNextFreeWork(freeDescriptor({ bag, distinctCaseTarget: null, position: 20 })),
    { status: 'ready', caseId: bag[20] }
  );
  assert.deepEqual(
    selectNextFreeWork(freeDescriptor({ bag, distinctCaseTarget: null, position: bag.length })),
    { status: 'complete' }
  );
});

test('Free Study stale-entry skip preserves the distinct-Case target slot', () => {
  const descriptor = freeDescriptor({
    bag: ['stale-case', 'case-a', 'case-b'],
    distinctCaseTarget: 2
  });
  const skipped = skipFreeWork(descriptor, 'stale-case');
  assert.equal(skipped.position, 0);
  assert.deepEqual(skipped.bag, ['case-a', 'case-b']);
  assert.deepEqual(selectNextFreeWork(skipped), { status: 'ready', caseId: 'case-a' });

  const active = beginFreeWork(skipped, 'case-a', 'review-1');
  const completed = applyFreeCompletion(active, { receiptId: 'review-1', caseId: 'case-a' });
  assert.equal(completed.position, 1);
  assert.deepEqual(selectNextFreeWork(completed), { status: 'ready', caseId: 'case-b' });
});

test('Scheduled Study enforces 5/10/20 distinct-Case boundaries and All available', () => {
  for (const target of [5, 10, 20]) {
    const justBefore = scheduledDescriptor({
      distinctCaseTarget: target,
      completedCaseIds: Array.from({ length: target - 1 }, (_, index) => `completed-${index + 1}`)
    });
    assert.equal(selectNextScheduledWork(justBefore, { serverNow: 2_000 }).status, 'ready');

    const atTarget = scheduledDescriptor({
      distinctCaseTarget: target,
      completedCaseIds: Array.from({ length: target }, (_, index) => `completed-${index + 1}`)
    });
    assert.deepEqual(selectNextScheduledWork(atTarget, { serverNow: 2_000 }), { status: 'complete' });
  }

  const allAvailable = scheduledDescriptor({
    distinctCaseTarget: null,
    completedCaseIds: Array.from({ length: 20 }, (_, index) => `completed-${index + 1}`)
  });
  assert.equal(selectNextScheduledWork(allAvailable, { serverNow: 2_000 }).status, 'ready');
});

test('Scheduled repeat does not consume another distinct-Case slot and remains runnable after target', () => {
  let descriptor = scheduledDescriptor({
    distinctCaseTarget: 5,
    capturedNew: [{ caseId: 'case-f', proofIndex: 0 }],
    completedCaseIds: ['case-a', 'case-b', 'case-c', 'case-d', 'case-e'],
    repeatEntries: [{ caseId: 'case-a', stateRevision: 2, dueAt: 1_500, workProof: 'repeat-proof' }]
  });
  const selected = selectNextScheduledWork(descriptor, { serverNow: 2_000 });
  assert.equal(selected.status, 'ready');
  assert.ok(selected.work);
  assert.equal(selected.work.queueClass, 'repeat');
  descriptor = beginScheduledWork(descriptor, selected.work, 'repeat-review');
  descriptor = applyScheduledCompletion(descriptor, {
    eventId: 'repeat-review',
    caseId: 'case-a',
    queueClass: 'repeat',
    repeatEntry: null
  });
  assert.deepEqual(descriptor.completedCaseIds, ['case-a', 'case-b', 'case-c', 'case-d', 'case-e']);
  assert.deepEqual(selectNextScheduledWork(descriptor, { serverNow: 2_000 }), { status: 'complete' });
});

test('target reached with a future required Scheduled repeat waits instead of completing', () => {
  const descriptor = scheduledDescriptor({
    distinctCaseTarget: 5,
    completedCaseIds: ['a', 'b', 'c', 'd', 'e'],
    repeatEntries: [{ caseId: 'case-a', stateRevision: 2, dueAt: 5_000, workProof: 'repeat-proof' }]
  });
  assert.deepEqual(
    selectNextScheduledWork(descriptor, { serverNow: 2_000 }),
    { status: 'waiting', nextRepeatDueAt: 5_000 }
  );
});

test('Free completion replay after browser advancement is harmless', () => {
  const descriptor = freeDescriptor({ position: 1, currentReviewId: null });
  assert.equal(applyFreeCompletion(descriptor, { receiptId: 'old', caseId: 'case-a' }), descriptor);
});

test('preview run storage round-trips supported descriptors and clears browser-only state', () => {
  const storage = new MemoryStorage();
  const descriptor = freeDescriptor();
  writeFsrsPreviewRun(storage, descriptor);
  assert.deepEqual(readFsrsPreviewRun(storage), descriptor);
  clearFsrsPreviewRun(storage);
  assert.equal(readFsrsPreviewRun(storage), null);
});

test('legacy target-less preview descriptor remains readable as All available compatibility state', () => {
  const storage = new MemoryStorage();
  const descriptor = freeDescriptor();
  assert.equal(Reflect.deleteProperty(descriptor, 'distinctCaseTarget'), true);
  writeFsrsPreviewRun(storage, descriptor);
  assert.deepEqual(readFsrsPreviewRun(storage), descriptor);
  assert.deepEqual(selectNextFreeWork(descriptor), { status: 'ready', caseId: 'case-a' });
});

test('malformed persisted preview descriptors are discarded instead of reaching page rendering', () => {
  const storage = new MemoryStorage();
  storage.setItem(FSRS_PREVIEW_RUN_STORAGE_KEY, JSON.stringify({ version: 1, kind: 'scheduled' }));
  assert.equal(readFsrsPreviewRun(storage), null);
  assert.equal(storage.getItem(FSRS_PREVIEW_RUN_STORAGE_KEY), null);

  storage.setItem(FSRS_PREVIEW_RUN_STORAGE_KEY, '{not-json');
  assert.equal(readFsrsPreviewRun(storage), null);
  assert.equal(storage.getItem(FSRS_PREVIEW_RUN_STORAGE_KEY), null);
  assert.throws(
    () => writeFsrsPreviewRun(storage, { version: 1, kind: 'free' }),
    /descriptor is invalid/
  );
});

test('Free preview run cannot cross from learner A browser state to learner B', () => {
  const storage = new MemoryStorage();
  const learnerARun = freeDescriptor({ userId: 'learner-a', runId: 'learner-a-run' });
  writeFsrsPreviewRun(storage, learnerARun);

  assert.equal(isFsrsPreviewRunOwnedBy(learnerARun, 'learner-a'), true);
  assert.equal(isFsrsPreviewRunOwnedBy(learnerARun, 'learner-b'), false);
  assert.deepEqual(validateLocalFsrsPreviewRunOwner(learnerARun, 'learner-b'), {
    ok: false,
    status: 403,
    message: 'This preview run belongs to another learner. Plan a new run for the signed-in account.'
  });

  assert.equal(readFsrsPreviewRunForUser(storage, 'learner-b'), null);
  assert.equal(storage.getItem(FSRS_PREVIEW_RUN_STORAGE_KEY), null);
});

test('completion-to-next transport posts the advanced browser descriptor and returns the next Review', async () => {
  const descriptor = freeDescriptor({ position: 1 });
  let capturedUrl = '';
  /** @type {any} */
  let capturedInit = null;
  const result = await requestNextFsrsPreviewWork(descriptor, async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify({
      status: 'review',
      reviewId: 'review-2',
      descriptor: { ...descriptor, currentReviewId: 'review-2' }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  });
  assert.equal(capturedUrl, '/fsrs-preview/api/open');
  assert.equal(capturedInit?.method, 'POST');
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), { descriptor });
  assert.equal(result.payload.status, 'review');
  assert.equal(result.payload.reviewId, 'review-2');
  assert.equal(fsrsPreviewRunReturnHref({ status: 'complete' }), '/fsrs-preview?runStatus=complete');
  assert.match(
    fsrsPreviewRunReturnHref({ status: 'waiting', nextRepeatDueAt: 5_000 }),
    /runStatus=waiting&nextRepeatDueAt=5000/
  );
});

test('Scheduled completion HTTP orchestration replays after commit succeeds and the response is lost', async () => {
  const descriptor = scheduledDescriptor({
    currentReviewId: 'review-1',
    currentWork: { queueClass: 'new', caseId: 'case-a', stateRevision: null, dueAt: null }
  });
  const harness = completionServices({ mode: 'scheduled' });
  const input = {
    db: {},
    userId: 'user-1',
    reviewId: 'review-1',
    payload: { descriptor, rating: 'good' },
    proofSecret: 'preview-secret',
    now: 2_000
  };

  const first = await completeFsrsPreviewRequest(input, harness.services);
  const retry = await completeFsrsPreviewRequest(input, harness.services);
  assert.equal(first.status, 'completed');
  assert.equal(retry.status, 'replayed');
  assert.equal(first.runLost, false);
  assert.equal(retry.runLost, false);
  assert.deepEqual(retry.descriptor, first.descriptor);
  assert.equal(retry.descriptor.newPosition, 1);
  assert.equal(retry.descriptor.currentReviewId, null);
  assert.deepEqual(retry.descriptor.completedCaseIds, ['case-a']);
  assert.deepEqual(harness.counts(), { activeReads: 0, completionCalls: 2 });
});

test('Free completion HTTP orchestration replays after commit succeeds and the response is lost', async () => {
  const descriptor = freeDescriptor({ currentReviewId: 'review-1' });
  const harness = completionServices({ mode: 'free' });
  const input = {
    db: {},
    userId: 'user-1',
    reviewId: 'review-1',
    payload: { descriptor },
    proofSecret: 'preview-secret',
    now: 2_000
  };

  const first = await completeFsrsPreviewRequest(input, harness.services);
  const retry = await completeFsrsPreviewRequest(input, harness.services);
  assert.equal(first.status, 'completed');
  assert.equal(retry.status, 'replayed');
  assert.equal(first.runLost, false);
  assert.equal(retry.runLost, false);
  assert.deepEqual(retry.descriptor, first.descriptor);
  assert.equal(retry.descriptor.position, 1);
  assert.equal(retry.descriptor.currentReviewId, null);
  assert.deepEqual(harness.counts(), { activeReads: 0, completionCalls: 2 });
});

test('local preview requires both loopback request and loopback Better Auth binding', () => {
  const localEnv = { BETTER_AUTH_URL: 'http://localhost:5173' };
  assert.equal(isLocalFsrsPreviewRequest(new URL('http://localhost:5173/fsrs-preview'), localEnv), true);
  assert.equal(isLocalFsrsPreviewRequest(new URL('http://127.0.0.1:8787/fsrs-preview'), { BETTER_AUTH_URL: 'http://127.0.0.1:8787' }), true);
  assert.equal(isLocalFsrsPreviewRequest(new URL('https://flash-cards.example/fsrs-preview'), localEnv), false);
  assert.equal(isLocalFsrsPreviewRequest(new URL('http://localhost:5173/fsrs-preview'), { BETTER_AUTH_URL: 'https://flash-cards.example' }), false);
});

test('Admin learner-study links use FSRS preview only behind the strict local preview guard', async () => {
  const localEnv = { BETTER_AUTH_URL: 'http://localhost:5173' };
  assert.equal(getLearnerStudyPreviewHref(new URL('http://localhost:5173/admin'), localEnv), '/fsrs-preview');
  assert.equal(getLearnerStudyPreviewHref(new URL('https://flash-cards.example/admin'), localEnv), '/study');
  assert.equal(
    getLearnerStudyPreviewHref(new URL('http://localhost:5173/admin'), { BETTER_AUTH_URL: 'https://flash-cards.example' }),
    '/study'
  );

  const adminLayoutServer = await readFile(new URL('../src/routes/admin/+layout.server.js', import.meta.url), 'utf8');
  const adminLayout = await readFile(new URL('../src/routes/admin/+layout.svelte', import.meta.url), 'utf8');
  const adminDashboard = await readFile(new URL('../src/routes/admin/+page.svelte', import.meta.url), 'utf8');
  const casePage = await readFile(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
  const caseHeader = await readFile(new URL('../src/lib/components/case-editor/CaseEditorHeader.svelte', import.meta.url), 'utf8');
  const casePreview = await readFile(new URL('../src/lib/components/case-editor/CasePreviewSection.svelte', import.meta.url), 'utf8');

  assert.match(adminLayoutServer, /getLearnerStudyPreviewHref/);
  assert.match(adminLayoutServer, /learnerStudyPreviewHref:/);
  assert.match(adminLayout, /href=\{data\.learnerStudyPreviewHref \?\? '\/study'\}/);
  assert.match(adminDashboard, /href=\{data\.learnerStudyPreviewHref \?\? '\/study'\}/);
  assert.match(casePage, /let studyPreviewHref = \$derived\.by/);
  assert.match(casePage, /const \{ learnerStudyPreviewHref = '\/study' \} = data/);
  assert.match(casePage, /<CaseEditorHeader[^>]*\{studyPreviewHref\}/);
  assert.match(caseHeader, /href=\{studyPreviewHref \?\? '\/study'\}>Preview in Study/);
  assert.match(casePreview, /href=\{studyPreviewHref \?\? '\/study'\}>Open Study preview/);
});

test('preview route reuses staged FSRS service owners and auto-opens the next eligible Case after completion', async () => {
  const previewServer = await readFile(new URL('../src/routes/fsrs-preview/+page.server.js', import.meta.url), 'utf8');
  const previewPage = await readFile(new URL('../src/routes/fsrs-preview/+page.svelte', import.meta.url), 'utf8');
  const reviewPage = await readFile(new URL('../src/routes/fsrs-preview/review/[reviewId]/+page.svelte', import.meta.url), 'utf8');
  const openServer = await readFile(new URL('../src/routes/fsrs-preview/api/open/+server.js', import.meta.url), 'utf8');
  const completeServer = await readFile(new URL('../src/routes/fsrs-preview/api/complete/[reviewId]/+server.js', import.meta.url), 'utf8');
  const planningBoundary = await readFile(new URL('../src/lib/server/learning/plan-system-study.ts', import.meta.url), 'utf8');

  assert.match(previewServer, /planSystemStudyRunFromForm/);
  assert.match(previewServer, /setExpandedLearningPreference/);
  assert.match(planningBoundary, /parseStudyRunDistinctCaseTarget/);
  assert.match(planningBoundary, /distinctCaseTarget/);
  assert.match(previewPage, /name="runSize" value="5"/);
  assert.match(previewPage, /name="runSize" value="10"/);
  assert.match(previewPage, /name="runSize" value="20"/);
  assert.match(previewPage, /name="runSize" value="all"/);
  assert.match(openServer, /validateLocalFsrsPreviewRunOwner/);
  assert.match(openServer, /createScheduledActiveReview/);
  assert.match(openServer, /createFreeActiveReview/);
  assert.match(openServer, /skippableOpenError/);
  assert.match(openServer, /skipScheduledWork/);
  assert.match(openServer, /skipFreeWork/);
  assert.match(completeServer, /completeFsrsPreviewRequest/);
  assert.match(completeServer, /completeScheduledReview/);
  assert.match(completeServer, /completeFreeReview/);
  assert.match(reviewPage, /openFollowingReview\(browserRun\)/);
  assert.match(reviewPage, /requestNextFsrsPreviewWork/);
  assert.match(reviewPage, /goto\(`\/fsrs-preview\/review\/\$\{next\.payload\.reviewId\}`\)/);
});
