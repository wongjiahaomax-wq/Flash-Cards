import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chooserSource = readFileSync(
  new URL('../src/lib/components/study/SystemStudyChooser.svelte', import.meta.url),
  'utf8'
);
const formOwnerSource = readFileSync(
  new URL('../src/lib/server/learning/plan-system-study.ts', import.meta.url),
  'utf8'
);
const learnerPageServerSource = readFileSync(
  new URL('../src/routes/study/+page.server.js', import.meta.url),
  'utf8'
);

test('PR B chooser owns systems-first multi-select defaults, restoration and hierarchy controls', () => {
  assert.match(chooserSource, /= routesForSystem\(system\)/, 'choosing a System starts with every contributing route selected');
  assert.match(chooserSource, /actionForm\.selectedRoutes/);
  assert.match(chooserSource, /type="checkbox"[\s\S]*name=/);
  assert.match(chooserSource, /topicSubtreeRoutes/);
  assert.match(chooserSource, /use:indeterminate=/);
  assert.match(chooserSource, /Curated Tags/);
  assert.match(chooserSource, /Curated Tags can add relevant Cases across Topics/);
  assert.match(chooserSource, /Select all/);
  assert.match(chooserSource, /Clear all/);
  assert.match(chooserSource, /disabled=\{selectedCount === 0\}/);
  assert.match(chooserSource, /← Change System/);
});

test('zero-exact structural Topic parents control descendants without becoming submitted study routes', () => {
  assert.match(chooserSource, /subtreeCaseCount: number/);
  assert.match(
    chooserSource,
    /filter\(\(topic: StudyTopic\) => topic\.caseCount > 0\)/,
    'default route set excludes structural-only Topics'
  );
  assert.match(
    chooserSource,
    /name=\{topic\.caseCount > 0 \? 'route' : undefined\}/,
    'structural-only Topic checkbox must not submit a route'
  );
  assert.match(chooserSource, /checked=\{topicChecked\(selectedSystem, topic\)\}/);
  assert.match(chooserSource, /selectedRoutes\.filter\(\(value: string\) => contributingRoutes\.includes\(value\)\)\.length/);
  assert.match(chooserSource, /0 exact-Topic Cases · \{topic\.subtreeCaseCount\}/);
});

test('PR B removes per-run Original/Expanded choice and plans explicit Scheduled or Free descriptors', () => {
  assert.doesNotMatch(chooserSource, /questionPoolMode|Original questions|Expanded Learning/);
  assert.match(chooserSource, /name="studyMode"/);
  assert.match(formOwnerSource, /studyMode !== 'scheduled' && studyMode !== 'free'/);
  assert.match(formOwnerSource, /planScheduledSystemStudyRun/);
  assert.match(formOwnerSource, /planFreeSystemStudyRun/);
  assert.doesNotMatch(formOwnerSource, /questionPoolMode/);
});

test('PR B does not switch the normal learner Review runtime before active Review/completion work exists', () => {
  assert.match(learnerPageServerSource, /startReview/);
  assert.match(learnerPageServerSource, /startSystemReview/);
  assert.doesNotMatch(learnerPageServerSource, /planSystemStudyRunFromForm|study-run-planning|study-run-planner/);
});
