import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panelSource = readFileSync(
  new URL('../src/lib/components/case-editor/StimulusOriginalsPanel.svelte', import.meta.url),
  'utf8'
);
const editorSource = readFileSync(
  new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url),
  'utf8'
);
const roleRouteSource = readFileSync(
  new URL('../src/routes/admin/stimulus-roles/+server.js', import.meta.url),
  'utf8'
);
const supportingRouteSource = readFileSync(
  new URL('../src/routes/admin/stimulus-supporting/+server.js', import.meta.url),
  'utf8'
);

test('Case editor exposes the simple Original/Alternative picker without family-name authoring', () => {
  assert.match(panelSource, /Choose the roles/);
  assert.match(panelSource, /name="original_asset_id"/);
  assert.match(panelSource, /name="alternative_asset_id"/);
  assert.match(panelSource, /Save roles/);
  assert.match(panelSource, /action="\/admin\/stimulus-roles"/);
  assert.doesNotMatch(panelSource, /New family name/);
  assert.doesNotMatch(panelSource, /Start family with this Original/);
  assert.match(editorSource, /\{#if !data\.previewMode\}<StimulusOriginalsPanel \{selectedCase\} \/>\{\/if\}/);
});

test('an already-curated image set exposes post-curation Original reassignment through the canonical role route', () => {
  assert.match(panelSource, /Assigned roles/);
  assert.match(panelSource, /class="existing-role-form"/);
  assert.match(panelSource, /name="intent" value="set-original"/);
  assert.match(panelSource, /name="group_id" value=\{group\.id\}/);
  assert.match(panelSource, /name="option_id" value=\{option\.id\}/);
  assert.match(panelSource, /Use as Original/);
  assert.match(panelSource, /Choose a different Original and save/i);
  assert.match(roleRouteSource, /intent === 'set-original'[\s\S]*setStimulusGroupOriginal/);
});

test('only non-Original options can move to Always shown through the canonical conversion route', () => {
  assert.match(panelSource, /action="\/admin\/stimulus-supporting"/);
  assert.match(panelSource, /name="case_id" value=\{selectedCase\.case\.id\}/);
  assert.match(panelSource, /name="option_id" value=\{option\.id\}/);
  assert.match(panelSource, /\{#if option\.id !== group\.originalOptionId\}[\s\S]*?Move to Always shown[\s\S]*?\{\/if\}/);
  assert.match(panelSource, /make another Alternative the Original first/i);
  assert.match(supportingRouteSource, /convertStimulusOptionToSupporting/);
  assert.match(supportingRouteSource, /#stimulus-curation/);
});
