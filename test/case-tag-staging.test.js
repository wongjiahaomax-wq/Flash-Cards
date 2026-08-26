import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createCase } from '../src/lib/server/db/admin-content.js';
import { applyStagedCaseTags } from '../src/lib/server/db/case-tag-staging.ts';
import { createDb } from '../src/lib/server/db/index.js';
import { addCaseTag, createTag, TagInputError } from '../src/lib/server/db/tag-library.js';

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
      ('af', 'Atrial fibrillation', 'atrial-fibrillation', 'topic', 'cardio', 1);
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

/** @param {DatabaseSync} sqlite @param {string} caseId @param {string} tagId */
function hasTag(sqlite, caseId, tagId) {
  return Boolean(sqlite.prepare('SELECT 1 FROM case_tags WHERE case_id = ? AND tag_id = ?').get(caseId, tagId));
}

test('staged Case Tag apply validates loaded membership then reuses canonical add/remove mutations', async () => {
  const fixture = createLearningDb();
  try {
    const first = await createCase(fixture.db, { title: 'AF with RVR', conceptId: 'af' });
    const second = await createCase(fixture.db, { title: 'Post-operative AF', conceptId: 'af' });
    const rate = await createTag(fixture.db, 'Rate control');
    const anticoag = await createTag(fixture.db, 'Anticoagulation');
    await addCaseTag(fixture.db, { caseId: first.id, tagId: rate.id });

    await applyStagedCaseTags(fixture.db, [
      { caseId: first.id, tagId: rate.id, operation: 'remove', expectedAttached: true },
      { caseId: second.id, tagId: anticoag.id, operation: 'add', expectedAttached: false }
    ]);

    assert.equal(hasTag(fixture.sqlite, first.id, rate.id), false);
    assert.equal(hasTag(fixture.sqlite, second.id, anticoag.id), true);
  } finally {
    fixture.sqlite.close();
  }
});

test('stale Case Tag membership fails before any proposed Tag writes begin', async () => {
  const fixture = createLearningDb();
  try {
    const stable = await createCase(fixture.db, { title: 'Stable AF Case', conceptId: 'af' });
    const stale = await createCase(fixture.db, { title: 'Changed AF Case', conceptId: 'af' });
    const rate = await createTag(fixture.db, 'Rate control');
    const anticoag = await createTag(fixture.db, 'Anticoagulation');

    // Simulate another Admin attaching this Tag after the workspace loaded.
    await addCaseTag(fixture.db, { caseId: stale.id, tagId: anticoag.id });

    await assert.rejects(
      applyStagedCaseTags(fixture.db, [
        { caseId: stable.id, tagId: rate.id, operation: 'add', expectedAttached: false },
        { caseId: stale.id, tagId: anticoag.id, operation: 'add', expectedAttached: false }
      ]),
      (error) => error instanceof TagInputError && /membership changed since this workspace was loaded/i.test(error.message)
    );

    assert.equal(hasTag(fixture.sqlite, stable.id, rate.id), false);
    assert.equal(hasTag(fixture.sqlite, stale.id, anticoag.id), true);
  } finally {
    fixture.sqlite.close();
  }
});

test('staged Case Tag batches require expected membership and unique meaningful Case/Tag pairs', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Validation Case', conceptId: 'af' });
    const tag = await createTag(fixture.db, 'Validation Tag');

    await assert.rejects(
      applyStagedCaseTags(fixture.db, [
        /** @type {any} */ ({ caseId: created.id, tagId: tag.id, operation: 'add' })
      ]),
      (error) => error instanceof TagInputError && /loaded membership/i.test(error.message)
    );

    await assert.rejects(
      applyStagedCaseTags(fixture.db, [
        { caseId: created.id, tagId: tag.id, operation: 'add', expectedAttached: false },
        { caseId: created.id, tagId: tag.id, operation: 'add', expectedAttached: false }
      ]),
      (error) => error instanceof TagInputError && /only once/i.test(error.message)
    );

    await assert.rejects(
      applyStagedCaseTags(fixture.db, [
        { caseId: created.id, tagId: tag.id, operation: 'add', expectedAttached: true }
      ]),
      (error) => error instanceof TagInputError && /must differ from its loaded membership/i.test(error.message)
    );

    assert.equal(hasTag(fixture.sqlite, created.id, tag.id), false);
  } finally {
    fixture.sqlite.close();
  }
});

test('canonical Tag validation still rejects inactive add targets after stale-state preflight', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Inactive Tag Case', conceptId: 'af' });
    const tag = await createTag(fixture.db, 'Inactive Tag');
    fixture.sqlite.prepare('UPDATE tags SET is_active = 0 WHERE id = ?').run(tag.id);

    await assert.rejects(
      applyStagedCaseTags(fixture.db, [
        { caseId: created.id, tagId: tag.id, operation: 'add', expectedAttached: false }
      ]),
      (error) => error instanceof TagInputError && /missing or inactive/i.test(error.message)
    );
    assert.equal(hasTag(fixture.sqlite, created.id, tag.id), false);
  } finally {
    fixture.sqlite.close();
  }
});
