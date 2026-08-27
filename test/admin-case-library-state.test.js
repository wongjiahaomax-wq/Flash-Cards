import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASE_LIBRARY_STATE_KEY,
  CASE_LIBRARY_STATE_VERSION,
  caseLibraryStateHref,
  clearCaseLibraryStoredState,
  hasExplicitCaseLibraryQuery,
  parseCaseLibraryStoredState,
  readCaseLibraryStoredState,
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
  const parsed = parseCaseLibraryStoredState(JSON.stringify({
    version: CASE_LIBRARY_STATE_VERSION,
    q: ' uveitis ',
    topic: ' eye ',
    system: ' Unassigned ',
    tag: 'tag-1',
    sort: 'system-desc',
    lifecycle: 'inactive',
    page: 3,
    cases: [{ id: 'must-not-be-accepted' }]
  }));
  assert.deepEqual(parsed, {
    version: 1,
    q: 'uveitis',
    topic: 'eye',
    system: 'Unassigned',
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
  assert.deepEqual(parseCaseLibraryStoredState(JSON.stringify({ version: 1, sort: 'evil', lifecycle: 'other', page: -8 })), {
    version: 1,
    q: '', topic: '', system: '', tag: '', sort: 'case-asc', lifecycle: 'active', page: 1
  });
});

test('stored Case Library state round-trips through the normal URL model', () => {
  const storage = memoryStorage();
  writeCaseLibraryStoredState({ version: 1, q: 'uveitis', topic: 'retina', system: 'Eye', tag: 'tag-1', sort: 'topic-desc', lifecycle: 'inactive', page: 4 }, storage);
  assert.deepEqual(readCaseLibraryStoredState(storage), {
    version: 1, q: 'uveitis', topic: 'retina', system: 'Eye', tag: 'tag-1', sort: 'topic-desc', lifecycle: 'inactive', page: 4
  });
  assert.equal(caseLibraryStateHref(readCaseLibraryStoredState(storage)), '/admin/cases?q=uveitis&topic=retina&system=Eye&tag=tag-1&sort=topic-desc&lifecycle=inactive&page=4');
});

test('default active state and Clear remove the remembered working state', () => {
  const storage = memoryStorage(JSON.stringify({ version: 1, q: 'old' }));
  writeCaseLibraryStoredState({ version: 1, q: '', topic: '', system: '', tag: '', sort: 'case-asc', lifecycle: 'active', page: 1 }, storage);
  assert.equal(storage.value(), null);
  writeCaseLibraryStoredState({ version: 1, q: 'new', topic: '', system: '', tag: '', sort: 'case-asc', lifecycle: 'active', page: 1 }, storage);
  assert.notEqual(storage.value(), null);
  clearCaseLibraryStoredState(storage);
  assert.equal(storage.value(), null);
});

test('recognized URL query state is detectable so explicit URLs can win', () => {
  assert.equal(hasExplicitCaseLibraryQuery(new URLSearchParams()), false);
  for (const query of ['q=', 'topic=x', 'system=Unassigned', 'tag=x', 'sort=case-desc', 'lifecycle=inactive', 'page=2']) {
    assert.equal(hasExplicitCaseLibraryQuery(new URLSearchParams(query)), true, query);
  }
});
