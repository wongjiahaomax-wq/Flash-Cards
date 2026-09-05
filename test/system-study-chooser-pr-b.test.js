import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const chooserSource = readFileSync(
  new URL('../src/lib/components/study/SystemStudyChooser.svelte', import.meta.url),
  'utf8'
);
const learnerStudySource = readFileSync(
  new URL('../src/routes/study/+page.svelte', import.meta.url),
  'utf8'
);
const hierarchySource = readFileSync(
  new URL('../src/lib/study-topic-hierarchy.js', import.meta.url),
  'utf8'
);
const formOwnerSource = readFileSync(
  new URL('../src/lib/server/learning/plan-system-study.ts', import.meta.url),
  'utf8'
);
const studyNavigationSource = readFileSync(
  new URL('../src/lib/server/db/study-navigation.ts', import.meta.url),
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

test('multi-System learner /study preserves structural Topic hierarchy and compact route submission', () => {
  assert.match(learnerStudySource, /from '\$lib\/study-topic-hierarchy\.js'/);
  assert.match(learnerStudySource, /orderedStudyTopics\(system\.topics\)/);
  assert.match(learnerStudySource, /studyTopicSubtreeRouteValues\(system\.topics, topic\.id\)/);
  assert.match(learnerStudySource, /use:indeterminate=\{topicIndeterminate\(system, topic\)\}/);
  assert.match(learnerStudySource, /toggleTopicSubtree\(system, topic, eventChecked\(event\)\)/);
  assert.match(
    learnerStudySource,
    /name=\{Number\(topic\.caseCount\) > 0 && routesAreSubmitted\(system\.id\) \? `route:\$\{system\.id\}` : undefined\}/,
    'the actual learner surface must submit only exact Topics for a selected narrowed System'
  );
  assert.match(
    learnerStudySource,
    /return systemSelected\(systemId\) && systemNarrowed\(systemId\)/,
    'whole-System and unselected Systems must not materialize Topic/Tag route fields'
  );
  assert.match(learnerStudySource, /Structural Topic · 0 exact Cases/);
  assert.match(hierarchySource, /if \(current && Number\(current\.caseCount\) > 0\) routes\.push\(`topic:\$\{currentId\}`\)/);
});

test('PR B removes per-run Original/Expanded choice and the shared owner plans explicit Scheduled or Free v2 descriptors', () => {
  assert.doesNotMatch(chooserSource, /questionPoolMode|Original questions|Expanded Learning/);
  assert.match(chooserSource, /name="studyMode"/);
  assert.match(formOwnerSource, /state\.studyMode !== 'scheduled' && state\.studyMode !== 'free'/);
  assert.match(formOwnerSource, /planScheduledMultiSystemStudyRun/);
  assert.match(formOwnerSource, /planFreeMultiSystemStudyRun/);
  assert.match(formOwnerSource, /parseMultiSystemStudyScopeFromForm/);
  assert.doesNotMatch(formOwnerSource, /questionPoolMode/);
});

test('systems-first chooser keeps descendant-inclusive Topic counts for structural selection', () => {
  assert.match(studyNavigationSource, /listSystemStudySelectionSystems/);
  assert.match(
    studyNavigationSource,
    /caseCount: topic\.subtreeCaseCount/,
    'current systems-first selector should show the count for a descendant-inclusive Topic route'
  );
});
