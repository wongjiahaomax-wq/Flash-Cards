// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { deleteUnusedTopic, TaxonomyInputError } from '../src/lib/server/db/taxonomy-admin-write.ts';

const migrationNames = [
  '0000_dashing_centennial.sql', '0002_optional_stimulus_groups.sql', '0003_multi_topic_study_routing.sql',
  '0004_resumable_import_jobs.sql', '0005_tag_foundation.sql', '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql', '0008_tag_shared_questions.sql', '0009_reusable_image_questions.sql',
  '0010_reusable_image_reactivation_guard.sql', '0011_asset_supersession.sql', '0012_archive_stimulus_options.sql',
  '0013_review_assets_asset_lookup.sql', '0014_review_question_pool_mode.sql', '0015_contextual_system_topic_tag_navigation.sql',
  '0016_original_stimulus_options.sql', '0017_align_reusable_prompt_live_state_guards.sql'
];

function migrationSql() {
  return migrationNames.map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8')).join('\n').replaceAll('--> statement-breakpoint', '');
}

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql());
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('system-eye', 'Eye', 'eye', 'system', NULL, 1),
      ('topic-unused', 'Unused Topic', 'unused-topic', 'topic', 'system-eye', 1),
      ('topic-case', 'Case Topic', 'case-topic', 'topic', 'system-eye', 1),
      ('topic-question', 'Question Topic', 'question-topic', 'topic', 'system-eye', 1),
      ('topic-parent', 'Parent Topic', 'parent-topic', 'topic', 'system-eye', 1),
      ('topic-child', 'Child Topic', 'child-topic', 'topic', 'topic-parent', 1);
    INSERT INTO cases (id, title, is_active) VALUES ('case-1', 'Case One', 1);
    INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-1', 'topic-case', 'primary');
    INSERT INTO question_prompts (id, prompt_md, is_active) VALUES ('prompt-1', 'What is the diagnosis?', 1);
    INSERT INTO concept_questions (id, concept_id, question_prompt_id, answer_md, inherit_to_descendants, is_active)
    VALUES ('concept-question-1', 'topic-question', 'prompt-1', 'Example answer', 0, 1);
  `);

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
  return { sqlite, db: createDb(d1) };
}

function conceptExists(sqlite, conceptId) {
  return Boolean(sqlite.prepare('SELECT id FROM concepts WHERE id = ?').get(conceptId));
}

test('unused Topic deletion permanently removes an otherwise unreferenced Topic', async () => {
  const fixture = createFixture();
  try {
    await deleteUnusedTopic(fixture.db, { conceptId: 'topic-unused' });
    assert.equal(conceptExists(fixture.sqlite, 'topic-unused'), false);
  } finally {
    fixture.sqlite.close();
  }
});

test('unused Topic deletion rejects Systems and Topics with current taxonomy/content usages', async () => {
  const fixture = createFixture();
  try {
    await assert.rejects(
      deleteUnusedTopic(fixture.db, { conceptId: 'system-eye' }),
      (error) => error instanceof TaxonomyInputError && /Only Topics can be deleted/i.test(error.message)
    );

    for (const conceptId of ['topic-case', 'topic-question', 'topic-parent']) {
      await assert.rejects(
        deleteUnusedTopic(fixture.db, { conceptId }),
        (error) => error instanceof TaxonomyInputError && /cannot be deleted/i.test(error.message)
      );
      assert.equal(conceptExists(fixture.sqlite, conceptId), true);
    }
  } finally {
    fixture.sqlite.close();
  }
});
