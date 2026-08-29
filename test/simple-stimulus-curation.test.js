import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { assignSimpleStimulusRoles } from '../src/lib/server/db/simple-stimulus-curation.js';

const migrationSql = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql',
  '0011_asset_supersession.sql',
  '0012_archive_stimulus_options.sql',
  '0013_review_assets_asset_lookup.sql',
  '0014_review_question_pool_mode.sql',
  '0016_original_stimulus_options.sql'
]
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function createD1(sqlite) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() {
              const statement = sqlite.prepare(sql);
              statement.setReturnArrays(true);
              return statement.all(...params);
            },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            }
          };
        }
      };
    },
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
}

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(`
    INSERT INTO cases (id, title, question_selection_mode, is_active)
    VALUES ('case-eye', 'Eye case', 'automatic', 1);

    INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active) VALUES
      ('asset-a', 'image', 'a.png', 'image/png', 'a.png', 'Image A', 1),
      ('asset-b', 'image', 'b.png', 'image/png', 'b.png', 'Image B', 1),
      ('asset-c', 'image', 'c.png', 'image/png', 'c.png', 'Image C', 1);

    INSERT INTO case_assets (case_id, asset_id, display_order, caption_md) VALUES
      ('case-eye', 'asset-a', 0, 'A caption'),
      ('case-eye', 'asset-b', 1, 'B caption'),
      ('case-eye', 'asset-c', 2, 'C caption');
  `);
  return { sqlite, db: createDb(createD1(sqlite)) };
}

test('simple stimulus role assignment atomically turns two ordinary images into Original and Alternative', async () => {
  const fixture = createFixture();
  try {
    const result = await assignSimpleStimulusRoles(fixture.db, {
      caseId: 'case-eye',
      originalAssetId: 'asset-b',
      alternativeAssetId: 'asset-a'
    });

    const group = fixture.sqlite.prepare(`
      SELECT id, name, original_option_id FROM stimulus_groups WHERE id = ?
    `).get(result.groupId);
    assert.equal(group.name, 'Primary stimulus');

    const options = fixture.sqlite.prepare(`
      SELECT id, asset_id, display_order FROM stimulus_group_options
      WHERE stimulus_group_id = ? ORDER BY display_order
    `).all(result.groupId);
    assert.deepEqual(options.map((row) => row.asset_id), ['asset-b', 'asset-a']);
    assert.equal(group.original_option_id, options[0].id);

    const remaining = fixture.sqlite.prepare(`
      SELECT asset_id, display_order FROM case_assets WHERE case_id = 'case-eye' ORDER BY display_order
    `).all();
    assert.deepEqual(remaining, [{ asset_id: 'asset-c', display_order: 0 }]);
  } finally {
    fixture.sqlite.close();
  }
});

test('simple stimulus role assignment rejects choosing the same image for both roles', async () => {
  const fixture = createFixture();
  try {
    await assert.rejects(
      assignSimpleStimulusRoles(fixture.db, {
        caseId: 'case-eye',
        originalAssetId: 'asset-a',
        alternativeAssetId: 'asset-a'
      }),
      /Choose two different images/
    );
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM stimulus_groups').get().count, 0);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM case_assets WHERE case_id='case-eye'").get().count, 3);
  } finally {
    fixture.sqlite.close();
  }
});
