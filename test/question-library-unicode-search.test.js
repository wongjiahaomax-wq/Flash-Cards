import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { getQuestionLibraryPage } from '../src/lib/server/db/question-library-page.js';

const migrationSql = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql',
  '0010_reusable_image_reactivation_guard.sql',
  '0011_asset_supersession.sql',
  '0012_archive_stimulus_options.sql',
  '0013_review_assets_asset_lookup.sql'
]
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  /** @type {{ sql: string, params: any[] }[]} */
  const statements = [];
  const d1 = /** @type {any} */ ({
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
        bind(...params) {
          statements.push({ sql, params });
          return {
            async all() {
              return { results: sqlite.prepare(sql).all(...params) };
            },
            async raw() {
              return sqlite.prepare(sql).all(...params).map((row) => Object.values(row));
            },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return {
                success: true,
                results: [],
                meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
              };
            }
          };
        }
      };
    },
    /** @param {any[]} queries */
    async batch(queries) {
      return Promise.all(queries.map((query) => query.run()));
    }
  });
  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite, statements };
}

/** @param {string} search */
function filters(search) {
  return { search, topicId: '', scope: /** @type {'all'} */ ('all'), tagId: '' };
}

test('Question Library preserves Unicode-aware case-insensitive Prompt and answer search in bounded batches', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec("INSERT INTO tags (id, name, normalized_name, is_active) VALUES ('tag-a', 'Alpha', 'alpha', 1)");
    fixture.sqlite.exec("INSERT INTO question_prompts (id, prompt_md, is_active) VALUES ('prompt-unicode-prompt', 'β-blocker teaching prompt', 1), ('prompt-unicode-answer', 'Unicode answer prompt', 1)");
    fixture.sqlite.exec("INSERT INTO shared_questions (id, question_prompt_id, answer_md, reuse_scope_tag_id, is_active) VALUES ('shared-unicode-answer', 'prompt-unicode-answer', 'α-agonist teaching point', 'tag-a', 1)");

    for (let index = 1; index <= 65; index += 1) {
      fixture.sqlite.prepare("INSERT INTO question_prompts (id, prompt_md, is_active) VALUES (?, ?, 1)").run(
        `prompt-unicode-decoy-${String(index).padStart(3, '0')}`,
        `δ decoy ${String(index).padStart(3, '0')}`
      );
    }

    fixture.statements.length = 0;
    const promptSearch = await getQuestionLibraryPage(fixture.db, filters('Β-BLOCKER'), { pageSize: 10 });
    assert.equal(promptSearch.totalCount, 1);
    assert.deepEqual(promptSearch.rows.map((row) => row.id), ['prompt-unicode-prompt']);

    const answerSearch = await getQuestionLibraryPage(fixture.db, filters('Α-AGONIST'), { pageSize: 10 });
    assert.equal(answerSearch.totalCount, 1);
    assert.deepEqual(answerSearch.rows.map((row) => row.id), ['prompt-unicode-answer']);
    assert.equal(answerSearch.rows[0]?.sharedQuestionUsageCount, 1);

    const relationshipQueries = fixture.statements.filter(
      (statement) => / in \(/.test(statement.sql) && /(concept_questions|case_questions|stimulus_group_questions|stimulus_option_questions|shared_questions|asset_questions)/.test(statement.sql)
    );
    assert.ok(relationshipQueries.length > 0);
    assert.ok(
      relationshipQueries.every((statement) => statement.params.filter((value) => typeof value === 'string' && value.startsWith('prompt-')).length <= 60),
      'Unicode search relationship reads must stay bounded to at most 60 Prompt IDs per query'
    );
  } finally {
    fixture.sqlite.close();
  }
});
