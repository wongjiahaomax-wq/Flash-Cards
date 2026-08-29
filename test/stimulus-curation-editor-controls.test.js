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

test('production Case editor exposes simple reversible Original/Alternative role controls without family-name authoring', () => {
  assert.match(panelSource, /Choose the roles/);
  assert.match(panelSource, /name="original_asset_id"/);
  assert.match(panelSource, /name="alternative_asset_id"/);
  assert.match(panelSource, /Save roles/);
  assert.match(panelSource, /action="\/admin\/stimulus-roles"/);
  assert.doesNotMatch(panelSource, /New family name/);
  assert.doesNotMatch(panelSource, /Start family with this Original/);
  assert.match(editorSource, /\{#if !data\.previewMode\}<StimulusOriginalsPanel \{selectedCase\} \/>\{\/if\}/);
  assert.match(panelSource, /action="\/admin\/stimulus-supporting"/);
  assert.match(panelSource, /name="case_id" value=\{selectedCase\.case\.id\}/);
  assert.match(panelSource, /name="option_id" value=\{option\.id\}/);
  assert.match(panelSource, /\{#if option\.id !== group\.originalOptionId\}[\s\S]*?Move to Always shown[\s\S]*?\{\/if\}/);
  assert.match(panelSource, /make another Alternative the Original first/i);
});