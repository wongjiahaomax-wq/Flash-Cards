// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/routes/study/+page.server.js', import.meta.url), 'utf8');

test('flag-off learner route keeps selection-based System start behind the rollout gate', () => {
  const actionStart = source.indexOf('startSystemSelection:');
  assert.ok(actionStart >= 0, 'selection start action must be present for later shared UI wiring');
  const actionSource = source.slice(actionStart);
  assert.match(actionSource, /systemStudyNavigationEnabled\(platform\?\.env\)/);
  assert.match(actionSource, /throw error\(404/);
  assert.ok(
    actionSource.indexOf('systemStudyNavigationEnabled(platform?.env)') < actionSource.indexOf('startSystemStudyFromForm'),
    'the learner rollout gate must run before the shared selection-start workflow'
  );
});
