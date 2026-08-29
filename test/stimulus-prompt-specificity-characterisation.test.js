import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  ensurePromptIsNotUsedByAnotherGroup,
  saveStimulusGroupQuestion
} from '../src/lib/server/db/stimulus-groups.js';

const migrationSql = readdirSync(new URL('../drizzle/', import.meta.url))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

/** @param {DatabaseSync} sqlite */
function createD1(sqlite) {
  return {
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
        bind(...params) {
          return {
            async all() {
              return { results: sqlite.prepare(sql).all(...params) };
            },
            async raw() {
              const statement = sqlite.prepare(sql);
              statement.setReturnArrays(true);
              return statement.all(...params);
            },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return {
                success: true,
                results: [],
                meta: {
                  changes: Number(result.changes),
                  last_row_id: Number(result.lastInsertRowid)
                }
              };
            }
          };
        }
      };
    }
  };
}

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(`
    INSERT INTO cases (id, title, question_selection_mode, is_active)
    VALUES ('case-a', 'Prompt specificity case', 'automatic', 1);

    INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active) VALUES
      ('asset-a', 'image', 'asset-a.png', 'image/png', 'asset-a.png', 'Asset A', 1),
      ('asset-b', 'image', 'asset-b.png', 'image/png', 'asset-b.png', 'Asset B', 1),
      ('asset-c', 'image', 'asset-c.png', 'image/png', 'asset-c.png', 'Asset C', 1);

    INSERT INTO stimulus_groups
      (id, case_id, name, display_order, selection_count, specific_question_mode, is_active) VALUES
      ('group-target', 'case-a', 'Target', 0, 1, 'none', 1),
      ('group-inactive', 'case-a', 'Inactive family', 1, 1, 'none', 0),
      ('group-active-other', 'case-a', 'Active other family', 2, 1, 'none', 1);

    INSERT INTO stimulus_group_options
      (id, stimulus_group_id, asset_id, display_order, is_active) VALUES
      ('option-in-inactive-family', 'group-inactive', 'asset-a', 0, 1),
      ('option-inactive', 'group-active-other', 'asset-b', 0, 0),
      ('option-reusable-in-inactive-family', 'group-inactive', 'asset-c', 1, 1);
  `);
  return { sqlite, db: createDb(/** @type {any} */ (createD1(sqlite))) };
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} promptMd */
function insertPrompt(sqlite, id, promptMd) {
  sqlite.prepare(`
    INSERT INTO question_prompts (id, prompt_md, is_active)
    VALUES (?, ?, 1)
  `).run(id, promptMd);
}

test('current ordinary Prompt guard still counts a Question owned by an inactive Family', async () => {
  const fixture = createFixture();
  try {
    insertPrompt(fixture.sqlite, 'prompt-inactive-family', 'Inactive family ordinary prompt');
    fixture.sqlite.prepare(`
      INSERT INTO stimulus_group_questions
        (id, stimulus_group_id, question_prompt_id, answer_md, is_active)
      VALUES ('question-inactive-family', 'group-inactive', 'prompt-inactive-family', 'Answer', 1)
    `).run();

    await assert.rejects(
      ensurePromptIsNotUsedByAnotherGroup(
        fixture.db,
        'case-a',
        'prompt-inactive-family',
        'group-target'
      ),
      /cannot be independently attached to multiple active Stimulus Groups/
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('current ordinary Prompt guard still counts a Question owned by an inactive Option', async () => {
  const fixture = createFixture();
  try {
    insertPrompt(fixture.sqlite, 'prompt-inactive-option', 'Inactive option ordinary prompt');
    fixture.sqlite.prepare(`
      INSERT INTO stimulus_option_questions
        (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active)
      VALUES ('question-inactive-option', 'option-inactive', 'prompt-inactive-option', 'Answer', 1)
    `).run();

    await assert.rejects(
      ensurePromptIsNotUsedByAnotherGroup(
        fixture.db,
        'case-a',
        'prompt-inactive-option',
        'group-target'
      ),
      /cannot be independently attached to multiple active Stimulus Groups/
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('reusable Asset usage under an inactive Family does not block an ordinary Group Question', async () => {
  const fixture = createFixture();
  try {
    insertPrompt(fixture.sqlite, 'prompt-inactive-reusable', 'Inactive family reusable prompt');
    fixture.sqlite.prepare(`
      INSERT INTO asset_questions
        (id, asset_id, question_prompt_id, answer_md, is_active)
      VALUES ('asset-question-inactive-family', 'asset-c', 'prompt-inactive-reusable', 'Reusable answer', 1)
    `).run();
    fixture.sqlite.prepare(`
      INSERT INTO stimulus_option_asset_questions
        (stimulus_group_option_id, asset_question_id)
      VALUES ('option-reusable-in-inactive-family', 'asset-question-inactive-family')
    `).run();

    await saveStimulusGroupQuestion(fixture.db, 'group-target', {
      promptMd: 'Inactive family reusable prompt',
      answerMd: 'Target answer'
    });

    const row = fixture.sqlite.prepare(`
      SELECT question_prompt_id
      FROM stimulus_group_questions
      WHERE stimulus_group_id = 'group-target'
        AND question_prompt_id = 'prompt-inactive-reusable'
        AND is_active = 1
    `).get();
    assert.equal(row?.question_prompt_id, 'prompt-inactive-reusable');
  } finally {
    fixture.sqlite.close();
  }
});
