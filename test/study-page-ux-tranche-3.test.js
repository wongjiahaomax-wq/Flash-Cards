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
  assert.match(page, /disabled=\{Boolean\(data\.activeReview\) \|\| deletionBlocked \|\| planning \|\| opening \|\| !hasAppliedSystemSelection\(\)\}/);
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
    countMessage: 'Overlapping Cases are counted once across your selection.',
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
  assert.match(page, /previous session is still available/);
  assert.doesNotMatch(page, /startPlannedRun[\s\S]*?clearLearnerStudyRun\(localStorage\)/);
});

test('a successful Study open stays reachable when updated descriptor storage fails', () => {
  const page = source('src/routes/study/+page.svelte');
  const openRunStart = page.indexOf('async function openRun(descriptor) {');
  const openRunEnd = page.indexOf('  /** @type', openRunStart);
  assert.ok(openRunStart >= 0 && openRunEnd > openRunStart, 'Study openRun implementation should remain present');
  const openRun = page.slice(openRunStart, openRunEnd);
  const persistenceFailure = openRun.match(/if \(!persisted\.ok\) \{[\s\S]*?\n        \}/);
  assert.ok(persistenceFailure, 'Study openRun should retain an explicit persistence-failure branch');
  assert.match(persistenceFailure[0], /browserRun = persisted\.descriptor/);
  assert.match(persistenceFailure[0], /previous session is still available/);
  assert.match(
    persistenceFailure[0],
    /if \(payload\.status === 'review' && payload\.reviewId\) \{[\s\S]*?await goto\(`\/study\/\$\{payload\.reviewId\}`\);/
  );
  assert.match(persistenceFailure[0], /return;/);
  assert.doesNotMatch(persistenceFailure[0], /requestNextLearnerStudyWork\(/);
});

test('Study launcher follows the learner sequence and gates Start on applied Systems', () => {
  const page = source('src/routes/study/+page.svelte');
  const systems = page.indexOf('<div class="system-grid">');
  const options = page.indexOf('<section class="run-options-card">');
  assert.ok(systems >= 0 && options > systems, 'System selection should appear before mode and size options');
  assert.match(page, /function hasAppliedSystemSelection\(\)/);
  assert.match(page, /Object\.values\(scopeStates\)\.some\(\(scope\) => scope\.status !== 'UNSELECTED'\)/);
  assert.match(page, /disabled=\{Boolean\(data\.activeReview\) \|\| deletionBlocked \|\| planning \|\| opening \|\| !hasAppliedSystemSelection\(\)\}/);
  assert.match(page, /\{planning \? 'Starting…' : 'Start Study'\}/);
  assert.doesNotMatch(page, /disabled=\{[^}]*eligibleCount/);
});

test('Study learner copy keeps implementation details out of the primary flow', () => {
  const page = source('src/routes/study/+page.svelte');
  const settings = source('src/routes/study/settings/+page.svelte');
  const data = source('src/routes/study/settings/data/+page.svelte');
  const review = source('src/routes/study/[reviewId]/+page.svelte');
  assert.match(page, /Expanded Learning · more relevant questions/);
  assert.match(settings, /reusable questions relevant to the Case/);
  assert.match(data, /Start fresh scheduling/);
  assert.doesNotMatch(`${page}\n${settings}\n${data}\n${review}`, /browser-owned|Run id:|FSRS queue|FSRS transition|FSRS generation|server-resolved union|deduplicated candidate union|bounded deletion|empty-state check|next active Review is frozen/);
});
