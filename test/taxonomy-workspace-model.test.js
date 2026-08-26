import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeTaxonomyParents,
  buildTaxonomyWorkspaceRows,
  canStageTopicMove,
  casePrimaryTopicTargets,
  listWorkspaceCases,
  projectTaxonomyWithCasePrimaryTopics,
  projectTaxonomyWithMoves,
  stageCasePrimaryTopicChanges,
  stageTopicMove,
  topicMoveTargets
} from '../src/lib/components/taxonomy-workspace/taxonomy-workspace-model.ts';

/** @type {import('../src/lib/components/taxonomy-workspace/taxonomy-workspace-model.ts').TaxonomyWorkspaceItem[]} */
const fixture = [
  {
    id: 'cardio', name: 'Cardiology', slug: 'cardiology', descriptionMd: null, kind: 'system', parentId: null,
    isActive: true, breadcrumbLabel: 'Cardiology', systemId: 'cardio', unassigned: false,
    directCaseCount: 0, descendantStudyCaseCount: 3, activeSharedQuestionCount: 0, directCases: []
  },
  {
    id: 'arrhythmias', name: 'Arrhythmias', slug: 'arrhythmias', descriptionMd: null, kind: 'topic', parentId: 'cardio',
    isActive: true, breadcrumbLabel: 'Cardiology → Arrhythmias', systemId: 'cardio', unassigned: false,
    directCaseCount: 0, descendantStudyCaseCount: 2, activeSharedQuestionCount: 1, directCases: []
  },
  {
    id: 'af', name: 'Atrial fibrillation', slug: 'atrial-fibrillation', descriptionMd: null, kind: 'topic', parentId: 'arrhythmias',
    isActive: true, breadcrumbLabel: 'Cardiology → Arrhythmias → Atrial fibrillation', systemId: 'cardio', unassigned: false,
    directCaseCount: 2, descendantStudyCaseCount: 2, activeSharedQuestionCount: 2,
    directCases: [
      { id: 'case-af-rvr', title: 'AF with rapid ventricular response' },
      { id: 'case-new-af', title: 'New-onset atrial fibrillation' }
    ]
  },
  {
    id: 'pericarditis', name: 'Pericarditis', slug: 'pericarditis', descriptionMd: null, kind: 'topic', parentId: 'cardio',
    isActive: true, breadcrumbLabel: 'Cardiology → Pericarditis', systemId: 'cardio', unassigned: false,
    directCaseCount: 1, descendantStudyCaseCount: 1, activeSharedQuestionCount: 1,
    directCases: [{ id: 'case-pericarditis', title: 'Acute pleuritic chest pain' }]
  },
  {
    id: 'endocrine', name: 'Endocrine', slug: 'endocrine', descriptionMd: null, kind: 'system', parentId: null,
    isActive: true, breadcrumbLabel: 'Endocrine', systemId: 'endocrine', unassigned: false,
    directCaseCount: 0, descendantStudyCaseCount: 0, activeSharedQuestionCount: 0, directCases: []
  },
  {
    id: 'unassigned', name: 'Needs sorting', slug: 'needs-sorting', descriptionMd: null, kind: 'topic', parentId: null,
    isActive: true, breadcrumbLabel: 'Needs sorting', systemId: null, unassigned: true,
    directCaseCount: 0, descendantStudyCaseCount: 0, activeSharedQuestionCount: 0, directCases: []
  },
  {
    id: 'inactive-topic', name: 'Archived topic', slug: 'archived-topic', descriptionMd: null, kind: 'topic', parentId: null,
    isActive: false, breadcrumbLabel: 'Archived topic', systemId: null, unassigned: true,
    directCaseCount: 0, descendantStudyCaseCount: 0, activeSharedQuestionCount: 0, directCases: []
  }
];

test('workspace rows preserve arbitrary Topic nesting and collapse descendants without a second taxonomy copy', () => {
  const rows = buildTaxonomyWorkspaceRows(fixture);
  const cardio = rows.find((row) => row.id === 'cardio');
  const arrhythmias = rows.find((row) => row.id === 'arrhythmias');
  const af = rows.find((row) => row.id === 'af');
  assert.equal(cardio?.depth, 0);
  assert.equal(arrhythmias?.depth, 1);
  assert.equal(af?.depth, 2);
  assert.equal(arrhythmias?.directSubtopicCount, 1);

  const collapsed = buildTaxonomyWorkspaceRows(fixture, { collapsedIds: ['arrhythmias'] });
  assert.equal(collapsed.some((row) => row.id === 'arrhythmias'), true);
  assert.equal(collapsed.some((row) => row.id === 'af'), false);
});

test('search by a human-readable Case title auto-reveals its Topic and ancestor context', () => {
  const rows = buildTaxonomyWorkspaceRows(fixture, { search: 'rapid ventricular' });
  assert.deepEqual(rows.map((row) => row.id), ['cardio', 'arrhythmias', 'af']);
  assert.deepEqual(rows.map((row) => row.depth), [0, 1, 2]);
  assert.deepEqual(rows.map((row) => row.contextOnly), [true, true, false]);
});

test('System focus and taxonomy filters reduce visual overload without changing hierarchy semantics', () => {
  const focused = buildTaxonomyWorkspaceRows(fixture, { focusSystemId: 'cardio' });
  assert.deepEqual(focused.map((row) => row.id), ['cardio', 'arrhythmias', 'af', 'pericarditis']);

  const unassigned = buildTaxonomyWorkspaceRows(fixture, { filter: 'unassigned' });
  assert.deepEqual(unassigned.map((row) => row.id), ['inactive-topic', 'unassigned']);

  const inactive = buildTaxonomyWorkspaceRows(fixture, { filter: 'inactive' });
  assert.deepEqual(inactive.map((row) => row.id), ['inactive-topic']);
});

test('contextual Topic creation can choose any active System or Topic parent', () => {
  const parents = activeTaxonomyParents(fixture);
  assert.deepEqual(parents.map((item) => item.id), ['cardio', 'arrhythmias', 'af', 'pericarditis', 'endocrine', 'unassigned']);
  assert.equal(parents.some((item) => item.id === 'inactive-topic'), false);
});

test('staged Topic moves preview the projected hierarchy without mutating loaded data', () => {
  const moves = stageTopicMove(fixture, [], 'af', 'endocrine');
  const projected = projectTaxonomyWithMoves(fixture, moves);
  const originalAf = fixture.find((item) => item.id === 'af');
  const projectedAf = projected.find((item) => item.id === 'af');
  const cardio = projected.find((item) => item.id === 'cardio');
  const endocrine = projected.find((item) => item.id === 'endocrine');

  assert.equal(originalAf?.parentId, 'arrhythmias');
  assert.equal(projectedAf?.parentId, 'endocrine');
  assert.equal(projectedAf?.breadcrumbLabel, 'Endocrine → Atrial fibrillation');
  assert.equal(projectedAf?.systemId, 'endocrine');
  assert.equal(cardio?.descendantStudyCaseCount, 1);
  assert.equal(endocrine?.descendantStudyCaseCount, 2);
});

test('moving a staged Topic back to its loaded parent removes the staged change', () => {
  const staged = stageTopicMove(fixture, [], 'af', 'endocrine');
  assert.equal(staged.length, 1);
  assert.deepEqual(stageTopicMove(fixture, staged, 'af', 'arrhythmias'), []);
});

test('Topic move targets exclude self, descendants and inactive parents while allowing Unassigned', () => {
  const targets = topicMoveTargets(fixture, 'arrhythmias');
  assert.equal(targets.some((item) => item.id === 'arrhythmias'), false);
  assert.equal(targets.some((item) => item.id === 'af'), false);
  assert.equal(targets.some((item) => item.id === 'inactive-topic'), false);
  assert.equal(targets.some((item) => item.id === 'cardio'), true);
  assert.equal(targets.some((item) => item.id === 'endocrine'), true);
  assert.equal(canStageTopicMove(fixture, [], 'arrhythmias', null), true);
  assert.equal(canStageTopicMove(fixture, [], 'arrhythmias', 'af'), false);
});

test('later staged Topic moves validate against the already projected hierarchy', () => {
  const first = stageTopicMove(fixture, [], 'af', 'endocrine');
  assert.equal(canStageTopicMove(fixture, first, 'arrhythmias', 'af'), true);
  const second = stageTopicMove(fixture, first, 'arrhythmias', 'af');
  const projected = projectTaxonomyWithMoves(fixture, second);
  assert.equal(projected.find((item) => item.id === 'arrhythmias')?.breadcrumbLabel, 'Endocrine → Atrial fibrillation → Arrhythmias');
});

test('Primary Topic staging moves selected Cases in the projected tree and updates direct/subtree counts', () => {
  const changes = stageCasePrimaryTopicChanges(fixture, [], ['case-af-rvr'], 'pericarditis');
  assert.deepEqual(changes.map((change) => ({ caseId: change.caseId, originalTopicId: change.originalTopicId, topicId: change.topicId })), [
    { caseId: 'case-af-rvr', originalTopicId: 'af', topicId: 'pericarditis' }
  ]);

  const caseProjected = projectTaxonomyWithCasePrimaryTopics(fixture, changes);
  const projected = projectTaxonomyWithMoves(caseProjected, []);
  assert.deepEqual(projected.find((item) => item.id === 'af')?.directCases?.map((caseItem) => caseItem.id), ['case-new-af']);
  assert.deepEqual(projected.find((item) => item.id === 'pericarditis')?.directCases?.map((caseItem) => caseItem.id), ['case-pericarditis', 'case-af-rvr']);
  assert.equal(projected.find((item) => item.id === 'af')?.directCaseCount, 1);
  assert.equal(projected.find((item) => item.id === 'pericarditis')?.directCaseCount, 2);
  assert.equal(projected.find((item) => item.id === 'cardio')?.descendantStudyCaseCount, 3);

  const assignment = listWorkspaceCases(fixture, changes).find((caseItem) => caseItem.id === 'case-af-rvr');
  assert.equal(assignment?.originalTopicId, 'af');
  assert.equal(assignment?.topicId, 'pericarditis');
  assert.equal(assignment?.staged, true);
});

test('Primary Topic staging supports one reviewed target batch of up to 60 Cases', () => {
  const targets = casePrimaryTopicTargets(fixture);
  assert.equal(targets.some((item) => item.id === 'cardio'), false);
  assert.equal(targets.some((item) => item.id === 'inactive-topic'), false);
  assert.equal(targets.some((item) => item.id === 'pericarditis'), true);

  const staged = stageCasePrimaryTopicChanges(fixture, [], ['case-af-rvr', 'case-new-af'], 'pericarditis');
  assert.equal(staged.length, 2);
  assert.ok(staged.every((change) => change.topicId === 'pericarditis'));
  assert.throws(
    () => stageCasePrimaryTopicChanges(fixture, staged, ['case-pericarditis'], 'unassigned'),
    /apply or discard the current Primary Topic batch/i
  );
  assert.throws(
    () => stageCasePrimaryTopicChanges(fixture, [], ['case-af-rvr'], 'inactive-topic'),
    /active Topic/i
  );
});

test('staging a Case to its loaded Primary Topic produces no pending change', () => {
  assert.deepEqual(stageCasePrimaryTopicChanges(fixture, [], ['case-af-rvr'], 'af'), []);
});
