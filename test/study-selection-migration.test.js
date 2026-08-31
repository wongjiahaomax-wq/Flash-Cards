// @ts-nocheck
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

function migrationSql(predicate) {
  return readdirSync(new URL('../drizzle/', import.meta.url))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name) && predicate(name))
    .sort()
    .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
    .join('\n')
    .replaceAll('--> statement-breakpoint', '');
}

const pre0019Sql = migrationSql((name) => Number(name.slice(0, 4)) < 19);
const migration0019Sql = migrationSql((name) => name.startsWith('0019_'));

function seedLegacyReview(sqlite) {
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, is_active)
    VALUES ('legacy-topic', 'Legacy Topic', 'legacy-topic', 'topic', 1);
    INSERT INTO cases (id, title, question_selection_mode, is_active)
    VALUES ('legacy-case', 'Legacy Case', 'all', 1);
    INSERT INTO case_concepts (case_id, concept_id, role)
    VALUES ('legacy-case', 'legacy-topic', 'primary');
    INSERT INTO reviews (
      id, user_id, case_id, primary_concept_id, study_concept_id,
      study_system_concept_id, route_type, study_tag_id,
      navigation_route_type, navigation_route_id,
      case_title_snapshot, question_pool_mode, status
    ) VALUES (
      'legacy-review', 'learner', 'legacy-case', 'legacy-topic', 'legacy-topic',
      NULL, 'topic', NULL, NULL, NULL,
      'Legacy Case snapshot', 'expanded', 'started'
    );
  `);
}

test('migration 0019 preserves historical Reviews without backfill', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(pre0019Sql);
    seedLegacyReview(sqlite);
    const before = { ...sqlite.prepare('SELECT * FROM reviews WHERE id = ?').get('legacy-review') };

    sqlite.exec(migration0019Sql);

    const after = { ...sqlite.prepare(`
      SELECT id, user_id, case_id, primary_concept_id, study_concept_id,
             study_system_concept_id, route_type, study_tag_id,
             navigation_route_type, navigation_route_id,
             case_title_snapshot, question_pool_mode, status, study_selection_id
      FROM reviews WHERE id = ?
    `).get('legacy-review') };
    assert.equal(after.study_selection_id, null);
    delete after.study_selection_id;
    for (const [key, value] of Object.entries(after)) assert.equal(value, before[key]);
  } finally {
    sqlite.close();
  }
});

test('migration 0019 enforces immutable routes and mutually exclusive Review selection provenance', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(`${pre0019Sql}\n${migration0019Sql}`);
    sqlite.exec(`
      INSERT INTO concepts (id, name, slug, kind, is_active) VALUES ('cardio', 'Cardio', 'cardio', 'system', 1);
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES ('rhythm', 'Rhythm', 'rhythm', 'topic', 'cardio', 1);
      INSERT INTO concepts (id, name, slug, kind, is_active) VALUES ('metabolic', 'Metabolic', 'metabolic', 'system', 1);
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES ('electrolytes', 'Electrolytes', 'electrolytes', 'topic', 'metabolic', 1);
      INSERT INTO tags (id, name, normalized_name, is_active) VALUES ('ecg', 'ECG', 'ecg', 1);
      INSERT INTO system_tags (system_concept_id, tag_id, display_order) VALUES ('cardio', 'ecg', 0);
      INSERT INTO cases (id, title, question_selection_mode, is_active) VALUES ('case-a', 'Case A', 'all', 1);
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-a', 'rhythm', 'primary');

      INSERT INTO study_selections (id, user_id, system_concept_id) VALUES ('selection-a', 'learner', 'cardio');
      INSERT INTO study_selection_routes (study_selection_id, route_type, route_id)
      VALUES ('selection-a', 'topic', 'rhythm'), ('selection-a', 'tag', 'ecg');

      INSERT INTO reviews (
        id, user_id, case_id, primary_concept_id, study_concept_id,
        study_system_concept_id, route_type, study_tag_id,
        navigation_route_type, navigation_route_id, study_selection_id,
        case_title_snapshot, question_pool_mode, status
      ) VALUES (
        'selection-review', 'learner', 'case-a', 'rhythm', 'rhythm',
        'cardio', 'topic', NULL,
        NULL, NULL, 'selection-a',
        'Case A', 'core', 'started'
      );
    `);

    assert.throws(
      () => sqlite.exec("UPDATE study_selection_routes SET route_id = 'electrolytes' WHERE study_selection_id = 'selection-a' AND route_type = 'topic';"),
      /immutable/i
    );
    assert.throws(
      () => sqlite.exec("DELETE FROM study_selection_routes WHERE study_selection_id = 'selection-a' AND route_type = 'tag';"),
      /immutable/i
    );
    assert.throws(
      () => sqlite.exec("INSERT INTO study_selection_routes (study_selection_id, route_type, route_id) VALUES ('selection-a', 'topic', 'electrolytes');"),
      /not available in this System/i
    );

    assert.throws(() => sqlite.exec(`
      INSERT INTO reviews (
        id, user_id, case_id, primary_concept_id, study_concept_id,
        study_system_concept_id, route_type, navigation_route_type, navigation_route_id,
        study_selection_id, case_title_snapshot, question_pool_mode, status
      ) VALUES (
        'both-review', 'learner', 'case-a', 'rhythm', 'rhythm',
        'cardio', 'topic', 'topic', 'rhythm',
        'selection-a', 'Case A', 'core', 'started'
      );
    `), /provenance is invalid/i);

    assert.throws(() => sqlite.exec(`
      INSERT INTO reviews (
        id, user_id, case_id, primary_concept_id, study_concept_id,
        study_system_concept_id, route_type, study_selection_id,
        case_title_snapshot, question_pool_mode, status
      ) VALUES (
        'wrong-user-review', 'other-user', 'case-a', 'rhythm', 'rhythm',
        'cardio', 'topic', 'selection-a',
        'Case A', 'core', 'started'
      );
    `), /provenance is invalid/i);

    sqlite.exec("INSERT INTO study_selections (id, user_id, system_concept_id) VALUES ('empty-selection', 'learner', 'cardio');");
    assert.throws(() => sqlite.exec(`
      INSERT INTO reviews (
        id, user_id, case_id, primary_concept_id, study_concept_id,
        study_system_concept_id, route_type, study_selection_id,
        case_title_snapshot, question_pool_mode, status
      ) VALUES (
        'empty-selection-review', 'learner', 'case-a', 'rhythm', 'rhythm',
        'cardio', 'topic', 'empty-selection',
        'Case A', 'core', 'started'
      );
    `), /provenance is invalid/i);
  } finally {
    sqlite.close();
  }
});
