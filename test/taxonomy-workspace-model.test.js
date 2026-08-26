import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeTaxonomyParents,
  buildTaxonomyWorkspaceRows
} from '../src/lib/components/taxonomy-workspace/taxonomy-workspace-model.ts';

const fixture = [
  {
    id: 'cardio',
    name: 'Cardiology',
    slug: 'cardiology',
    descriptionMd: null,
    kind: 'system',
    parentId: null,
    isActive: true,
    breadcrumbLabel: 'Cardiology',
    systemId: 'cardio',
    unassigned: false,
    directCaseCount: 0,
    descendantStudyCaseCount: 3,
    activeSharedQuestionCount: 0,
    directCases: []
  },
  {
    id: 'arrhythmias',
    name: 'Arrhythmias',
    slug: 'arrhythmias',
    descriptionMd: null,
    kind: 'topic',
    parentId: 'cardio',
    isActive: true,
    breadcrumbLabel: 'Cardiology → Arrhythmias',
    systemId: 'cardio',
    unassigned: false,
    directCaseCount: 0,
    descendantStudyCaseCount: 2,
    activeSharedQuestionCount: 1,
    directCases: []
  },
  {
    id: 'af',
    name: 'Atrial fibrillation',
    slug: 'atrial-fibrillation',
    descriptionMd: null,
    kind: 'topic',
    parentId: 'arrhythmias',
    isActive: true,
    breadcrumbLabel: 'Cardiology → Arrhythmias → Atrial fibrillation',
    systemId: 'cardio',
    unassigned: false,
    directCaseCount: 2,
    descendantStudyCaseCount: 2,
    activeSharedQuestionCount: 2,
    directCases: [
      { id: 'case-af-rvr', title: 'AF with rapid ventricular response' },
      { id: 'case-new-af', title: 'New-onset atrial fibrillation' }
    ]
  },
  {
    id: 'pericarditis',
    name: 'Pericarditis',
    slug: 'pericarditis',
    descriptionMd: null,
    kind: 'topic',
    parentId: 'cardio',
    isActive: true,
    breadcrumbLabel: 'Cardiology → Pericarditis',
    systemId: 'cardio',
    unassigned: false,
    directCaseCount: 1,
    descendantStudyCaseCount: 1,
    activeSharedQuestionCount: 1,
    directCases: [{ id: 'case-pericarditis', title: 'Acute pleuritic chest pain' }]
  },
  {
    id: 'endocrine',
    name: 'Endocrine',
    slug: 'endocrine',
    descriptionMd: null,
    kind: 'system',
    parentId: null,
    isActive: true,
    breadcrumbLabel: 'Endocrine',
    systemId: 'endocrine',
    unassigned: false,
    directCaseCount: 0,
    descendantStudyCaseCount: 0,
    activeSharedQuestionCount: 0,
    directCases: []
  },
  {
    id: 'unassigned',
    name: 'Needs sorting',
    slug: 'needs-sorting',
    descriptionMd: null,
    kind: 'topic',
    parentId: null,
    isActive: true,
    breadcrumbLabel: 'Needs sorting',
    systemId: null,
    unassigned: true,
    directCaseCount: 0,
    descendantStudyCaseCount: 0,
    activeSharedQuestionCount: 0,
    directCases: []
  },
  {
    id: 'inactive-topic',
    name: 'Archived topic',
    slug: 'archived-topic',
    descriptionMd: null,
    kind: 'topic',
    parentId: null,
    isActive: false,
    breadcrumbLabel: 'Archived topic',
    systemId: null,
    unassigned: true,
    directCaseCount: 0,
    descendantStudyCaseCount: 0,
    activeSharedQuestionCount: 0,
    directCases: []
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
  assert.deepEqual(
    parents.map((item) => item.id),
    ['cardio', 'arrhythmias', 'af', 'pericarditis', 'endocrine', 'unassigned']
  );
  assert.equal(parents.some((item) => item.id === 'inactive-topic'), false);
});
