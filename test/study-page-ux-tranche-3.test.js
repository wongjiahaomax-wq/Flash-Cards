import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  assert.match(page, /You can still start Study/);
  assert.match(page, /if \(requestId !== countRequest\) return;/);
  assert.match(page, /if \(requestId === countRequest\) counting = false;/);
  assert.match(page, /disabled=\{Boolean\(data\.activeReview\) \|\| planning \|\| opening\}/);
});

test('replacement browser run is committed only after a successful descriptor response', () => {
  const page = source('src/routes/study/+page.svelte');
  const successPath = /const descriptor = result\.data\?\.descriptor;[\s\S]*?const plannedRun = writeLearnerStudyRun\(localStorage, descriptor\);[\s\S]*?await openRun\(plannedRun\);/;
  assert.match(page, successPath);
  assert.match(page, /if \(result\.type !== 'success'\) \{[\s\S]*?await applyAction\(result\);[\s\S]*?return;/);
  assert.doesNotMatch(page, /startPlannedRun[\s\S]*?clearLearnerStudyRun\(localStorage\)/);
});
