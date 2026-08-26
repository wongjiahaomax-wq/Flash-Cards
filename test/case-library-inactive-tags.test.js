import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getCaseLibraryPage } from '../src/lib/server/db/case-library.js';
import { createDb } from '../src/lib/server/db/index.js';
import { listCaseLibraryTagOptions } from '../src/lib/server/db/library-options.js';

const migrationSql = [
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
]
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)
    VALUES ('topic-eye', 'Eye Topic', 'eye-topic', 'topic', NULL, 1);
    INSERT INTO tags (id, name, normalized_name, is_active) VALUES
      ('tag-active', 'Active Tag', 'active tag', 1),
      ('tag-inactive', 'Archived Tag', 'archived tag', 0);
    INSERT INTO cases (id, title, is_active) VALUES
      ('case-inactive-tag', 'Inactive archived-tag Case', 0),
      ('case-active', 'Active Case', 1);
    INSERT INTO case_concepts (case_id, concept_id, role) VALUES
      ('case-inactive-tag', 'topic-eye', 'primary'),
      ('case-active', 'topic-eye', 'primary');
    INSERT INTO case_tags (case_id, tag_id) VALUES
      ('case-inactive-tag', 'tag-inactive'),
      ('case-active', 'tag-active');
  `);

  const d1 = /** @type {any} */ ({
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
    /** @param {any[]} queries */
    async batch(queries) { return Promise.all(queries.map((query) => query.run())); }
  });
  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite };
}

test('Inactive Case Library exposes and filters by inactive Tags without changing Active Tag semantics', async () => {
  const fixture = createLearningDb();
  try {
    assert.deepEqual(await listCaseLibraryTagOptions(fixture.db, 'inactive'), [
      { id: 'tag-inactive', name: 'Archived Tag' }
    ]);
    assert.deepEqual(await listCaseLibraryTagOptions(fixture.db, 'active'), [
      { id: 'tag-active', name: 'Active Tag' }
    ]);

    const inactive = await getCaseLibraryPage(
      fixture.db,
      { search: '', tagId: 'tag-inactive', lifecycle: 'inactive' },
      { pageSize: 10 }
    );
    assert.deepEqual(inactive.rows.map((row) => row.id), ['case-inactive-tag']);
    assert.deepEqual(inactive.rows[0]?.tags, [{ id: 'tag-inactive', name: 'Archived Tag' }]);

    const active = await getCaseLibraryPage(
      fixture.db,
      { search: '', tagId: 'tag-inactive', lifecycle: 'active' },
      { pageSize: 10 }
    );
    assert.equal(active.totalCount, 0);
  } finally {
    fixture.sqlite.close();
  }
});
