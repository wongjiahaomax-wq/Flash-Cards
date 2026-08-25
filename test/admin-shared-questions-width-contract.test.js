import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../src/routes/admin/shared-questions/+page.svelte', import.meta.url), 'utf8');

test('Shared Questions page uses the available admin content width', () => {
  assert.match(page, /\.page \{ width: 100%; display: grid; gap: 2rem; \}/);
  assert.match(page, /\.form-grid \{ display: grid; gap: 1rem; \}/);
  assert.doesNotMatch(page, /\.page \{ max-width:/);
  assert.doesNotMatch(page, /\.form-grid \{ display: grid; gap: 1rem; max-width:/);
});
