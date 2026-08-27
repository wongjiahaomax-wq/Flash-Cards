// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createCaseLibraryTopic, CaseLibraryTopicInputError } from '../src/lib/server/db/case-library-topic-authoring.ts';
import { createDb } from '../src/lib/server/db/index.js';

const migrationNames = [
  '0000_dashing_centennial.sql', '0002_optional_stimulus_groups.sql', '0003_multi_topic_study_routing.sql',
  '0004_resumable_import_jobs.sql', '0005_tag_foundation.sql', '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql', '0008_tag_shared_questions.sql', '0009_reusable_image_questions.sql',
  '0010_reusable_image_reactivation_guard.sql', '0011_asset_supersession.sql', '0012_archive_stimulus_options.sql',
  '0013_review_assets_asset_lookup.sql', '0014_review_question_pool_mode.sql', '0015_contextual_system_topic_tag_navigation.sql'
];

function migrationSql(names = migrationNames) {
  return names.map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8')).join('\n').replaceAll('--> statement-breakpoint', '');
}

function createFixture({ batch = true, legacy = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql(legacy ? migrationNames.slice(0, -1) : migrationNames));
  if (legacy) {
    sqlite.exec(`INSERT INTO concepts (id, name, slug, parent_id, is_active) VALUES ('topic-legacy-parent', 'Legacy Parent', 'legacy-parent', NULL, 1);`);
  } else {
    sqlite.exec(`
      INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview-1', 'user-1', 'active', 4102444800000);
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
        ('system-eye', 'Eye', 'eye', 'system', NULL, 1),
        ('topic-retina', 'Retina', 'retina', 'topic', 'system-eye', 1),
        ('topic-free', 'Free Parent', 'free-parent', 'topic', NULL, 1),
        ('topic-inactive-parent', 'Inactive Parent', 'inactive-parent', 'topic', NULL, 0);
      INSERT INTO cases (id, title, is_active) VALUES ('case-1', 'Case One', 1), ('case-2', 'Case Two', 1), ('case-inactive', 'Inactive Case', 0);
      INSERT INTO cases (id, title, preview_session_id, is_active) VALUES ('case-preview', 'Preview Case', 'preview-1', 1);
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES
        ('case-1', 'topic-retina', 'primary'), ('case-2', 'topic-retina', 'primary'),
        ('case-inactive', 'topic-retina', 'primary'), ('case-preview', 'topic-retina', 'primary');
    `);
  }

  const d1 = {
    prepare(sql) {
      return {
        bind(...params) {
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
    }
  };
  if (batch) {
    d1.batch = async (queries) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const query of queries) results.push(await query.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    };
  }
  return { sqlite, db: createDb(d1) };
}

function primaryRows(sqlite, caseId) {
  return sqlite.prepare("SELECT concept_id, role FROM case_concepts WHERE case_id = ? AND role = 'primary' ORDER BY concept_id").all(caseId).map((row) => ({ ...row }));
}

test('Case Library can create unassigned, System-parented, and Topic-parented global Topics with unique slugs', async () => {
  const fixture = createFixture();
  try {
    const unassigned = await createCaseLibraryTopic(fixture.db, { name: 'Quick Topic', parentId: '', caseIds: [] });
    const underSystem = await createCaseLibraryTopic(fixture.db, { name: 'Quick Topic', parentId: 'system-eye', caseIds: [] });
    const underTopic = await createCaseLibraryTopic(fixture.db, { name: 'Nested Quick Topic', parentId: 'topic-free', caseIds: [] });

    assert.equal(unassigned.selectedCount, 0);
    assert.equal(unassigned.slug, 'quick-topic');
    assert.equal(underSystem.slug, 'quick-topic-2');
    assert.deepEqual({ ...fixture.sqlite.prepare('SELECT kind, parent_id FROM concepts WHERE id = ?').get(unassigned.id) }, { kind: 'topic', parent_id: null });
    assert.deepEqual({ ...fixture.sqlite.prepare('SELECT kind, parent_id FROM concepts WHERE id = ?').get(underSystem.id) }, { kind: 'topic', parent_id: 'system-eye' });
    assert.deepEqual({ ...fixture.sqlite.prepare('SELECT kind, parent_id FROM concepts WHERE id = ?').get(underTopic.id) }, { kind: 'topic', parent_id: 'topic-free' });

    await assert.rejects(
      createCaseLibraryTopic(fixture.db, { name: 'Bad Parent Topic', parentId: 'topic-inactive-parent', caseIds: [] }),
      /inactive parent/i
    );
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM concepts WHERE name = 'Bad Parent Topic'").get().count, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('pre-0015 Case Library Topic creation uses the compatible taxonomy graph and insert path', async () => {
  const fixture = createFixture({ legacy: true });
  try {
    const result = await createCaseLibraryTopic(fixture.db, { name: 'Legacy Quick Topic', parentId: 'topic-legacy-parent', caseIds: [] });
    assert.equal(result.selectedCount, 0);
    assert.deepEqual(
      { ...fixture.sqlite.prepare('SELECT name, slug, parent_id, is_active FROM concepts WHERE id = ?').get(result.id) },
      { name: 'Legacy Quick Topic', slug: 'legacy-quick-topic', parent_id: 'topic-legacy-parent', is_active: 1 }
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Case Library create-and-assign replaces the one canonical Primary Topic for all selected Production Cases', async () => {
  const fixture = createFixture();
  try {
    const result = await createCaseLibraryTopic(fixture.db, { name: 'Assigned Topic', parentId: 'system-eye', caseIds: ['case-1', 'case-2', 'case-1'] });
    assert.equal(result.selectedCount, 2);
    assert.deepEqual(primaryRows(fixture.sqlite, 'case-1'), [{ concept_id: result.id, role: 'primary' }]);
    assert.deepEqual(primaryRows(fixture.sqlite, 'case-2'), [{ concept_id: result.id, role: 'primary' }]);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM case_concepts WHERE case_id IN ('case-1','case-2') AND role = 'secondary'").get().count, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('Case Library create-and-assign validates Production Case guards and the existing 60-Case limit before writes', async () => {
  const fixture = createFixture();
  try {
    for (const caseId of ['case-inactive', 'case-preview']) {
      await assert.rejects(
        createCaseLibraryTopic(fixture.db, { name: `Rejected ${caseId}`, caseIds: [caseId] }),
        (error) => error instanceof CaseLibraryTopicInputError && /missing or inactive/i.test(error.message)
      );
      assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM concepts WHERE name = ?').get(`Rejected ${caseId}`).count, 0);
    }
    await assert.rejects(
      createCaseLibraryTopic(fixture.db, { name: 'Too Many', caseIds: Array.from({ length: 61 }, (_, index) => `case-${index + 100}`) }),
      (error) => error instanceof CaseLibraryTopicInputError && /no more than 60/i.test(error.message)
    );
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM concepts WHERE name = 'Too Many'").get().count, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('non-batch fallback restores prior Primary Topics and removes the new Topic after a partial assignment failure', async () => {
  const fixture = createFixture({ batch: false });
  try {
    fixture.sqlite.exec(`
      CREATE TRIGGER reject_case_two_topic_change
      BEFORE UPDATE OF concept_id ON case_concepts
      WHEN OLD.case_id = 'case-2'
      BEGIN SELECT RAISE(ABORT, 'forced second Case failure'); END;
    `);

    await assert.rejects(createCaseLibraryTopic(fixture.db, { name: 'Rollback Topic', caseIds: ['case-1', 'case-2'] }));
    assert.deepEqual(primaryRows(fixture.sqlite, 'case-1'), [{ concept_id: 'topic-retina', role: 'primary' }]);
    assert.deepEqual(primaryRows(fixture.sqlite, 'case-2'), [{ concept_id: 'topic-retina', role: 'primary' }]);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM concepts WHERE name = 'Rollback Topic'").get().count, 0);
  } finally {
    fixture.sqlite.close();
  }
});
