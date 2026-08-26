import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createCase } from '../src/lib/server/db/admin-content.js';
import { createDb } from '../src/lib/server/db/index.js';
import { applyStagedTaxonomyWorkspace } from '../src/lib/server/db/taxonomy-workspace-staging.ts';
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
      ('af', 'Atrial fibrillation', 'af', 'topic', 'cardio', 1),
      ('peri', 'Pericarditis', 'peri', 'topic', 'cardio', 1);
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

/** @param {DatabaseSync} sqlite */
function parentId(sqlite) {
  return sqlite.prepare("SELECT parent_id FROM concepts WHERE id = 'peri'").get()?.parent_id ?? null;
}

/** @param {DatabaseSync} sqlite @param {string} caseId */
function primaryTopicId(sqlite, caseId) {
  return sqlite.prepare("SELECT concept_id FROM case_concepts WHERE case_id = ? AND role = 'primary'").get(caseId)?.concept_id ?? null;
}

/** @param {DatabaseSync} sqlite @param {string} caseId @param {string} tagId */
function hasTag(sqlite, caseId, tagId) {
  return Boolean(sqlite.prepare('SELECT 1 FROM case_tags WHERE case_id = ? AND tag_id = ?').get(caseId, tagId));
}

test('unified apply completes every domain preflight before the first hierarchy write', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'AF Case', conceptId: 'af' });
    const tag = await createTag(fixture.db, 'Anticoagulation');

    // Simulate another Admin changing Tag membership after this workspace loaded.
    await addCaseTag(fixture.db, { caseId: created.id, tagId: tag.id });

    await assert.rejects(
      applyStagedTaxonomyWorkspace(fixture.db, {
        hierarchyChanges: [{ id: 'peri', parentId: 'af', expectedParentId: 'cardio' }],
        caseTagChanges: [{ caseId: created.id, tagId: tag.id, operation: 'add', expectedAttached: false }]
      }),
      (error) => error instanceof TagInputError && /membership changed since this workspace was loaded/i.test(error.message)
    );

    assert.equal(parentId(fixture.sqlite), 'cardio');
    assert.equal(hasTag(fixture.sqlite, created.id, tag.id), true);
  } finally {
    fixture.sqlite.close();
  }
});

test('valid mixed hierarchy, Primary Topic and Case Tag changes apply through one workspace action', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'AF Case', conceptId: 'af' });
    const tag = await createTag(fixture.db, 'Rate control');

    const result = await applyStagedTaxonomyWorkspace(fixture.db, {
      hierarchyChanges: [{ id: 'peri', parentId: 'af', expectedParentId: 'cardio' }],
      casePrimaryTopicChanges: [{ caseId: created.id, conceptId: 'peri', expectedConceptId: 'af' }],
      caseTagChanges: [{ caseId: created.id, tagId: tag.id, operation: 'add', expectedAttached: false }]
    });

    assert.deepEqual(result, { hierarchyCount: 1, casePrimaryTopicCount: 1, caseTagCount: 1 });
    assert.equal(parentId(fixture.sqlite), 'af');
    assert.equal(primaryTopicId(fixture.sqlite, created.id), 'peri');
    assert.equal(hasTag(fixture.sqlite, created.id, tag.id), true);
  } finally {
    fixture.sqlite.close();
  }
});
