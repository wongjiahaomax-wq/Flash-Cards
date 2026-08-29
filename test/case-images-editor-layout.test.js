import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const section = readFileSync(
  new URL('../src/lib/components/case-editor/CaseImagesSection.svelte', import.meta.url),
  'utf8'
);
const advanced = readFileSync(
  new URL('../src/lib/components/case-editor/CaseImagesAdvanced.svelte', import.meta.url),
  'utf8'
);

test('production Advanced image management renders exactly one canonical images anchor', () => {
  assert.match(section, /<section id=\{advancedOpen \? undefined : 'images'\}/);
  assert.match(section, /\{#if advancedOpen\}[\s\S]*?<CaseImagesAdvanced/);
  assert.match(advanced, /<section id="images" class="panel stack image-authoring">/);
  assert.doesNotMatch(section, /<section id="images" class="panel image-overview"/);
});