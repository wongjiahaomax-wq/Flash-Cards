import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chooserSource = readFileSync(new URL('../src/lib/components/study/SystemStudyChooser.svelte', import.meta.url), 'utf8');
const learnerPageSource = readFileSync(new URL('../src/routes/study/+page.svelte', import.meta.url), 'utf8');

test('flag-on learner Study delegates systems-first presentation to the shared chooser', () => {
  assert.match(learnerPageSource, /import SystemStudyChooser from '\$lib\/components\/study\/SystemStudyChooser\.svelte';/);
  assert.match(learnerPageSource, /<SystemStudyChooser systems=\{data\.systems\} \{form\} \/>/);
  assert.doesNotMatch(learnerPageSource, /action="\?\/startSystem"/);
  assert.match(learnerPageSource, /action="\?\/start"/i, 'legacy flag-off Topic start remains present');
});

test('shared chooser owns multi-select defaults, restoration, hierarchy controls, and selection start action', () => {
  assert.match(chooserSource, /action = '\?\/startSystemSelection'/);
  assert.match(chooserSource, /selectedRoutes = routesForSystem\(system\)/, 'choosing a System starts with every eligible route selected');
  assert.match(chooserSource, /actionForm\.selectedRoutes/);
  assert.match(chooserSource, /type="checkbox"[\s\S]*name="route"/);
  assert.match(chooserSource, /topicSubtreeRoutes/);
  assert.match(chooserSource, /use:indeterminate=/);
  assert.match(chooserSource, /Curated Tags/);
  assert.match(chooserSource, /Curated Tags can add relevant Cases across Topics/);
  assert.match(chooserSource, /Select all/);
  assert.match(chooserSource, /Clear all/);
  assert.match(chooserSource, /Original questions/);
  assert.match(chooserSource, /disabled=\{selectedCount === 0\}/);
  assert.match(chooserSource, /← Change System/);
});
