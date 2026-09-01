// @ts-nocheck
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASE_LIBRARY_STATE_KEY,
  CASE_LIBRARY_STATE_VERSION,
  caseLibraryNamedActionHref,
  caseLibraryReturnQuery,
  caseLibraryStateHref,
  clearCaseLibraryStoredState,
  hasExplicitCaseLibraryQuery,
  parseCaseLibraryStoredState,
  readCaseLibraryStoredState,
  shouldRestoreCaseLibraryState,
  writeCaseLibraryStoredState
} from '../src/lib/admin-case-library-state.ts';

function memoryStorage(initial = null) {
  const values = new Map();
  if (initial !== null) values.set(CASE_LIBRARY_STATE_KEY, initial);
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
    value() { return values.get(CASE_LIBRARY_STATE_KEY) ?? null; }
  };
}

test('Case Library stored state normalizes the supported working context', () => {
  assert.equal(CASE_LIBRARY_STATE_KEY, 'flash-cards:admin:case-library-state:v2');
  const parsed = parseCaseLibraryStoredState(JSON.stringify({
    version: CASE_LIBRARY_STATE_VERSION,
    q: ' uveitis ',
    topic: ' topic-retina ',
    system: ' system-eye ',
    tag: 'tag-1',
    sort: 'system-desc',
    lifecycle: 'inactive',
    page: 3,
    cases: [{ id: 'must-not-be-accepted' }]
  }));
  assert.deepEqual(parsed, {
    version: 2,
    q: 'uveitis',
    topic: 'topic-retina',
    system: 'system-eye',
    tag: 'tag-1',
    sort: 'system-desc',
    lifecycle: 'inactive',
    page: 3
  });
  assert.equal(Object.hasOwn(parsed, 'cases'), false);
});

test('malformed and stale Case Library state fails safely', () => {
  assert.equal(parseCaseLibraryStoredState('{bad json'), null);
  assert.equal(parseCaseLibraryStoredState(JSON.stringify({ version: 0, q: 'old' })), null);
  assert.equal(parseCaseLibraryStoredState(JSON.stringify({ version: 1, topic: 'pericarditis', system: 'Unassigned' })), null, 'v1 text taxonomy filters must not be restored as v2 IDs');
  assert.deepEqual(parseCaseLibraryStoredState(JSON.stringify({ version: CASE_LIBRARY_STATE_VERSION, sort: 'evil', lifecycle: 'other', page: -8 })), {
    version: 2,
    q: '', topic: '', system: '', tag: '', sort: 'case-asc', lifecycle: 'active', page: 1
  });
});

test('stored Case Library state round-trips through the normal URL model', () => {
  const storage = memoryStorage();
  writeCaseLibraryStoredState({ version: CASE_LIBRARY_STATE_VERSION, q: 'uveitis', topic: 'topic-retina', system: 'system-eye', tag: 'tag-1', sort: 'topic-desc', lifecycle: 'inactive', page: 4 }, storage);
  assert.deepEqual(readCaseLibraryStoredState(storage), {
    version: 2, q: 'uveitis', topic: 'topic-retina', system: 'system-eye', tag: 'tag-1', sort: 'topic-desc', lifecycle: 'inactive', page: 4
  });
  assert.equal(caseLibraryStateHref(readCaseLibraryStoredState(storage)), '/admin/cases?q=uveitis&topic=topic-retina&system=system-eye&tag=tag-1&sort=topic-desc&lifecycle=inactive&page=4');
});

test('deliberate default-state navigation stays explicit so persisted state cannot override it', () => {
  const defaultState = { version: CASE_LIBRARY_STATE_VERSION, q: '', topic: '', system: '', tag: '', sort: 'case-asc', lifecycle: 'active', page: 1 };
  const activeHref = caseLibraryStateHref(defaultState, ['lifecycle']);
  const firstPageHref = caseLibraryStateHref(defaultState, ['page']);
  const defaultSortHref = caseLibraryStateHref(defaultState, ['sort']);

  assert.equal(activeHref, '/admin/cases?lifecycle=active');
  assert.equal(firstPageHref, '/admin/cases?page=1');
  assert.equal(defaultSortHref, '/admin/cases?sort=case-asc');
  for (const href of [activeHref, firstPageHref, defaultSortHref]) {
    assert.equal(hasExplicitCaseLibraryQuery(new URL(href, 'https://example.test').searchParams), true, href);
  }
});

test('default active state and Clear remove the remembered working state', () => {
  const storage = memoryStorage(JSON.stringify({ version: CASE_LIBRARY_STATE_VERSION, q: 'old' }));
  writeCaseLibraryStoredState({ version: CASE_LIBRARY_STATE_VERSION, q: '', topic: '', system: '', tag: '', sort: 'case-asc', lifecycle: 'active', page: 1 }, storage);
  assert.equal(storage.value(), null);
  writeCaseLibraryStoredState({ version: CASE_LIBRARY_STATE_VERSION, q: 'new', topic: '', system: '', tag: '', sort: 'case-asc', lifecycle: 'active', page: 1 }, storage);
  assert.notEqual(storage.value(), null);
  clearCaseLibraryStoredState(storage);
  assert.equal(storage.value(), null);
});

test('recognized URL query state is detectable so explicit URLs can win', () => {
  assert.equal(hasExplicitCaseLibraryQuery(new URLSearchParams()), false);
  for (const query of ['q=', 'topic=topic-retina', 'system=__unassigned__', 'tag=x', 'sort=case-desc', 'lifecycle=inactive', 'page=2']) {
    assert.equal(hasExplicitCaseLibraryQuery(new URLSearchParams(query)), true, query);
  }
});

test('named action targets preserve Case Library query context and failed actions suppress restoration', () => {
  const actionHref = caseLibraryNamedActionHref('createCaseLibraryTopic', 'q=uveitis&system=system-eye&page=2');
  assert.equal(actionHref, '?q=uveitis&system=system-eye&page=2&/createCaseLibraryTopic');
  const actionParams = new URLSearchParams(actionHref.slice(1));
  assert.equal(actionParams.get('q'), 'uveitis');
  assert.equal(actionParams.get('system'), 'system-eye');
  assert.equal(actionParams.get('page'), '2');
  assert.equal(actionParams.has('/createCaseLibraryTopic'), true);
  assert.equal(shouldRestoreCaseLibraryState(actionParams, false), false);
  assert.equal(shouldRestoreCaseLibraryState(new URLSearchParams('/createCaseLibraryTopic'), true), false);
  assert.equal(shouldRestoreCaseLibraryState(new URLSearchParams(), false), true);
  assert.equal(caseLibraryNamedActionHref('bulkPromoteTopic'), '?/bulkPromoteTopic');

  const retryQuery = caseLibraryReturnQuery(new URLSearchParams('q=uveitis&system=system-eye&page=2&/bulkAddCaseTag&unknown=drop-me'));
  assert.equal(retryQuery, 'q=uveitis&system=system-eye&page=2');
  assert.equal(caseLibraryNamedActionHref('bulkRemoveCaseTag', retryQuery), '?q=uveitis&system=system-eye&page=2&/bulkRemoveCaseTag');
  assert.equal(caseLibraryReturnQuery(new URLSearchParams('lifecycle=active&page=1&/bulkRestoreCases')), 'lifecycle=active&page=1');
});
