import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../src/lib/components/case-editor/CaseImagesSection.svelte', import.meta.url),
  'utf8'
);

test('Case editor uses simple Case image terminology and keeps technical controls advanced', () => {
  assert.match(source, /Case images/);
  assert.match(source, /Use <strong>Image roles<\/strong> directly below/);
  assert.match(source, /Advanced image management/);
  assert.match(source, /Needs role/);
  assert.match(source, /Always shown/);
  assert.match(source, /Original/);
  assert.match(source, /Alternative/);
  assert.doesNotMatch(source, />Fixed images</);
  assert.doesNotMatch(source, /status: 'FIXED'/);
});
