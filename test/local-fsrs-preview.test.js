import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { completeFsrsPreviewRequest } from '../src/lib/fsrs-preview-completion.js';
import {
  applyFreeCompletion,
  beginFreeWork,
  selectNextFreeWork
} from '../src/lib/free-study-run.js';
import {
  clearFsrsPreviewRun,
  FSRS_PREVIEW_RUN_STORAGE_KEY,
  readFsrsPreviewRun,
  writeFsrsPreviewRun
} from '../src/lib/fsrs-preview-run-storage.js';
import { isLocalFsrsPreviewRequest } from '../src/lib/server/learning/local-fsrs-preview.js';

function freeDescriptor(overrides = {}) {
  return {
    version: 1,
    kind: 'free',
    userId: 'user-1',
    runId: 'run-1',
    runStartedAt: 1_000,
    selectedScope: { systemId: 'system-1', routes: [{ routeType: 'topic', routeId: 'topic-1' }] },
    expandedLearning: false,
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

test('preview route reuses staged FSRS service owners and delegates completion orchestration', async () => {
  const previewServer = await readFile(new URL('../src/routes/fsrs-preview/+page.server.js', import.meta.url), 'utf8');
  const openServer = await readFile(new URL('../src/routes/fsrs-preview/api/open/+server.js', import.meta.url), 'utf8');
  const completeServer = await readFile(new URL('../src/routes/fsrs-preview/api/complete/[reviewId]/+server.js', import.meta.url), 'utf8');
  assert.match(previewServer, /planSystemStudyRunFromForm/);
  assert.match(previewServer, /setExpandedLearningPreference/);
  assert.match(openServer, /createScheduledActiveReview/);
  assert.match(openServer, /createFreeActiveReview/);
  assert.match(completeServer, /completeFsrsPreviewRequest/);
  assert.match(completeServer, /completeScheduledReview/);
  assert.match(completeServer, /completeFreeReview/);
});
