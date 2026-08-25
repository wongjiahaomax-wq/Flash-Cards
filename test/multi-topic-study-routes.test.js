import assert from 'node:assert/strict';
import test from 'node:test';

import { descendantDistances, resolveCaseStudyCandidates, resolveStudyConceptId } from '../src/lib/server/learning/study-routes.js';

test('Study Concept resolver uses only the canonical primary Topic', () => {
  const concepts = [
    { id: 'root', parentId: null },
    { id: 'primary', parentId: 'root' },
    { id: 'secondary', parentId: 'root' },
    { id: 'secondary-child', parentId: 'secondary' }
  ];
  const links = [
    { conceptId: 'primary', role: 'primary' },
    { conceptId: 'secondary', role: 'secondary' },
    { conceptId: 'secondary-child', role: 'secondary' }
  ];

  assert.equal(resolveStudyConceptId({
    selectedConceptId: 'root',
    distances: descendantDistances('root', concepts),
    links
  }), 'primary');
  assert.equal(resolveStudyConceptId({
    selectedConceptId: 'secondary',
    distances: descendantDistances('secondary', concepts),
    links
  }), null);
});

test('legacy secondary relationships remain stored compatibility data but do not create learner Case routes', () => {
  const concepts = [
    { id: 'medicine', parentId: null },
    { id: 'canonical', parentId: 'medicine' },
    { id: 'alternate', parentId: null }
  ];
  const rows = [
    { id: 'case-a', title: 'A', isActive: true, conceptId: 'canonical', role: 'primary' },
    { id: 'case-a', title: 'A', isActive: true, conceptId: 'alternate', role: 'secondary' }
  ];

  const canonical = resolveCaseStudyCandidates({ selectedConceptId: 'medicine', concepts, rows });
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].primaryConceptId, 'canonical');
  assert.equal(canonical[0].studyConceptId, 'canonical');

  const alternate = resolveCaseStudyCandidates({ selectedConceptId: 'alternate', concepts, rows });
  assert.deepEqual(alternate, []);
});
