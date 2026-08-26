import assert from 'node:assert/strict';
import test from 'node:test';

import { stageFlexibleCasePrimaryTopicChanges } from '../src/lib/components/taxonomy-workspace/case-primary-topic-workspace-model.ts';

/** @type {import('../src/lib/components/taxonomy-workspace/taxonomy-workspace-model.ts').TaxonomyWorkspaceItem[]} */
const items = [
  {
    id: 'cardio', name: 'Cardiology', slug: 'cardiology', descriptionMd: null, kind: 'system', parentId: null,
    isActive: true, breadcrumbLabel: 'Cardiology', systemId: 'cardio', unassigned: false,
    directCaseCount: 0, descendantStudyCaseCount: 2, activeSharedQuestionCount: 0, directCases: []
  },
  {
    id: 'af', name: 'Atrial fibrillation', slug: 'af', descriptionMd: null, kind: 'topic', parentId: 'cardio',
    isActive: true, breadcrumbLabel: 'Cardiology → Atrial fibrillation', systemId: 'cardio', unassigned: false,
    directCaseCount: 2, descendantStudyCaseCount: 2, activeSharedQuestionCount: 0,
    directCases: [{ id: 'case-a', title: 'Case A' }, { id: 'case-b', title: 'Case B' }]
  },
  {
    id: 'flutter', name: 'Atrial flutter', slug: 'flutter', descriptionMd: null, kind: 'topic', parentId: 'cardio',
    isActive: true, breadcrumbLabel: 'Cardiology → Atrial flutter', systemId: 'cardio', unassigned: false,
    directCaseCount: 0, descendantStudyCaseCount: 0, activeSharedQuestionCount: 0, directCases: []
  },
  {
    id: 'peri', name: 'Pericarditis', slug: 'peri', descriptionMd: null, kind: 'topic', parentId: 'cardio',
    isActive: true, breadcrumbLabel: 'Cardiology → Pericarditis', systemId: 'cardio', unassigned: false,
    directCaseCount: 0, descendantStudyCaseCount: 0, activeSharedQuestionCount: 0, directCases: []
  }
];

test('workspace can stage different Cases to different Primary Topic targets in one review', () => {
  let changes = stageFlexibleCasePrimaryTopicChanges(items, [], ['case-a'], 'flutter');
  changes = stageFlexibleCasePrimaryTopicChanges(items, changes, ['case-b'], 'peri');
  assert.deepEqual(changes.map((change) => [change.caseId, change.topicId]), [
    ['case-a', 'flutter'],
    ['case-b', 'peri']
  ]);
});

test('staging a Case back to its loaded Primary Topic removes only that pending Case change', () => {
  let changes = stageFlexibleCasePrimaryTopicChanges(items, [], ['case-a'], 'flutter');
  changes = stageFlexibleCasePrimaryTopicChanges(items, changes, ['case-b'], 'peri');
  changes = stageFlexibleCasePrimaryTopicChanges(items, changes, ['case-a'], 'af');
  assert.deepEqual(changes.map((change) => [change.caseId, change.topicId]), [['case-b', 'peri']]);
});

test('workspace still enforces active Topic targets and the 60-Case selection ceiling', () => {
  assert.throws(() => stageFlexibleCasePrimaryTopicChanges(items, [], ['case-a'], 'cardio'), /active Topic/i);
  assert.throws(
    () => stageFlexibleCasePrimaryTopicChanges(items, [], Array.from({ length: 61 }, (_, index) => `case-${index}`), 'flutter'),
    /no more than 60/i
  );
});
