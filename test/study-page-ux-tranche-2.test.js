import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Study Systems use explicit applied scope states and never submit draft route controls', () => {
  const page = source('src/routes/study/+page.svelte');
  assert.match(page, /status:'UNSELECTED'\|'SELECTED_ALL'\|'SELECTED_ROUTES'/);
  assert.match(page, /function applyCustomize\(system\)/);
  assert.match(page, /function cancelCustomize\(systemId\)/);
  assert.match(page, /Whole System/);
  assert.match(page, /Specific Topics \/ Tags/);
  assert.match(page, /<input type="hidden" name="system" value=\{system\.id\} \/>/);
  assert.match(page, /name=\{`narrow:\$\{system\.id\}`\}/);
  assert.match(page, /name=\{`route:\$\{system\.id\}`\}/);
  assert.match(page, /disabled=\{draftScopeMode\(system\.id\) !== 'routes'\}/);
});

test('stale plan failures rehydrate the chooser from a fresh server navigation snapshot', () => {
  const server = source('src/routes/study/+page.server.js');
  const page = source('src/routes/study/+page.svelte');
  assert.match(server, /freshSystems: await listSystemStudySelectionSystems\(db\)/);
  assert.match(page, /Array\.isArray\(form\?\.freshSystems\) \? form\.freshSystems : data\.systems/);
  assert.match(page, /filter\(\(route\) => availableRoutes\.has\(route\)\)/);
  assert.match(page, /submitted\.mode === 'routes' && submittedRoutes\.length > 0/);
  assert.doesNotMatch(page, /submitted\.mode === 'routes'[^\n]*\? 'SELECTED_ALL'/);
});

test('eligible count remains informational and latest-request-wins', () => {
  const page = source('src/routes/study/+page.svelte');
  assert.match(page, /setTimeout\(\(\) => refreshEligibleCount\(requestId\), 120\)/);
  assert.match(page, /createStudyCountController/);
  assert.match(page, /countController\.begin/);
  assert.match(page, /countController\.refresh/);
  assert.doesNotMatch(page, /disabled=\{[^}]*eligibleCount/);
});
