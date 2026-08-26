import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  CaseLifecycleError,
  deactivateProductionCase,
  getInactiveProductionCaseRecovery,
  restoreProductionCase
} from '../src/lib/server/db/case-lifecycle.ts';
import { createDb } from '../src/lib/server/db/index.js';

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
  '0014_review_question_pool_mode.sql'
]
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function createPre0015Db() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, parent_id, is_active)
    VALUES ('legacy-topic', 'Legacy Topic', 'legacy-topic', NULL, 1);
    INSERT INTO cases (id, title, vignette_md, is_active)
    VALUES ('legacy-case', 'Legacy lifecycle Case', 'Legacy vignette', 1);
    INSERT INTO case_concepts (case_id, concept_id, role)
    VALUES ('legacy-case', 'legacy-topic', 'primary');
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
    async batch(queries) {
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
    }
  });

  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite };
}

test('Case recovery and restore remain compatible before migration 0015 adds concepts.kind', async () => {
  const fixture = createPre0015Db();
  try {
    await deactivateProductionCase(fixture.db, 'legacy-case');

    const recovery = await getInactiveProductionCaseRecovery(fixture.db, 'legacy-case');
    assert.equal(recovery?.case.id, 'legacy-case');
    assert.deepEqual(recovery?.primaryTopics, [{
      conceptId: 'legacy-topic',
      name: 'Legacy Topic',
      kind: 'topic',
      isActive: true
    }]);
    assert.equal(recovery?.systemName, null);

    fixture.sqlite.prepare("UPDATE concepts SET is_active = 0 WHERE id = 'legacy-topic'").run();
    await assert.rejects(
      restoreProductionCase(fixture.db, 'legacy-case'),
      (error) => error instanceof CaseLifecycleError && /Primary Topic is inactive/i.test(error.message)
    );
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM cases WHERE id = 'legacy-case'").get()?.is_active, 0);

    fixture.sqlite.prepare("UPDATE concepts SET is_active = 1 WHERE id = 'legacy-topic'").run();
    const restored = await restoreProductionCase(fixture.db, 'legacy-case');
    assert.equal(restored.changed, true);
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM cases WHERE id = 'legacy-case'").get()?.is_active, 1);
  } finally {
    fixture.sqlite.close();
  }
});
