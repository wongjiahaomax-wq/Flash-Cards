import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getCaseLibraryPage } from '../src/lib/server/db/case-library.js';
import { createDb } from '../src/lib/server/db/index.js';

const legacyMigrationNames = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0004_resumable_import_jobs.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql',
  '0010_reusable_image_reactivation_guard.sql',
  '0011_asset_supersession.sql',
  '0012_archive_stimulus_options.sql',
  '0013_review_assets_asset_lookup.sql'
];
const currentMigrationNames = [...legacyMigrationNames, '0014_review_question_pool_mode.sql', '0015_contextual_system_topic_tag_navigation.sql'];

function migrationSql(names) {
  return names.map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8')).join('\n').replaceAll('--> statement-breakpoint', '');
}

function createLearningDb(migrations) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql(migrations));
  const statements = [];
  const d1 = {
    prepare(sql) {
      return {
        bind(...params) {
          statements.push({ sql, params });
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() { return sqlite.prepare(sql).all(...params).map((row) => Object.values(row)); },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            }
          };
        }
      };
    },
    async batch(queries) { return Promise.all(queries.map((query) => query.run())); }
  };
  return { db: createDb(d1), sqlite, statements };
}

function filters(overrides = {}) {
  return { search: '', topicSearch: '', systemSearch: '', tagId: '', sort: 'case-asc', lifecycle: 'active', ...overrides };
}

function taxonomyReadCount(statements) {
  return statements.filter(({ sql }) => /from "concepts"/i.test(sql) && /description_md/i.test(sql) && /\bkind\b/i.test(sql) && /parent_id/i.test(sql)).length;
}

test('System filtering distinguishes real matches, Unassigned, and zero-match text', async () => {
  const fixture = createLearningDb(currentMigrationNames);
  try {
    fixture.sqlite.exec(`
      INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview-1', 'user-1', 'active', 4102444800000);
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
        ('system-eye', 'Eye', 'eye', 'system', NULL, 1),
        ('topic-retina', 'Retina', 'retina', 'topic', 'system-eye', 1),
        ('topic-free-parent', 'Free Parent', 'free-parent', 'topic', NULL, 1),
        ('topic-free-child', 'Free Child', 'free-child', 'topic', 'topic-free-parent', 1),
        ('topic-free-direct', 'Free Direct', 'free-direct', 'topic', NULL, 1);
      INSERT INTO tags (id, name, normalized_name, is_active) VALUES ('tag-shared', 'Shared', 'shared', 1);
      INSERT INTO cases (id, title, is_active) VALUES
        ('case-eye', 'Eye Case', 1),
        ('case-free-direct', 'Direct Unassigned Case', 1),
        ('case-free-nested', 'Nested Unassigned Case', 1),
        ('case-inactive-free', 'Inactive Unassigned Case', 0);
      INSERT INTO cases (id, title, preview_session_id, is_active) VALUES ('case-preview-free', 'Preview Unassigned Case', 'preview-1', 1);
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES
        ('case-eye', 'topic-retina', 'primary'),
        ('case-free-direct', 'topic-free-direct', 'primary'),
        ('case-free-nested', 'topic-free-child', 'primary'),
        ('case-inactive-free', 'topic-free-child', 'primary'),
        ('case-preview-free', 'topic-free-child', 'primary');
      INSERT INTO case_tags (case_id, tag_id) VALUES ('case-eye', 'tag-shared'), ('case-free-nested', 'tag-shared');
    `);

    fixture.statements.length = 0;
    const unrestricted = await getCaseLibraryPage(fixture.db, filters(), { pageSize: 20 });
    assert.deepEqual(unrestricted.rows.map((row) => row.id), ['case-free-direct', 'case-eye', 'case-free-nested']);
    assert.equal(taxonomyReadCount(fixture.statements), 1, 'active Case Library must keep one compatible taxonomy read');

    const realSystem = await getCaseLibraryPage(fixture.db, filters({ systemSearch: 'yE' }), { pageSize: 20 });
    assert.deepEqual(realSystem.rows.map((row) => row.id), ['case-eye']);

    const unassigned = await getCaseLibraryPage(fixture.db, filters({ systemSearch: '  uNaSsIgNeD  ' }), { pageSize: 20 });
    assert.deepEqual(unassigned.rows.map((row) => row.id), ['case-free-direct', 'case-free-nested']);
    assert.ok(unassigned.rows.every((row) => row.systemName === null));

    const noMatch = await getCaseLibraryPage(fixture.db, filters({ systemSearch: 'not-a-system' }), { pageSize: 20 });
    assert.deepEqual(noMatch.rows, []);
    assert.equal(noMatch.totalCount, 0);

    const composed = await getCaseLibraryPage(fixture.db, filters({
      search: 'Nested',
      topicSearch: 'Child',
      systemSearch: 'Unassigned',
      tagId: 'tag-shared'
    }), { pageSize: 20 });
    assert.deepEqual(composed.rows.map((row) => row.id), ['case-free-nested']);

    const inactive = await getCaseLibraryPage(fixture.db, filters({ lifecycle: 'inactive', systemSearch: 'Unassigned' }), { pageSize: 20 });
    assert.deepEqual(inactive.rows.map((row) => row.id), ['case-inactive-free']);
    assert.deepEqual(inactive.topicOptions, []);
    assert.deepEqual(inactive.topicParentOptions, []);
  } finally {
    fixture.sqlite.close();
  }
});

test('pre-0015 Case Library treats legacy Topics as visibly Unassigned and still zero-matches unknown Systems', async () => {
  const fixture = createLearningDb(legacyMigrationNames);
  try {
    fixture.sqlite.exec(`
      INSERT INTO concepts (id, name, slug, is_active) VALUES ('topic-legacy', 'Legacy Topic', 'legacy-topic', 1);
      INSERT INTO cases (id, title, is_active) VALUES ('case-legacy', 'Legacy Case', 1);
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-legacy', 'topic-legacy', 'primary');
    `);
    const unassigned = await getCaseLibraryPage(fixture.db, filters({ systemSearch: 'Unassigned' }), { pageSize: 20 });
    assert.deepEqual(unassigned.rows.map((row) => row.id), ['case-legacy']);
    assert.equal(unassigned.rows[0].systemName, null);

    const noMatch = await getCaseLibraryPage(fixture.db, filters({ systemSearch: 'Cardiology' }), { pageSize: 20 });
    assert.deepEqual(noMatch.rows, []);
  } finally {
    fixture.sqlite.close();
  }
});
