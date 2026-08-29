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

test('Case editor keeps the main Case image surface visual and exposes linked Q&A', () => {
  assert.match(section, /Case images/);
  assert.match(section, /Review each learner-visible image and its linked Q&A here/);
  assert.match(section, /Advanced image management/);
  assert.match(section, /Needs role/);
  assert.match(section, /Always shown/);
  assert.match(section, /Original/);
  assert.match(section, /Alternative/);
  assert.match(section, /questionsForImage/);
  assert.match(section, /Image-specific/);
  assert.match(section, /Reusable/);
  assert.match(section, /Shared across this image set/);
  assert.match(section, /<strong>Q<\/strong>/);
  assert.match(section, /<strong>A<\/strong>/);
  assert.doesNotMatch(section, />Fixed images/);
  assert.doesNotMatch(section, /status: 'FIXED'/);
});

test('Advanced image management uses the same role-based vocabulary', () => {
  assert.match(advanced, /Always-shown Case images/);
  assert.match(advanced, /Image-set actions/);
  assert.match(advanced, /Start image set with this Original/);
  assert.match(advanced, /Add as Alternative/);
  assert.match(advanced, />Image sets /);
  assert.doesNotMatch(advanced, />Fixed images/);
  assert.doesNotMatch(advanced, /Alternative-set actions/);
  assert.doesNotMatch(advanced, />Alternative image sets /);
});

test('production Advanced image management renders exactly one canonical images anchor', () => {
  assert.match(section, /<section id=\{advancedOpen \? undefined : 'images'\}/);
  assert.match(section, /\{#if advancedOpen\}[\s\S]*?<CaseImagesAdvanced/);
  assert.match(advanced, /<section id="images" class="panel stack image-authoring">/);
  assert.doesNotMatch(section, /<section id="images" class="panel image-overview"/);
});
