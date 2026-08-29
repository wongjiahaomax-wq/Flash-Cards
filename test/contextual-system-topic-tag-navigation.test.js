import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  SystemStudyNavigationDisabledError,
  resolveNextSystemStudyRoute
} from '../src/lib/server/learning/system-review-navigation.ts';
import {
  resolveSystemStudyCandidates,
  routeBelongsToSystem
} from '../src/lib/server/learning/system-study-routes.ts';
import {
  applyParentChanges,
  validateTaxonomyGraph
} from '../src/lib/server/learning/taxonomy-graph.ts';

const migrationNamesBefore0015 = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql',
  '0010_reusable_image_reactivation_guard.sql',
  '0011_asset_supersession.sql',
  '0012_archive_stimulus_options.sql',
  '0013_review_assets_asset_lookup.sql',
  '0014_review_question_pool_mode.sql'
];

/** @param {string[]} names */
function migrationSql(names) {
  return names
    .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
    .join('\n')
    .replaceAll('--> statement-breakpoint', '');
}

const before0015Sql = migrationSql(migrationNamesBefore0015);
const migration0015Sql = migrationSql(['0015_contextual_system_topic_tag_navigation.sql']);

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

  const legacyCardioTopicRoute = resolveSystemStudyCandidates({
    ...fixture,
    systemId: 'cardio',
    routeType: 'topic',
    routeId: 'prolonged-qtc'
  });
  assert.deepEqual(legacyCardioTopicRoute, []);

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

  const cardioAll = resolveSystemStudyCandidates({
    ...fixture,
    systemId: 'cardio',
    routeType: 'all'
  });
  assert.equal(cardioAll.length, 1);
  assert.equal(cardioAll[0].routeType, 'tag');
  assert.equal(cardioAll[0].studyConceptId, 'hypocalcaemia');

  const metabolicAll = resolveSystemStudyCandidates({
    ...fixture,
    systemId: 'metabolic',
    routeType: 'all'
  });
  assert.equal(metabolicAll.length, 1, 'System All must deduplicate the same Case across native Topic and Tag routes');
  assert.equal(metabolicAll[0].routeType, 'topic', 'native canonical Topic provenance takes precedence in System All');
  assert.equal(metabolicAll[0].studyConceptId, 'hypocalcaemia');
});

test('Next case preserves the learner-selected All and parent-Topic System routes', () => {
  const allRoute = resolveNextSystemStudyRoute({
    studySystemConceptId: 'cardio',
    navigationRouteType: 'all',
    navigationRouteId: null,
    routeType: 'topic',
    studyTagId: null,
    studyConceptId: 'prolonged-qtc'
  }, true);
  assert.deepEqual(allRoute, { systemId: 'cardio', routeType: 'all', routeId: null });

  const parentTopicRoute = resolveNextSystemStudyRoute({
    studySystemConceptId: 'cardio',
    navigationRouteType: 'topic',
    navigationRouteId: 'electrophysiology',
    routeType: 'topic',
    studyTagId: null,
    studyConceptId: 'prolonged-qtc'
  }, true);
  assert.deepEqual(parentTopicRoute, {
    systemId: 'cardio',
    routeType: 'topic',
    routeId: 'electrophysiology'
  });
});

test('rollout rollback blocks Next case for an existing System Review without blocking legacy Topic Reviews', () => {
  assert.throws(
    () => resolveNextSystemStudyRoute({
      studySystemConceptId: 'cardio',
      navigationRouteType: 'all',
      navigationRouteId: null,
      routeType: 'topic',
      studyTagId: null,
      studyConceptId: 'prolonged-qtc'
    }, false),
    SystemStudyNavigationDisabledError
  );

  assert.equal(resolveNextSystemStudyRoute({
    studySystemConceptId: null,
    navigationRouteType: null,
    navigationRouteId: null,
    routeType: 'topic',
    studyTagId: null,
    studyConceptId: 'prolonged-qtc'
  }, false), null);
});

test('older System Reviews without selected-route columns fall back to their effective route', () => {
  assert.deepEqual(resolveNextSystemStudyRoute({
    studySystemConceptId: 'cardio',
    navigationRouteType: null,
    navigationRouteId: null,
    routeType: 'tag',
    studyTagId: 'qt-prolongation',
    studyConceptId: 'hypocalcaemia'
  }, true), {
    systemId: 'cardio',
    routeType: 'tag',
    routeId: 'qt-prolongation'
  });
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
  assert.equal(cardio[0].studyConceptId, 'hypocalcaemia');
  assert.equal(metabolic[0].studyConceptId, 'hypocalcaemia');
});

test('migration 0015 backfills historical Topics and Reviews without rewriting snapshots', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(before0015Sql);
    sqlite.exec(`
      INSERT INTO concepts (id, name, slug, is_active)
      VALUES ('historical-topic', 'Historical Topic', 'historical-topic', 1);

      INSERT INTO cases (id, title, question_selection_mode, is_active)
      VALUES ('historical-case', 'Historical Case', 'all', 1);

      INSERT INTO case_concepts (case_id, concept_id, role)
      VALUES ('historical-case', 'historical-topic', 'primary');

      INSERT INTO question_prompts (id, prompt_md, is_active)
      VALUES ('historical-prompt', 'Historical prompt', 1);

      INSERT INTO reviews (
        id, user_id, case_id, primary_concept_id, study_concept_id,
        case_title_snapshot, question_pool_mode, status
      ) VALUES (
        'historical-review', 'learner', 'historical-case', 'historical-topic', 'historical-topic',
        'Historical title snapshot', 'expanded', 'started'
      );

      INSERT INTO review_questions (
        id, review_id, question_prompt_id, source_type, source_concept_id,
        display_order, prompt_snapshot_md, answer_snapshot_md
      ) VALUES (
        'historical-review-question', 'historical-review', 'historical-prompt', 'concept', 'historical-topic',
        0, 'Historical prompt snapshot', 'Historical answer snapshot'
      );
    `);

    sqlite.exec(migration0015Sql);

    assert.deepEqual(
      { ...sqlite.prepare('SELECT kind, parent_id FROM concepts WHERE id = ?').get('historical-topic') },
      { kind: 'topic', parent_id: null }
    );
    assert.deepEqual(
      {
        ...sqlite.prepare(`
          SELECT study_system_concept_id, route_type, study_tag_id,
                 navigation_route_type, navigation_route_id
          FROM reviews WHERE id = ?
        `).get('historical-review')
      },
      {
        study_system_concept_id: null,
        route_type: 'topic',
        study_tag_id: null,
        navigation_route_type: null,
        navigation_route_id: null
      }
    );
    assert.deepEqual(
      { ...sqlite.prepare('SELECT prompt_snapshot_md, answer_snapshot_md FROM review_questions WHERE id = ?').get('historical-review-question') },
      { prompt_snapshot_md: 'Historical prompt snapshot', answer_snapshot_md: 'Historical answer snapshot' }
    );
  } finally {
    sqlite.close();
  }
});

test('migration 0015 enforces System/Topic relationship and Review provenance invariants in SQLite', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(`${before0015Sql}\n${migration0015Sql}`);
    sqlite.exec(`
      INSERT INTO concepts (id, name, slug, kind, is_active)
      VALUES ('cardio', 'Cardiovascular', 'cardio', 'system', 1);
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)
      VALUES ('qtc', 'Prolonged QTc', 'qtc', 'topic', 'cardio', 1);
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)
      VALUES ('qtc-child', 'Acquired QT prolongation', 'qtc-child', 'topic', 'qtc', 1);
      INSERT INTO cases (id, title, question_selection_mode, is_active)
      VALUES ('case-a', 'Case A', 'all', 1);
      INSERT INTO case_concepts (case_id, concept_id, role)
      VALUES ('case-a', 'qtc', 'primary');
      INSERT INTO tags (id, name, normalized_name, is_active)
      VALUES ('qt-tag', 'QT prolongation', 'qt prolongation', 1);
      INSERT INTO system_tags (system_concept_id, tag_id, display_order)
      VALUES ('cardio', 'qt-tag', 0);
    `);

    assert.throws(
      () => sqlite.exec("INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-a', 'cardio', 'secondary');"),
      /Cases may only attach to Topics/
    );
    assert.throws(
      () => sqlite.exec("UPDATE concepts SET parent_id = 'qtc-child' WHERE id = 'qtc';"),
      /cycle/
    );
    assert.throws(
      () => sqlite.exec("UPDATE concepts SET kind = 'system' WHERE id = 'qtc';"),
      /Case|Topic|System|usage/i
    );

    sqlite.exec(`
      INSERT INTO question_prompts (id, prompt_md, is_active)
      VALUES ('prompt-a', 'Prompt A', 1);
      INSERT INTO reviews (
        id, user_id, case_id, primary_concept_id, study_concept_id,
        study_system_concept_id, route_type, study_tag_id,
        navigation_route_type, navigation_route_id,
        case_title_snapshot, question_pool_mode, status
      ) VALUES (
        'tag-review', 'learner', 'case-a', 'qtc', 'qtc',
        'cardio', 'tag', 'qt-tag', 'tag', 'qt-tag',
        'Case A', 'expanded', 'started'
      );
      INSERT INTO reviews (
        id, user_id, case_id, primary_concept_id, study_concept_id,
        study_system_concept_id, route_type,
        navigation_route_type, navigation_route_id,
        case_title_snapshot, question_pool_mode, status
      ) VALUES (
        'all-review', 'learner', 'case-a', 'qtc', 'qtc',
        'cardio', 'topic', 'all', NULL,
        'Case A', 'expanded', 'started'
      );
    `);
    assert.deepEqual(
      {
        ...sqlite.prepare(`
          SELECT route_type, study_tag_id, navigation_route_type, navigation_route_id
          FROM reviews WHERE id = ?
        `).get('tag-review')
      },
      {
        route_type: 'tag',
        study_tag_id: 'qt-tag',
        navigation_route_type: 'tag',
        navigation_route_id: 'qt-tag'
      }
    );
    assert.throws(
      () => sqlite.exec(`
        INSERT INTO reviews (
          id, user_id, case_id, primary_concept_id, study_concept_id,
          study_system_concept_id, route_type, study_tag_id,
          case_title_snapshot, question_pool_mode, status
        ) VALUES (
          'missing-selected-route', 'learner', 'case-a', 'qtc', 'qtc',
          'cardio', 'tag', 'qt-tag', 'Case A', 'expanded', 'started'
        );
      `),
      /Review study-route provenance is invalid/
    );
    assert.throws(
      () => sqlite.exec(`
        INSERT INTO reviews (
          id, user_id, case_id, primary_concept_id, study_concept_id,
          study_system_concept_id, route_type, study_tag_id,
          navigation_route_type, navigation_route_id,
          case_title_snapshot, question_pool_mode, status
        ) VALUES (
          'mismatched-tag-route', 'learner', 'case-a', 'qtc', 'qtc',
          'cardio', 'tag', 'qt-tag', 'tag', 'qtc',
          'Case A', 'expanded', 'started'
        );
      `),
      /Review study-route provenance is invalid/
    );
  } finally {
    sqlite.close();
  }
});

test('canonical Drizzle schema models migration 0015 without a historical runtime schema', () => {
  const schemaSource = readFileSync(new URL('../src/lib/server/db/schema.js', import.meta.url), 'utf8');
  const contextualSource = readFileSync(new URL('../src/lib/server/db/contextual-schema.ts', import.meta.url), 'utf8');
  const drizzleConfig = readFileSync(new URL('../drizzle.config.js', import.meta.url), 'utf8');

  assert.match(schemaSource, /kind:\s*text\('kind'/);
  assert.match(schemaSource, /navigationRouteType:\s*text\('navigation_route_type'/);
  assert.match(schemaSource, /navigationRouteId:\s*text\('navigation_route_id'/);
  assert.doesNotMatch(contextualSource, /sqliteTable\(/);
  assert.match(contextualSource, /concepts as taxonomyConcepts/);
  assert.match(contextualSource, /reviews as reviewsWithRouteProvenance/);
  assert.match(drizzleConfig, /\.\/src\/lib\/server\/db\/schema\.js/);
  assert.doesNotMatch(drizzleConfig, /pre-0015-compat-schema/);
  assert.throws(
    () => readFileSync(new URL('../src/lib/server/db/pre-0015-compat-schema.ts', import.meta.url), 'utf8'),
    /ENOENT/
  );
});