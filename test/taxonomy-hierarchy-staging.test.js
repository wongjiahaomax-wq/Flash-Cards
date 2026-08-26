import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { applyStagedTaxonomyHierarchy } from '../src/lib/server/db/taxonomy-hierarchy-staging.ts';
import { TaxonomyInputError } from '../src/lib/server/db/taxonomy-admin-write.ts';

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
      ('endocrine', 'Endocrine', 'endocrine', 'system', NULL, 1),
      ('arrhythmias', 'Arrhythmias', 'arrhythmias', 'topic', 'cardio', 1),
      ('af', 'Atrial fibrillation', 'atrial-fibrillation', 'topic', 'arrhythmias', 1);
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

/** @param {DatabaseSync} sqlite @param {string} id */
function parentId(sqlite, id) {
  return sqlite.prepare('SELECT parent_id FROM concepts WHERE id = ?').get(id)?.parent_id ?? null;
}

test('staged hierarchy apply validates original parents then uses the canonical hierarchy writer', async () => {
  const fixture = createLearningDb();
  try {
    await applyStagedTaxonomyHierarchy(fixture.db, [
      { id: 'arrhythmias', expectedParentId: 'cardio', parentId: 'endocrine' },
      { id: 'af', expectedParentId: 'arrhythmias', parentId: 'cardio' }
    ]);

    assert.equal(parentId(fixture.sqlite, 'arrhythmias'), 'endocrine');
    assert.equal(parentId(fixture.sqlite, 'af'), 'cardio');
  } finally {
    fixture.sqlite.close();
  }
});

test('stale original-parent state fails before applying any proposed hierarchy writes', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.prepare("UPDATE concepts SET parent_id = 'endocrine' WHERE id = 'af'").run();

    await assert.rejects(
      applyStagedTaxonomyHierarchy(fixture.db, [
        { id: 'arrhythmias', expectedParentId: 'cardio', parentId: 'endocrine' },
        { id: 'af', expectedParentId: 'arrhythmias', parentId: 'cardio' }
      ]),
      (error) => error instanceof TaxonomyInputError && /changed since this workspace was loaded/i.test(error.message)
    );

    assert.equal(parentId(fixture.sqlite, 'arrhythmias'), 'cardio');
    assert.equal(parentId(fixture.sqlite, 'af'), 'endocrine');
  } finally {
    fixture.sqlite.close();
  }
});

test('staged hierarchy apply requires original-parent metadata and one move per Topic', async () => {
  const fixture = createLearningDb();
  try {
    await assert.rejects(
      applyStagedTaxonomyHierarchy(fixture.db, [
        /** @type {any} */ ({ id: 'af', parentId: 'cardio' })
      ]),
      (error) => error instanceof TaxonomyInputError && /original parent/i.test(error.message)
    );

    await assert.rejects(
      applyStagedTaxonomyHierarchy(fixture.db, [
        { id: 'af', expectedParentId: 'arrhythmias', parentId: 'cardio' },
        { id: 'af', expectedParentId: 'arrhythmias', parentId: 'endocrine' }
      ]),
      (error) => error instanceof TaxonomyInputError && /only once/i.test(error.message)
    );

    assert.equal(parentId(fixture.sqlite, 'af'), 'arrhythmias');
  } finally {
    fixture.sqlite.close();
  }
});
