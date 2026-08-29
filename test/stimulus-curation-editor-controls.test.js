import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panelSource = readFileSync(
  new URL('../src/lib/components/case-editor/StimulusOriginalsPanel.svelte', import.meta.url),
  'utf8'
);

test('Case editor curation panel exposes fixed-image Original and Alternative controls directly', () => {
  assert.match(panelSource, /action="\?\/startAlternativeSet"/);
  assert.match(panelSource, /Start family with this Original/);
  assert.match(panelSource, /action="\?\/addStimulusOption"/);
  assert.match(panelSource, /name="convert_fixed" value="on"/);
  assert.match(panelSource, /Add as Alternative/);
  assert.doesNotMatch(panelSource, /Use the image controls below/);
});
