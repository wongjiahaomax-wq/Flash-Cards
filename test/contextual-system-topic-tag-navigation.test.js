import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  resolveSystemStudyCandidates,
  routeBelongsToSystem
} from '../src/lib/server/learning/system-study-routes.ts';
import {
  applyParentChanges,
  validateTaxonomyGraph
} from '../src/lib/server/learning/taxonomy-graph.ts';

function qtcFixture() {
  return {
    concepts: [
      { id: 'cardio', name: 'Cardiovascular', kind: 'system', parentId: null, isActive: true },
      { id: 'electrophysiology', name: 'Electrophysiology', kind: 'topic', parentId: 'cardio', isActive: true },
      { id: 'prolonged-qtc', name: 'Prolonged QTc', kind: 'topic', parentId: 'electrophysiology', isActive: true },
      { id: 'metabolic', name: 'Metabolic', kind: 'system', parentId: null, isActive: true },
      { id: 'hypocalcaemia', name: 'Hypocalcaemia', kind: 'topic', parentId: 'metabolic', isActive: true }
    ],
    caseTopicRows: [
      {
        id: 'hypocalcaemia-case',
        title: 'Hypocalcaemia with prolonged QTc',
        isActive: true,
        conceptId: 'hypocalcaemia',
        role: 'primary'
      }
    ],
    caseTagRows: [
      { caseId: 'hypocalcaemia-case', tagId: 'qt-prolongation', tagName: 'QT prolongation' }
    ],
    systemTagRows: [
      { systemConceptId: 'cardio', tagId: 'qt-prolongation', tagName: 'QT prolongation', displayOrder: 0 },
      { systemConceptId: 'metabolic', tagId: 'qt-prolongation', tagName: 'QT prolongation', displayOrder: 0 }
    ]
  };
}

test('taxonomy graph rejects cycles, inactive parents, and nested Systems before writes are built', () => {
  const nodes = [
    { id: 'cardio', name: 'Cardiovascular', kind: 'system', parentId: null, isActive: true },
    { id: 'rhythm', name: 'Rhythm', kind: 'topic', parentId: 'cardio', isActive: true },
    { id: 'qtc', name: 'Prolonged QTc', kind: 'topic', parentId: 'rhythm', isActive: true }
  ];

  assert.doesNotThrow(() => validateTaxonomyGraph(nodes));
  assert.throws(
    () => applyParentChanges(nodes, [
      { id: 'rhythm', parentId: 'qtc' },
      { id: 'qtc', parentId: 'rhythm' }
    ]),
    /cycle/
  );
  assert.throws(
    () => validateTaxonomyGraph([
      ...nodes,
      { id: 'nested-system', name: 'Nested', kind: 'system', parentId: 'cardio', isActive: true }
    ]),
    /top-level/
  );
  assert.throws(
    () => validateTaxonomyGraph([
      { id: 'inactive-parent', name: 'Inactive', kind: 'topic', parentId: null, isActive: false },
      { id: 'child', name: 'Child', kind: 'topic', parentId: 'inactive-parent', isActive: true }
    ]),
    /inactive parent/
  );
});

test('QTc/Hypocalcaemia Case uses its canonical Topic and cross-System Tag without secondary Topic routing', () => {
  const fixture = qtcFixture();

  assert.deepEqual(resolveSystemStudyCandidates({
    ...fixture,
    systemId: 'cardio',
    routeType: 'topic',
    routeId: 'prolonged-qtc'
  }), []);

  const metabolicTopic = resolveSystemStudyCandidates({
    ...fixture,
    systemId: 'metabolic',
    routeType: 'topic',
    routeId: 'hypocalcaemia'
  });
  assert.equal(metabolicTopic.length, 1);
  assert.equal(metabolicTopic[0].primaryConceptId, 'hypocalcaemia');
  assert.equal(metabolicTopic[0].studyConceptId, 'hypocalcaemia');
  assert.equal(metabolicTopic[0].studySystemConceptId, 'metabolic');
  assert.equal(metabolicTopic[0].routeType, 'topic');
  assert.equal(metabolicTopic[0].studyTagId, null);

  const cardioTag = resolveSystemStudyCandidates({
    ...fixture,
    systemId: 'cardio',
    routeType: 'tag',
    routeId: 'qt-prolongation'
  });
  assert.equal(cardioTag.length, 1);
  assert.equal(cardioTag[0].primaryConceptId, 'hypocalcaemia');
  assert.equal(cardioTag[0].studyConceptId, 'hypocalcaemia');
  assert.equal(cardioTag[0].studySystemConceptId, 'cardio');
  assert.equal(cardioTag[0].routeType, 'tag');
  assert.equal(cardioTag[0].studyTagId, 'qt-prolongation');

  const cardioAll = resolveSystemStudyCandidates({ ...fixture, systemId: 'cardio', routeType: 'all' });
  assert.equal(cardioAll.length, 1);
  assert.equal(cardioAll[0].routeType, 'tag');

  const metabolicAll = resolveSystemStudyCandidates({ ...fixture, systemId: 'metabolic', routeType: 'all' });
  assert.equal(metabolicAll.length, 1, 'System All must deduplicate the same Case across native Topic and Tag routes');
  assert.equal(metabolicAll[0].routeType, 'topic', 'native canonical Topic provenance takes precedence in System All');
});

test('the same curated Tag can be exposed independently in several Systems', () => {
  const fixture = qtcFixture();
  assert.equal(routeBelongsToSystem('cardio', 'tag', 'qt-prolongation', fixture), true);
  assert.equal(routeBelongsToSystem('metabolic', 'tag', 'qt-prolongation', fixture), true);

  const cardio = resolveSystemStudyCandidates({
    ...fixture,
    systemId: 'cardio',
    routeType: 'tag',
    routeId: 'qt-prolongation'
  });
  const metabolic = resolveSystemStudyCandidates({
    ...fixture,
    systemId: 'metabolic',
    routeType: 'tag',
    routeId: 'qt-prolongation'
  });

  assert.equal(cardio.length, 1);
  assert.equal(metabolic.length, 1);
  assert.equal(cardio[0].studySystemConceptId, 'cardio');
  assert.equal(metabolic[0].studySystemConceptId, 'metabolic');
  assert.equal(cardio[0].studyTagId, metabolic[0].studyTagId);
});

test('historical migration keeps Review route-provenance columns while current Drizzle schema retires the legacy Review model', () => {
  const migration = readFileSync(new URL('../drizzle/0015_contextual_system_topic_tag_navigation.sql', import.meta.url), 'utf8');
  const schemaSource = readFileSync(new URL('../src/lib/server/db/schema.js', import.meta.url), 'utf8');
  const contextualSource = readFileSync(new URL('../src/lib/server/db/contextual-schema.ts', import.meta.url), 'utf8');
  const drizzleConfig = readFileSync(new URL('../drizzle.config.js', import.meta.url), 'utf8');

  assert.match(migration, /navigation_route_type/);
  assert.match(migration, /navigation_route_id/);
  assert.match(schemaSource, /kind:\s*text\('kind'/);
  assert.doesNotMatch(schemaSource, /export const reviews\s*=/);
  assert.doesNotMatch(schemaSource, /export const reviewQuestions\s*=/);
  assert.doesNotMatch(schemaSource, /export const reviewAssets\s*=/);
  assert.doesNotMatch(contextualSource, /reviewsWithRouteProvenance/);
  assert.doesNotMatch(contextualSource, /sqliteTable\(/);
  assert.match(contextualSource, /concepts as taxonomyConcepts/);
  assert.match(drizzleConfig, /\.\/src\/lib\/server\/db\/schema\.js/);
});
