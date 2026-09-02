import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applyFreeCompletion,
  beginFreeWork,
  selectNextFreeWork
} from '../src/lib/free-study-run.js';
import {
  clearFsrsPreviewRun,
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
    selectedScope: { systemId: 'system-1', routes: [{ routeType: 'topic', routeId: 'topic-1' }] },
    expandedLearning: false,
    bag: ['case-a', 'case-b'],
    position: 0,
    currentReviewId: null,
    ...overrides
  };
}

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
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

test('local preview requires both loopback request and loopback Better Auth binding', () => {
  const localEnv = { BETTER_AUTH_URL: 'http://localhost:5173' };
  assert.equal(isLocalFsrsPreviewRequest(new URL('http://localhost:5173/fsrs-preview'), localEnv), true);
  assert.equal(isLocalFsrsPreviewRequest(new URL('http://127.0.0.1:8787/fsrs-preview'), { BETTER_AUTH_URL: 'http://127.0.0.1:8787' }), true);
  assert.equal(isLocalFsrsPreviewRequest(new URL('https://flash-cards.example/fsrs-preview'), localEnv), false);
  assert.equal(isLocalFsrsPreviewRequest(new URL('http://localhost:5173/fsrs-preview'), { BETTER_AUTH_URL: 'https://flash-cards.example' }), false);
});

test('preview route reuses staged FSRS service owners', async () => {
  const previewServer = await readFile(new URL('../src/routes/fsrs-preview/+page.server.js', import.meta.url), 'utf8');
  const openServer = await readFile(new URL('../src/routes/fsrs-preview/api/open/+server.js', import.meta.url), 'utf8');
  const completeServer = await readFile(new URL('../src/routes/fsrs-preview/api/complete/[reviewId]/+server.js', import.meta.url), 'utf8');
  assert.match(previewServer, /planSystemStudyRunFromForm/);
  assert.match(previewServer, /setExpandedLearningPreference/);
  assert.match(openServer, /createScheduledActiveReview/);
  assert.match(openServer, /createFreeActiveReview/);
  assert.match(completeServer, /completeScheduledReview/);
  assert.match(completeServer, /completeFreeReview/);
});
