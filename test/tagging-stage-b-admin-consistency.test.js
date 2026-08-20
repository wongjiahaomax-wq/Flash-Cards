import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { getSharedQuestion, updateSharedQuestion } from '../src/lib/server/db/shared-question-library.js';
import { listQuestionLibraryWithShared } from '../src/lib/server/db/shared-question-prompt-usage.js';
import { listSharedQuestionTagUsages, listTagsWithSharedQuestionUsage } from '../src/lib/server/db/tag-shared-usage.js';

const migrationSql = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql',
  '0012_archive_stimulus_options.sql'
].map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n').replaceAll('--> statement-breakpoint', '');

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
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
    /** @param {any[]} statements */
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  });
  return { sqlite, db: createDb(/** @type {D1Database} */ (d1)) };
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} name @param {boolean} [active] */
function addTag(sqlite, id, name, active = true) {
  sqlite.prepare('INSERT INTO tags (id, name, normalized_name, is_active) VALUES (?, ?, ?, ?)')
    .run(id, name, name.toLowerCase(), active ? 1 : 0);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} wording */
function addPrompt(sqlite, id, wording) {
  sqlite.prepare('INSERT INTO question_prompts (id, prompt_md, is_active) VALUES (?, ?, 1)').run(id, wording);
}

/** @param {DatabaseSync} sqlite @param {{ id: string, promptId: string, scopeTagId: string, answer: string }} input */
function addShared(sqlite, input) {
  sqlite.prepare(`INSERT INTO shared_questions (id, question_prompt_id, answer_md, reuse_scope_tag_id, is_active)
    VALUES (?, ?, ?, ?, 1)`).run(input.id, input.promptId, input.answer, input.scopeTagId);
}

test('editing a Shared Question preserves an existing inactive descriptive Tag until explicitly removed', async () => {
  const f = fixture();
  try {
    addTag(f.sqlite, 'scope', 'Scope');
    addTag(f.sqlite, 'descriptive', 'Descriptive');
    addPrompt(f.sqlite, 'prompt', 'What is happening?');
    addShared(f.sqlite, { id: 'shared', promptId: 'prompt', scopeTagId: 'scope', answer: 'Original answer' });
    f.sqlite.prepare('INSERT INTO shared_question_tags (shared_question_id, tag_id) VALUES (?, ?)').run('shared', 'descriptive');
    f.sqlite.prepare('UPDATE tags SET is_active = 0 WHERE id = ?').run('descriptive');

    const before = await getSharedQuestion(f.db, 'shared');
    assert.equal(before?.descriptiveTags[0]?.tagIsActive, false);

    await updateSharedQuestion(f.db, {
      id: 'shared',
      questionPromptId: 'prompt',
      answerMd: 'Edited answer',
      reuseScopeTagId: 'scope',
      descriptiveTagIds: ['descriptive']
    });
    assert.equal(
      Number(f.sqlite.prepare('SELECT COUNT(*) AS count FROM shared_question_tags WHERE shared_question_id = ? AND tag_id = ?').get('shared', 'descriptive')?.count),
      1
    );

    await updateSharedQuestion(f.db, {
      id: 'shared',
      questionPromptId: 'prompt',
      answerMd: 'Edited again',
      reuseScopeTagId: 'scope',
      descriptiveTagIds: []
    });
    assert.equal(
      Number(f.sqlite.prepare('SELECT COUNT(*) AS count FROM shared_question_tags WHERE shared_question_id = ?').get('shared')?.count),
      0
    );
  } finally { f.sqlite.close(); }
});

test('Tags Admin usage distinguishes Shared Question reuse scope from descriptive usage', async () => {
  const f = fixture();
  try {
    addTag(f.sqlite, 'scope', 'Scope');
    addTag(f.sqlite, 'descriptive', 'Descriptive');
    addPrompt(f.sqlite, 'prompt', 'Shared prompt?');
    addShared(f.sqlite, { id: 'shared', promptId: 'prompt', scopeTagId: 'scope', answer: 'Shared answer' });
    f.sqlite.prepare('INSERT INTO shared_question_tags (shared_question_id, tag_id) VALUES (?, ?)').run('shared', 'descriptive');

    const tags = await listTagsWithSharedQuestionUsage(f.db);
    const scope = tags.find((tag) => tag.id === 'scope');
    const descriptive = tags.find((tag) => tag.id === 'descriptive');
    assert.equal(scope?.activeSharedReuseScopeCount, 1);
    assert.equal(scope?.activeSharedDescriptiveCount, 0);
    assert.equal(descriptive?.activeSharedReuseScopeCount, 0);
    assert.equal(descriptive?.activeSharedDescriptiveCount, 1);

    const usages = await listSharedQuestionTagUsages(f.db);
    assert.equal(usages.some((usage) => usage.tagId === 'scope' && usage.usageType === 'reuse_scope'), true);
    assert.equal(usages.some((usage) => usage.tagId === 'descriptive' && usage.usageType === 'descriptive'), true);
  } finally { f.sqlite.close(); }
});

test('Questions Library counts a Prompt used only by an active Shared Question as Shared rather than Unused', async () => {
  const f = fixture();
  try {
    addTag(f.sqlite, 'scope', 'Scope');
    addPrompt(f.sqlite, 'prompt', 'Only shared?');
    addShared(f.sqlite, { id: 'shared', promptId: 'prompt', scopeTagId: 'scope', answer: 'Unique reusable answer' });

    const rows = await listQuestionLibraryWithShared(f.db);
    const row = rows.find((item) => item.id === 'prompt');
    assert.ok(row);
    assert.equal(row.usageCount, 1);
    assert.equal(row.sharedQuestionUsageCount, 1);
    assert.equal(row.hasSharedUsage, true);
    assert.equal(row.scope, 'Shared');

    const sharedOnly = await listQuestionLibraryWithShared(f.db, { scope: 'shared' });
    assert.equal(sharedOnly.some((item) => item.id === 'prompt'), true);
    const answerSearch = await listQuestionLibraryWithShared(f.db, { search: 'unique reusable answer' });
    assert.equal(answerSearch.some((item) => item.id === 'prompt'), true);
  } finally { f.sqlite.close(); }
});
