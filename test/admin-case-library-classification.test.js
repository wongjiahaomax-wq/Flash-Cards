import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASE_LIBRARY_UNASSIGNED_SYSTEM,
  caseLibrarySystemContextForTopic,
  caseLibraryTopicLabel,
  filterCaseLibraryParentOptionsBySystem,
  filterCaseLibraryTopicsBySystem
} from '../src/lib/case-library-classification.ts';

const eye = { id: 'system-eye', name: 'Eye', kind: 'system', breadcrumb: [{ id: 'system-eye', name: 'Eye', kind: 'system' }] };
const cardiology = { id: 'system-cardio', name: 'Cardiology', kind: 'system', breadcrumb: [{ id: 'system-cardio', name: 'Cardiology', kind: 'system' }] };
const uveitis = { id: 'topic-uveitis', name: 'Uveitis', kind: 'topic', breadcrumb: [eye.breadcrumb[0], { id: 'topic-uveitis', name: 'Uveitis', kind: 'topic' }] };
const anterior = { id: 'topic-anterior', name: 'Anterior uveitis', kind: 'topic', breadcrumb: [eye.breadcrumb[0], { id: 'topic-uveitis', name: 'Uveitis', kind: 'topic' }, { id: 'topic-anterior', name: 'Anterior uveitis', kind: 'topic' }] };
const arrhythmia = { id: 'topic-arrhythmia', name: 'Arrhythmia', kind: 'topic', breadcrumb: [cardiology.breadcrumb[0], { id: 'topic-arrhythmia', name: 'Arrhythmia', kind: 'topic' }] };
const unassignedRoot = { id: 'topic-unassigned-root', name: 'Unassigned root', kind: 'topic', breadcrumb: [{ id: 'topic-unassigned-root', name: 'Unassigned root', kind: 'topic' }] };
const unassignedChild = { id: 'topic-unassigned-child', name: 'Unassigned child', kind: 'topic', breadcrumb: [unassignedRoot.breadcrumb[0], { id: 'topic-unassigned-child', name: 'Unassigned child', kind: 'topic' }] };

const topics = [uveitis, anterior, arrhythmia, unassignedRoot, unassignedChild];
const parents = [eye, cardiology, ...topics];

test('System context filters active Topic choices by resolved ancestry', () => {
  assert.deepEqual(filterCaseLibraryTopicsBySystem(topics, eye.id).map((topic) => topic.id), ['topic-uveitis', 'topic-anterior']);
  assert.deepEqual(filterCaseLibraryTopicsBySystem(topics, cardiology.id).map((topic) => topic.id), ['topic-arrhythmia']);
  assert.equal(caseLibrarySystemContextForTopic(anterior), eye.id);
});

test('Unassigned context includes nested Topics whose ancestry never resolves to a System', () => {
  assert.deepEqual(
    filterCaseLibraryTopicsBySystem(topics, CASE_LIBRARY_UNASSIGNED_SYSTEM).map((topic) => topic.id),
    ['topic-unassigned-root', 'topic-unassigned-child']
  );
  assert.equal(caseLibrarySystemContextForTopic(unassignedChild), CASE_LIBRARY_UNASSIGNED_SYSTEM);
});

test('classification Topic labels retain hierarchy breadcrumbs', () => {
  assert.equal(caseLibraryTopicLabel(anterior), 'Eye → Uveitis → Anterior uveitis');
  assert.equal(caseLibraryTopicLabel(unassignedChild), 'Unassigned root → Unassigned child');
});

test('new-Topic parent choices stay within the selected System context', () => {
  assert.deepEqual(filterCaseLibraryParentOptionsBySystem(parents, eye.id).map((option) => option.id), ['system-eye', 'topic-uveitis', 'topic-anterior']);
  assert.deepEqual(
    filterCaseLibraryParentOptionsBySystem(parents, CASE_LIBRARY_UNASSIGNED_SYSTEM).map((option) => option.id),
    ['topic-unassigned-root', 'topic-unassigned-child']
  );
});
