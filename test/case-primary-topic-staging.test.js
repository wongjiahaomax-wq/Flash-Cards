import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createCase, AdminContentInputError } from '../src/lib/server/db/admin-content.js';
import { applyStagedCasePrimaryTopics } from '../src/lib/server/db/case-primary-topic-staging.ts';
import { createDb } from '../src/lib/server/db/index.js';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

const migrationNames = [
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
  '0013_review_assets_asset_lookup.sql',
  '0014_review_question_pool_mode.sql',
  '0015_contextual_system_topic_tag_navigation.sql'
];

const migrationSql = migrationNames
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('cardio', 'Cardiology', 'cardiology', 'system', NULL, 1),
      ('arrhythmias', 'Arrhythmias', 'arrhythmias', 'topic', 'cardio', 1),
      ('af', 'Atrial fibrillation', 'atrial-fibrillation', 'topic', 'arrhythmias', 1),
      ('pericarditis', 'Pericarditis', 'pericarditis', 'topic', 'cardio', 1),
      ('inactive-topic', 'Inactive Topic', 'inactive-topic', 'topic', 'cardio', 0);
  `);

  const d1 = {
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
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
    },
    /** @param {any[]} statements */
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };

  return {
    db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))),
    sqlite
  };
}

/** @param {DatabaseSync} sqlite @param {string} caseId */
function primaryTopicId(sqlite, caseId) {
  return sqlite.prepare("SELECT concept_id FROM case_concepts WHERE case_id = ? AND role = 'primary'").get(caseId)?.concept_id ?? null;
}

test('staged Case Primary Topic apply validates loaded state then reuses canonical bulk promotion', async () => {
  const fixture = createLearningDb();
  try {
    const first = await createCase(fixture.db, { title: 'First AF Case', conceptId: 'af' });
    const second = await createCase(fixture.db, { title: 'Second AF Case', conceptId: 'af' });

    await applyStagedCasePrimaryTopics(fixture.db, [
      { caseId: first.id, expectedConceptId: 'af', conceptId: 'pericarditis' },
      { caseId: second.id, expectedConceptId: 'af', conceptId: 'pericarditis' }
    ]);

    assert.equal(primaryTopicId(fixture.sqlite, first.id), 'pericarditis');
    assert.equal(primaryTopicId(fixture.sqlite, second.id), 'pericarditis');
  } finally {
    fixture.sqlite.close();
  }
});

test('stale loaded Primary Topic fails before any proposed Case writes', async () => {
  const fixture = createLearningDb();
  try {
    const first = await createCase(fixture.db, { title: 'Stable AF Case', conceptId: 'af' });
    const stale = await createCase(fixture.db, { title: 'Changed AF Case', conceptId: 'af' });
    fixture.sqlite.prepare("UPDATE case_concepts SET concept_id = 'arrhythmias' WHERE case_id = ? AND role = 'primary'").run(stale.id);

    await assert.rejects(
      applyStagedCasePrimaryTopics(fixture.db, [
        { caseId: first.id, expectedConceptId: 'af', conceptId: 'pericarditis' },
        { caseId: stale.id, expectedConceptId: 'af', conceptId: 'pericarditis' }
      ]),
      (error) => error instanceof AdminContentInputError && /changed since this workspace was loaded/i.test(error.message)
    );

    assert.equal(primaryTopicId(fixture.sqlite, first.id), 'af');
    assert.equal(primaryTopicId(fixture.sqlite, stale.id), 'arrhythmias');
  } finally {
    fixture.sqlite.close();
  }
});

test('staged Case Primary Topic batches require expected state, unique Cases and one target Topic', async () => {
  const fixture = createLearningDb();
  try {
    const first = await createCase(fixture.db, { title: 'Validation Case', conceptId: 'af' });

    await assert.rejects(
      applyStagedCasePrimaryTopics(fixture.db, [
        /** @type {any} */ ({ caseId: first.id, conceptId: 'pericarditis' })
      ]),
      (error) => error instanceof AdminContentInputError && /loaded Primary Topic/i.test(error.message)
    );

    await assert.rejects(
      applyStagedCasePrimaryTopics(fixture.db, [
        { caseId: first.id, expectedConceptId: 'af', conceptId: 'pericarditis' },
        { caseId: first.id, expectedConceptId: 'af', conceptId: 'pericarditis' }
      ]),
      (error) => error instanceof AdminContentInputError && /only once/i.test(error.message)
    );

    const second = await createCase(fixture.db, { title: 'Second validation Case', conceptId: 'af' });
    await assert.rejects(
      applyStagedCasePrimaryTopics(fixture.db, [
        { caseId: first.id, expectedConceptId: 'af', conceptId: 'pericarditis' },
        { caseId: second.id, expectedConceptId: 'af', conceptId: 'arrhythmias' }
      ]),
      (error) => error instanceof AdminContentInputError && /different Topic/i.test(error.message)
    );

    assert.equal(primaryTopicId(fixture.sqlite, first.id), 'af');
    assert.equal(primaryTopicId(fixture.sqlite, second.id), 'af');
  } finally {
    fixture.sqlite.close();
  }
});

test('canonical validation still rejects inactive Primary Topic targets after staging preflight', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Inactive target Case', conceptId: 'af' });
    await assert.rejects(
      applyStagedCasePrimaryTopics(fixture.db, [
        { caseId: created.id, expectedConceptId: 'af', conceptId: 'inactive-topic' }
      ]),
      (error) => error instanceof AdminContentInputError && /missing or inactive/i.test(error.message)
    );
    assert.equal(primaryTopicId(fixture.sqlite, created.id), 'af');
  } finally {
    fixture.sqlite.close();
  }
});
