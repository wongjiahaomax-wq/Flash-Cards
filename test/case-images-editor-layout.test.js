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

test('Case image overview exposes learner-visible images, linked Q&A, semantic roles and Advanced management', () => {
  assert.match(section, /Images <span class="count">\{imageCount\}<\/span>/);
  assert.match(section, /Review each learner-visible image and its linked Q&A here/);
  assert.match(section, /role: option\.id === group\.originalOptionId \? 'Original' : 'Alternative'/);
  assert.match(section, /\? 'Always shown'[\s\S]*\? 'Original'[\s\S]*\? 'Needs role'/);
  assert.match(section, /scope: 'Image-specific'/);
  assert.match(section, /scope: 'Reusable'/);
  assert.match(section, /scope: 'Shared across this image set'/);
  assert.match(section, /aria-label="Questions linked to this image"/);
  assert.match(section, /<strong>Q<\/strong>/);
  assert.match(section, /<strong>A<\/strong>/);
  assert.match(section, />Advanced image management<\/button>/);
});

test('Advanced image management keeps role-based image-set authoring vocabulary', () => {
  assert.match(advanced, /Always-shown Case images/);
  assert.match(advanced, /Image-set actions/);
  assert.match(advanced, /Start image set with this Original/);
  assert.match(advanced, /Add as Alternative/);
  assert.match(advanced, />Image sets /);
});

test('production Advanced image management renders exactly one canonical images anchor', () => {
  assert.match(section, /<section id=\{advancedOpen \? undefined : 'images'\}/);
  assert.match(section, /\{#if advancedOpen\}[\s\S]*?<CaseImagesAdvanced/);
  assert.match(advanced, /<section id="images" class="panel stack image-authoring">/);
  assert.doesNotMatch(section, /<section id="images" class="panel image-overview"/);
});
