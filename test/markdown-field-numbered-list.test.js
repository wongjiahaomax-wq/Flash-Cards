import assert from 'node:assert/strict';
import test from 'node:test';

import { toggleNumberedList } from '../src/lib/components/markdown-field-numbered-list.js';

test('numbered-list toolbar writes sequential markers, keeps blank lines, indentation and outside text', () => {
  const value = 'intro\n  alpha\n\nbeta\ngamma\noutro';
  const start = value.indexOf('  alpha');
  const end = value.indexOf('\noutro');

  const result = toggleNumberedList(value, start, end);

  assert.equal(result.value, 'intro\n  1. alpha\n\n2. beta\n3. gamma\noutro');
  assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), '  1. alpha\n\n2. beta\n3. gamma');
});

test('numbered-list toolbar toggle-off removes varying ordered markers', () => {
  const value = 'before\n  1. alpha\n\n2. beta\n  3. gamma\nafter';
  const start = value.indexOf('  1. alpha');
  const end = value.indexOf('\nafter');

  const result = toggleNumberedList(value, start, end);

  assert.equal(result.value, 'before\n  alpha\n\nbeta\n  gamma\nafter');
});

test('mixed numbered selections keep existing markers without duplicating them', () => {
  const value = '2. existing\nplain';
  const result = toggleNumberedList(value, 0, value.length);

  assert.equal(result.value, '2. existing\n2. plain');
  assert.doesNotMatch(result.value, /1\.\s+2\./);
});

test('numbered-list toolbar inserts its placeholder on one empty line', () => {
  const result = toggleNumberedList('', 0, 0);

  assert.equal(result.value, '1. List item');
  assert.equal(result.selectionStart, 0);
  assert.equal(result.selectionEnd, '1. List item'.length);
});

test('numbered-list toolbar handles a selected leading blank line without shifting its range', () => {
  const result = toggleNumberedList('\nalpha', 0, 0);

  assert.equal(result.value, '1. List item\nalpha');
});

test('numbered-list action does not renumber lines outside the selected line range', () => {
  const value = '1. unchanged above\nplain\n3. unchanged below';
  const start = value.indexOf('plain');
  const result = toggleNumberedList(value, start, start + 'plain'.length);

  assert.equal(result.value, '1. unchanged above\n1. plain\n3. unchanged below');
});
