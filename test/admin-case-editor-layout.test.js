import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASE_EDITOR_LAYOUT_STORAGE_KEY,
  DEFAULT_CASE_EDITOR_LAYOUT,
  getCaseEditorStorage,
  normalizeCaseEditorLayout,
  readCaseEditorLayout,
  writeCaseEditorLayout
} from '../src/lib/admin-case-editor-layout.js';

test('Case editor layout defaults to Compact for missing or unknown preferences', () => {
  assert.equal(DEFAULT_CASE_EDITOR_LAYOUT, 'compact');
  assert.equal(normalizeCaseEditorLayout(null), 'compact');
  assert.equal(normalizeCaseEditorLayout('unknown'), 'compact');
  assert.equal(readCaseEditorLayout({ getItem: () => null }), 'compact');
});

test('Case editor layout reads and persists Classic and Compact values', () => {
  /** @type {Map<string, string>} */
  const values = new Map();
  const storage = {
    /** @param {string} key */
    getItem(key) { return values.get(key) ?? null; },
    /** @param {string} key @param {string} value */
    setItem(key, value) { values.set(key, value); }
  };

  assert.equal(writeCaseEditorLayout(storage, 'classic'), 'classic');
  assert.equal(values.get(CASE_EDITOR_LAYOUT_STORAGE_KEY), 'classic');
  assert.equal(readCaseEditorLayout(storage), 'classic');

  assert.equal(writeCaseEditorLayout(storage, 'compact'), 'compact');
  assert.equal(values.get(CASE_EDITOR_LAYOUT_STORAGE_KEY), 'compact');
  assert.equal(readCaseEditorLayout(storage), 'compact');
});

test('Case editor layout fails safely when browser storage methods are unavailable', () => {
  assert.equal(readCaseEditorLayout({ getItem() { throw new Error('blocked'); } }), 'compact');
  assert.equal(writeCaseEditorLayout({ setItem() { throw new Error('blocked'); } }, 'classic'), 'classic');
  assert.equal(writeCaseEditorLayout(null, 'invalid'), 'compact');
});

test('Case editor layout fails safely when localStorage property access is blocked', () => {
  const blockedWindow = {};
  Object.defineProperty(blockedWindow, 'localStorage', {
    get() {
      throw new Error('blocked');
    }
  });

  assert.equal(getCaseEditorStorage(blockedWindow), null);
  assert.equal(readCaseEditorLayout(getCaseEditorStorage(blockedWindow)), 'compact');
  assert.equal(writeCaseEditorLayout(getCaseEditorStorage(blockedWindow), 'classic'), 'classic');
});
