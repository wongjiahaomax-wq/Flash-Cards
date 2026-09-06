import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  LEARNER_STUDY_RUN_STORAGE_KEY,
  persistLearnerStudyRunReplacement,
  readLearnerStudyRun
} from '../src/lib/learner-study-run-storage.js';
import { createStudyCountController } from '../src/lib/study-count-controller.js';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Study count requests are built from applied hidden scope, not customization drafts', () => {
  const page = source('src/routes/study/+page.svelte');
  assert.match(page, /function scheduleEligibleCount\(\)/);
  assert.match(page, /function applyCustomize\(system\)[\s\S]*scheduleEligibleCount\(\)/);
  assert.match(page, /function setRoutes\(systemId, values, checked\)[\s\S]*updateScopeState\(systemId, \{ draftRoutes: nextRoutes \}\)/);
  const toggleGroup = page.match(/function toggleGroup\(system, routeType, checked\)[\s\S]*?\n  \}\r?\n\r?\n  \/\*\* @param \{'scheduled'\|'free'\} mode/);
  assert.ok(toggleGroup, 'toggleGroup source should remain present');
  assert.doesNotMatch(toggleGroup[0], /scheduleEligibleCount\(\)/);
  assert.match(page, /new FormData\(planForm\)/);
  assert.match(page, /name=\{`route:\$\{system\.id\}`\}/);
});

test('Study count failures remain informational and request sequencing suppresses stale responses', () => {
  const page = source('src/routes/study/+page.svelte');
  assert.match(page, /createStudyCountController/);
  assert.match(page, /countController\.refresh/);
  assert.match(page, /await update\(\{ invalidateAll: true \}\)/);
  assert.match(page, /disabled=\{Boolean\(data\.activeReview\) \|\| deletionBlocked \|\| planning \|\| opening\}/);
});

/** @param {any} payload @param {number} [status] */
function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

/** @typedef {{promise: Promise<any>, resolve: (value:any) => void}} Deferred */

/** @returns {Deferred} */
function deferred() {
  /** @type {(value:any) => void} */
  let resolve = () => {};
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

test('latest applied-scope count remains visible when an older response resolves afterward', async () => {
  /** @type {Deferred[]} */
  const requests = [];
  const controller = createStudyCountController(async () => {
    const pending = deferred();
    requests.push(pending);
    return pending.promise;
  });

  const older = controller.refresh(new FormData());
  const newer = controller.refresh(new FormData());
  assert.equal(requests.length, 2);

  requests[1].resolve(response({ candidateCount: 7, selectedSystemCount: 2 }));
  const latestState = await newer;
  assert.deepEqual(latestState, {
    eligibleCount: 7,
    selectedSystemCount: 2,
    countMessage: 'Server-resolved union; overlapping Cases are counted once.',
    counting: false
  });

  requests[0].resolve(response({ message: 'Count service unavailable' }, 503));
  const afterStaleState = await older;
  assert.deepEqual(afterStaleState, latestState);
  assert.equal(controller.snapshot().counting, false);
});

test('invalid count scope errors do not claim Study can still start', async () => {
  const controller = createStudyCountController(async () => response({ message: 'Select at least one study System.' }, 400));
  const state = await controller.refresh(new FormData());
  assert.equal(state.countMessage, 'Select at least one study System.');
  assert.doesNotMatch(state.countMessage, /You can still start Study/);
});

test('count outages clear only unavailable count data and preserve applied System count', async () => {
  const controller = createStudyCountController(async () => response({ message: 'Count service unavailable' }, 503));
  controller.begin(3);
  const state = await controller.refresh(new FormData(), 1);
  assert.equal(state.eligibleCount, null);
  assert.equal(state.selectedSystemCount, 3);
  assert.match(state.countMessage, /You can still start Study/);
});

/** @param {string} runId @returns {any} */
function studyRunDescriptor(runId) {
  return {
    version: 2,
    kind: 'free',
    userId: 'learner-1',
    runId,
    runStartedAt: 1,
    selectedScope: { systems: [{ systemId: 'system-1', mode: 'all' }] },
    currentReviewId: null,
    distinctCaseTarget: null,
    bag: ['case-1'],
    position: 0
  };
}

test('replacement persistence failure keeps the prior resumable descriptor recoverable', () => {
  const previous = studyRunDescriptor('previous');
  const storage = {
    value: JSON.stringify(previous),
    /** @param {string} key */
    getItem(key) { return key === LEARNER_STUDY_RUN_STORAGE_KEY ? this.value : null; },
    setItem() { throw new Error('Storage quota exceeded'); },
    removeItem() {}
  };
  const result = persistLearnerStudyRunReplacement(storage, studyRunDescriptor('replacement'), previous);
  assert.equal(result.ok, false);
  assert.equal(result.descriptor, previous);
  const persistenceError = /** @type {Error} */ (result.error);
  assert.match(persistenceError.message, /Storage quota exceeded/);
  assert.deepEqual(readLearnerStudyRun(storage), previous);
});

test('replacement browser run is committed only after a successful descriptor response', () => {
  const page = source('src/routes/study/+page.svelte');
  const successPath = /const descriptor = result\.data\?\.descriptor;[\s\S]*?const persisted = persistLearnerStudyRunReplacement\(localStorage, descriptor, browserRun\);[\s\S]*?const plannedRun = persisted\.descriptor;[\s\S]*?await openRun\(plannedRun\);/;
  assert.match(page, successPath);
  assert.match(page, /if \(result\.type !== 'success'\) \{[\s\S]*?await update\(\{ invalidateAll: true \}\);[\s\S]*?return;/);
  assert.match(page, /persistLearnerStudyRunReplacement\(localStorage, descriptor, browserRun\)/);
  assert.match(page, /previous resumable run was kept/);
  assert.doesNotMatch(page, /startPlannedRun[\s\S]*?clearLearnerStudyRun\(localStorage\)/);
});
