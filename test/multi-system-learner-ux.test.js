import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  StudyRunFormInputError,
  parseMultiSystemStudyScopeFromForm,
  planSystemStudyFormState
} from '../src/lib/server/learning/plan-system-study.ts';
import {
  normalizeMultiSystemStudyRunScope,
  resolveMultiSystemStudySelectionCandidates
} from '../src/lib/server/learning/multi-system-study-scope.ts';
import { resolveSystemStudyCandidates } from '../src/lib/server/learning/system-study-routes.ts';
import { buildFreeStudyRunDescriptor } from '../src/lib/server/learning/study-run-planner.js';
import {
  contributingStudyRouteValues,
  orderedStudyTopics,
  studyTopicDescendantIds,
  studyTopicSubtreeRouteValues
} from '../src/lib/study-topic-hierarchy.js';
import {
  applyFreeCompletion,
  beginFreeWork,
  selectNextFreeWork
} from '../src/lib/free-study-run.js';
import {
  applyScheduledCompletion,
  beginScheduledWork,
  selectNextScheduledWork
} from '../src/lib/scheduled-study-run.js';

function navigationFixture() {
  return {
    concepts: [
      { id: 'system-a', name: 'System A', kind: 'system', parentId: null, isActive: true },
      { id: 'topic-a', name: 'Topic A', kind: 'topic', parentId: 'system-a', isActive: true },
      { id: 'system-b', name: 'System B', kind: 'system', parentId: null, isActive: true },
      { id: 'topic-b', name: 'Topic B', kind: 'topic', parentId: 'system-b', isActive: true }
    ],
    caseTopicRows: [
      { id: 'case-a', title: 'A only', conceptId: 'topic-a', role: 'primary', isActive: true },
      { id: 'case-b', title: 'B only', conceptId: 'topic-b', role: 'primary', isActive: true },
      { id: 'case-overlap', title: 'Overlap', conceptId: 'topic-b', role: 'primary', isActive: true }
    ],
    caseTagRows: [
      { caseId: 'case-overlap', tagId: 'tag-a', tagName: 'Tag A' }
    ],
    systemTagRows: [
      { systemConceptId: 'system-a', tagId: 'tag-a', tagName: 'Tag A', displayOrder: 0 }
    ]
  };
}

test('learner multi-System form keeps whole-System selection as mode=all and only materializes narrowed routes', () => {
  const form = new FormData();
  form.append('system', 'system-a');
  form.append('system', 'system-b');
  form.append('route:system-a', 'topic:topic-a');
  form.append('route:system-a', 'tag:tag-a');
  form.append('narrow:system-b', 'on');
  form.append('route:system-b', 'topic:topic-b');
  form.append('studyMode', 'scheduled');
  form.append('runSize', '10');

  assert.deepEqual(parseMultiSystemStudyScopeFromForm(form), [
    { systemId: 'system-a', mode: 'all' },
    {
      systemId: 'system-b',
      mode: 'routes',
      routes: [{ routeType: 'topic', routeId: 'topic-b' }]
    }
  ]);
  assert.deepEqual(planSystemStudyFormState(form).selectedSystems, [
    {
      systemId: 'system-a',
      mode: 'all',
      selectedRoutes: ['topic:topic-a', 'tag:tag-a']
    },
    {
      systemId: 'system-b',
      mode: 'routes',
      selectedRoutes: ['topic:topic-b']
    }
  ]);
});

test('single-System legacy form remains a valid v2 routes special case', () => {
  const form = new FormData();
  form.append('systemId', 'system-a');
  form.append('route', 'topic:topic-a');
  form.append('route', 'tag:tag-a');

  assert.deepEqual(parseMultiSystemStudyScopeFromForm(form), [{
    systemId: 'system-a',
    mode: 'routes',
    routes: [
      { routeType: 'topic', routeId: 'topic-a' },
      { routeType: 'tag', routeId: 'tag-a' }
    ]
  }]);
});

test('narrowed learner System requires at least one explicit Topic or curated Tag route', () => {
  const form = new FormData();
  form.append('system', 'system-a');
  form.append('narrow:system-a', 'on');
  assert.throws(
    () => parseMultiSystemStudyScopeFromForm(form),
    (error) => error instanceof StudyRunFormInputError && /at least one Topic or curated Tag/i.test(error.message)
  );
});

test('multi-System Topic hierarchy keeps structural parents as descendant controls only', () => {
  const system = {
    id: 'system-a',
    topics: [
      {
        id: 'parent',
        name: 'Parent',
        caseCount: 0,
        subtreeCaseCount: 2,
        breadcrumb: [{ id: 'system-a', name: 'System A' }, { id: 'parent', name: 'Parent' }]
      },
      {
        id: 'child-b',
        name: 'Child B',
        caseCount: 1,
        subtreeCaseCount: 1,
        breadcrumb: [
          { id: 'system-a', name: 'System A' },
          { id: 'parent', name: 'Parent' },
          { id: 'child-b', name: 'Child B' }
        ]
      },
      {
        id: 'child-a',
        name: 'Child A',
        caseCount: 1,
        subtreeCaseCount: 1,
        breadcrumb: [
          { id: 'system-a', name: 'System A' },
          { id: 'parent', name: 'Parent' },
          { id: 'child-a', name: 'Child A' }
        ]
      }
    ],
    tags: [{ id: 'tag-a' }]
  };

  assert.deepEqual(studyTopicSubtreeRouteValues(system.topics, 'parent'), [
    'topic:child-b',
    'topic:child-a'
  ]);
  assert.deepEqual(studyTopicDescendantIds(system.topics, 'parent'), ['child-b', 'child-a']);
  assert.deepEqual(contributingStudyRouteValues(system), [
    'topic:child-b',
    'topic:child-a',
    'tag:tag-a'
  ]);
  assert.ok(!contributingStudyRouteValues(system).includes('topic:parent'));
  assert.deepEqual(orderedStudyTopics(system.topics).map((topic) => topic.id), [
    'parent',
    'child-a',
    'child-b'
  ]);
});

test('combined eligible count follows authoritative union semantics instead of additive per-System counts', () => {
  const fixture = navigationFixture();
  const countA = resolveSystemStudyCandidates({ ...fixture, systemId: 'system-a', routeType: 'all' }).length;
  const countB = resolveSystemStudyCandidates({ ...fixture, systemId: 'system-b', routeType: 'all' }).length;
  assert.equal(countA, 2);
  assert.equal(countB, 2);
  assert.equal(countA + countB, 4);

  const runScope = normalizeMultiSystemStudyRunScope({
    ...fixture,
    systems: [
      { systemId: 'system-a', mode: 'all' },
      { systemId: 'system-b', mode: 'all' }
    ]
  });
  const candidates = resolveMultiSystemStudySelectionCandidates({ ...fixture, runScope });
  assert.deepEqual(candidates.map((candidate) => candidate.id), ['case-a', 'case-b', 'case-overlap']);
  assert.equal(candidates.filter((candidate) => candidate.id === 'case-overlap').length, 1);
  assert.equal(candidates.length, 3);
});

test('Free browser run advances continuously across Cases contributed by different Systems', () => {
  const systemByCase = new Map([
    ['case-a', 'system-a'],
    ['case-b', 'system-b']
  ]);
  let descriptor = {
    ...buildFreeStudyRunDescriptor({
      userId: 'learner',
      runScope: {
        systems: [
          { systemId: 'system-a', mode: 'all' },
          { systemId: 'system-b', mode: 'all' }
        ]
      },
      candidates: [{ id: 'case-a' }, { id: 'case-b' }],
      preferences: { expandedLearning: false },
      now: 1,
      rng: () => 0.5,
      runId: 'mixed-free-run'
    }),
    distinctCaseTarget: 10
  };

  const first = selectNextFreeWork(descriptor);
  assert.equal(first.status, 'ready');
  descriptor = beginFreeWork(descriptor, first.caseId, 'review-1');
  descriptor = applyFreeCompletion(descriptor, { receiptId: 'review-1', caseId: first.caseId });
  const second = selectNextFreeWork(descriptor);
  assert.equal(second.status, 'ready');
  assert.notEqual(systemByCase.get(first.caseId), systemByCase.get(second.caseId));
});

test('Scheduled browser run advances continuously across captured Cases from different Systems', () => {
  const systemByCase = new Map([
    ['case-a', 'system-a'],
    ['case-b', 'system-b']
  ]);
  let descriptor = {
    version: 2,
    kind: 'scheduled',
    userId: 'learner',
    runId: 'mixed-scheduled-run',
    runStartedAt: 1,
    selectedScope: {
      systems: [
        { systemId: 'system-a', mode: 'all' },
        { systemId: 'system-b', mode: 'all' }
      ]
    },
    distinctCaseTarget: 10,
    scheduledOrder: 'new_first',
    capturedDue: [],
    duePosition: 0,
    capturedNew: [
      { caseId: 'case-a', proofIndex: 0 },
      { caseId: 'case-b', proofIndex: 1 }
    ],
    newPosition: 0,
    membershipProofs: { version: 2, chunkSize: 1, due: [], new: ['proof-a', 'proof-b'] },
    repeatEntries: [],
    completedCaseIds: [],
    consecutiveNewCompleted: 0,
    currentReviewId: null,
    currentWork: null
  };

  const first = selectNextScheduledWork(descriptor, { serverNow: 1 });
  assert.equal(first.status, 'ready');
  descriptor = beginScheduledWork(descriptor, first.work, 'event-1');
  descriptor = applyScheduledCompletion(descriptor, {
    eventId: 'event-1',
    caseId: first.work.caseId,
    queueClass: first.work.queueClass,
    repeatEntry: null
  });
  const second = selectNextScheduledWork(descriptor, { serverNow: 2 });
  assert.equal(second.status, 'ready');
  assert.notEqual(systemByCase.get(first.work.caseId), systemByCase.get(second.work.caseId));
});

test('learner chooser/count/navigation source contract stays multi-System, hierarchical, compact and server-authoritative', async () => {
  const [chooser, planner, countRoute, review, hierarchy] = await Promise.all([
    readFile(new URL('../src/routes/study/+page.svelte', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/server/learning/plan-system-study.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/study/api/count/+server.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/study/[reviewId]/+page.svelte', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/study-topic-hierarchy.js', import.meta.url), 'utf8')
  ]);

  assert.match(chooser, /name="system"/);
  assert.match(chooser, /function routesAreSubmitted\(systemId\)/);
  assert.match(chooser, /return systemSelected\(systemId\) && systemNarrowed\(systemId\)/);
  assert.match(chooser, /name=\{systemSelected\(system\.id\) \? `narrow:\$\{system\.id\}` : undefined\}/);
  assert.match(chooser, /name=\{Number\(topic\.caseCount\) > 0 && routesAreSubmitted\(system\.id\) \? `route:\$\{system\.id\}` : undefined\}/);
  assert.match(chooser, /name=\{routesAreSubmitted\(system\.id\) \? `route:\$\{system\.id\}` : undefined\}/);
  assert.match(chooser, /use:indeterminate=\{topicIndeterminate\(system, topic\)\}/);
  assert.match(chooser, /toggleTopicSubtree\(system, topic/);
  assert.match(chooser, /function scheduleEligibleCount\(\) \{\s*const requestId = \+\+countRequest;/);
  assert.match(chooser, /setRoutes\(system\.id, values, checked\);\s*scheduleEligibleCount\(\);/);
  assert.match(chooser, /setTimeout\(\(\) => refreshEligibleCount\(requestId\), 120\)/);
  assert.match(chooser, /if \(requestId !== countRequest\) return;/);
  assert.match(chooser, /\/study\/api\/count/);
  assert.match(chooser, /Start combined Study run/);
  assert.doesNotMatch(chooser, /<input type="hidden" name="systemId"/);
  assert.match(hierarchy, /Structural parents with zero/);
  assert.match(hierarchy, /Number\(current\.caseCount\) > 0/);
  assert.match(planner, /planScheduledMultiSystemStudyRun/);
  assert.match(planner, /planFreeMultiSystemStudyRun/);
  assert.match(planner, /parseMultiSystemStudyScopeFromForm/);
  assert.match(countRoute, /resolveMultiSystemStudySelection/);
  assert.match(countRoute, /selection\.candidates\.length/);
  assert.doesNotMatch(countRoute, /allCaseCount|reduce\s*\([^)]*\+|candidateCount\s*\+=/);
  assert.match(review, /openFollowingReview/);
  assert.match(review, /requestNextLearnerStudyWork\(descriptor\)/);
});
