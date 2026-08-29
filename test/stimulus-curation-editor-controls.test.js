import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panelSource = readFileSync(
  new URL('../src/lib/components/case-editor/StimulusOriginalsPanel.svelte', import.meta.url),
  'utf8'
);
const roleRouteSource = readFileSync(
  new URL('../src/routes/admin/stimulus-roles/+server.js', import.meta.url),
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
});

test('Case editor keeps role assignment reversible after curation', () => {
  assert.match(panelSource, /intent" value="set-original"/);
  assert.match(panelSource, /Use as Original/);
  assert.match(panelSource, /choose a different Original and save/i);
  assert.match(roleRouteSource, /setStimulusGroupOriginal/);
});
