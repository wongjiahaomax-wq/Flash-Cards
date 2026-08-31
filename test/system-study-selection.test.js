import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SystemStudySelectionError,
  normalizeSystemStudySelectionRoutes,
  resolveSystemStudyCandidates,
  resolveSystemStudySelectionCandidates
} from '../src/lib/server/learning/system-study-routes.ts';

function selectionFixture() {
  return {
    concepts: [
      { id: 'cardio', name: 'Cardiovascular', kind: 'system', parentId: null, isActive: true },
      { id: 'rhythm', name: 'Rhythm', kind: 'topic', parentId: 'cardio', isActive: true },
      { id: 'qtc', name: 'Prolonged QTc', kind: 'topic', parentId: 'rhythm', isActive: true },
      { id: 'failure', name: 'Heart failure', kind: 'topic', parentId: 'cardio', isActive: true },
      { id: 'metabolic', name: 'Metabolic', kind: 'system', parentId: null, isActive: true },
      { id: 'hypocalcaemia', name: 'Hypocalcaemia', kind: 'topic', parentId: 'metabolic', isActive: true }
    ],
    caseTopicRows: [
      { id: 'parent-case', title: 'Parent Topic case', isActive: true, conceptId: 'rhythm', role: 'primary' },
      { id: 'child-case', title: 'Child Topic case', isActive: true, conceptId: 'qtc', role: 'primary' },
      { id: 'failure-case', title: 'Failure case', isActive: true, conceptId: 'failure', role: 'primary' },
      { id: 'cross-case', title: 'Cross-System tagged case', isActive: true, conceptId: 'hypocalcaemia', role: 'primary' }
    ],
    caseTagRows: [
      { caseId: 'child-case', tagId: 'late-tag', tagName: 'Late Tag' },
      { caseId: 'child-case', tagId: 'early-tag', tagName: 'Early Tag' },
      { caseId: 'cross-case', tagId: 'late-tag', tagName: 'Late Tag' },
      { caseId: 'cross-case', tagId: 'early-tag', tagName: 'Early Tag' }
    ],
    systemTagRows: [
      { systemConceptId: 'cardio', tagId: 'late-tag', tagName: 'Late Tag', displayOrder: 10 },
      { systemConceptId: 'cardio', tagId: 'early-tag', tagName: 'Early Tag', displayOrder: 0 },
      { systemConceptId: 'metabolic', tagId: 'metabolic-only', tagName: 'Metabolic only', displayOrder: 0 }
    ]
  };
}

function provenance(candidates) {
  return candidates.map((candidate) => ({
    id: candidate.id,
    studyConceptId: candidate.studyConceptId,
    studySystemConceptId: candidate.studySystemConceptId,
    routeType: candidate.routeType,
    studyTagId: candidate.studyTagId
  }));
}

test('selection route normalization trims IDs, deduplicates, validates membership, and canonicalizes request order', () => {
  const fixture = selectionFixture();
  const normalized = normalizeSystemStudySelectionRoutes({
    ...fixture,
    systemId: 'cardio',
    routes: [
      { routeType: 'tag', routeId: ' late-tag ' },
      { routeType: 'topic', routeId: ' qtc ' },
      { routeType: 'tag', routeId: 'early-tag' },
      { routeType: 'topic', routeId: 'qtc' },
      { routeType: 'topic', routeId: 'rhythm' }
    ]
  });

  assert.deepEqual(normalized, [
    { routeType: 'topic', routeId: 'qtc' },
    { routeType: 'topic', routeId: 'rhythm' },
    { routeType: 'tag', routeId: 'early-tag' },
    { routeType: 'tag', routeId: 'late-tag' }
  ]);

  assert.throws(
    () => normalizeSystemStudySelectionRoutes({ ...fixture, systemId: 'cardio', routes: [] }),
    (error) => error instanceof SystemStudySelectionError && error.code === 'empty-selection'
  );
  assert.throws(
    () => normalizeSystemStudySelectionRoutes({
      ...fixture,
      systemId: 'cardio',
      routes: [{ routeType: 'all', routeId: 'anything' }]
    }),
    (error) => error instanceof SystemStudySelectionError && error.code === 'invalid-route'
  );
  assert.throws(
    () => normalizeSystemStudySelectionRoutes({
      ...fixture,
      systemId: 'cardio',
      routes: [{ routeType: 'topic', routeId: 'hypocalcaemia' }]
    }),
    (error) => error instanceof SystemStudySelectionError && error.code === 'route-not-in-system'
  );
  assert.throws(
    () => normalizeSystemStudySelectionRoutes({
      ...fixture,
      systemId: 'cardio',
      routes: [{ routeType: 'tag', routeId: 'metabolic-only' }]
    }),
    (error) => error instanceof SystemStudySelectionError && error.code === 'route-not-in-system'
  );
});

test('selection resolver OR-unions Cases, deduplicates overlaps, and gives exact Topic provenance precedence over Tags', () => {
  const fixture = selectionFixture();
  const candidates = resolveSystemStudySelectionCandidates({
    ...fixture,
    systemId: 'cardio',
    routes: [
      { routeType: 'tag', routeId: 'late-tag' },
      { routeType: 'topic', routeId: 'qtc' },
      { routeType: 'tag', routeId: 'early-tag' }
    ]
  });

  assert.deepEqual(provenance(candidates), [
    {
      id: 'child-case',
      studyConceptId: 'qtc',
      studySystemConceptId: 'cardio',
      routeType: 'topic',
      studyTagId: null
    },
    {
      id: 'cross-case',
      studyConceptId: 'hypocalcaemia',
      studySystemConceptId: 'cardio',
      routeType: 'tag',
      studyTagId: 'early-tag'
    }
  ]);
});

test('selected Tag precedence is canonical and does not depend on submitted checkbox order', () => {
  const fixture = selectionFixture();
  const first = resolveSystemStudySelectionCandidates({
    ...fixture,
    systemId: 'cardio',
    routes: [
      { routeType: 'tag', routeId: 'late-tag' },
      { routeType: 'tag', routeId: 'early-tag' }
    ]
  });
  const reversed = resolveSystemStudySelectionCandidates({
    ...fixture,
    systemId: 'cardio',
    routes: [
      { routeType: 'tag', routeId: 'early-tag' },
      { routeType: 'tag', routeId: 'late-tag' }
    ]
  });

  assert.deepEqual(provenance(first), provenance(reversed));
  assert.equal(first.find((candidate) => candidate.id === 'cross-case')?.studyTagId, 'early-tag');
});

test('custom Topic selections are exact so a selected parent does not re-include an unselected child', () => {
  const fixture = selectionFixture();
  const parentOnly = resolveSystemStudySelectionCandidates({
    ...fixture,
    systemId: 'cardio',
    routes: [{ routeType: 'topic', routeId: 'rhythm' }]
  });
  const parentAndChild = resolveSystemStudySelectionCandidates({
    ...fixture,
    systemId: 'cardio',
    routes: [
      { routeType: 'topic', routeId: 'rhythm' },
      { routeType: 'topic', routeId: 'qtc' }
    ]
  });
  const historicalParentRoute = resolveSystemStudyCandidates({
    ...fixture,
    systemId: 'cardio',
    routeType: 'topic',
    routeId: 'rhythm'
  });

  assert.deepEqual(parentOnly.map((candidate) => candidate.id), ['parent-case']);
  assert.deepEqual(parentAndChild.map((candidate) => candidate.id), ['child-case', 'parent-case']);
  assert.deepEqual(
    historicalParentRoute.map((candidate) => candidate.id),
    ['child-case', 'parent-case'],
    'legacy single Topic navigation remains descendant-inclusive'
  );
});

test('all eligible exact Topics plus curated Tags matches existing System All IDs and effective provenance', () => {
  const fixture = selectionFixture();
  const selection = resolveSystemStudySelectionCandidates({
    ...fixture,
    systemId: 'cardio',
    routes: [
      { routeType: 'topic', routeId: 'rhythm' },
      { routeType: 'topic', routeId: 'qtc' },
      { routeType: 'topic', routeId: 'failure' },
      { routeType: 'tag', routeId: 'late-tag' },
      { routeType: 'tag', routeId: 'early-tag' }
    ]
  });
  const all = resolveSystemStudyCandidates({
    ...fixture,
    systemId: 'cardio',
    routeType: 'all'
  });

  assert.deepEqual(provenance(selection), provenance(all));
});
