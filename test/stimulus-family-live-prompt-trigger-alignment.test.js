import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  setStimulusOptionActive,
  updateStimulusGroup
} from '../src/lib/server/db/stimulus-groups.js';

const migrationSql = readdirSync(new URL('../drizzle/', import.meta.url))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  const d1 = {
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
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
              return {
                success: true,
                results: [],
                meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
              };
            }
          };
        }
      };
    }
  };
  return { sqlite, db: createDb(/** @type {any} */ (d1)) };
}

/** @param {DatabaseSync} sqlite @param {string} id */
function insertCase(sqlite, id) {
  sqlite.prepare(`
    INSERT INTO cases (id, title, question_selection_mode, is_active)
    VALUES (?, ?, 'automatic', 1)
  `).run(id, id);
}

/** @param {DatabaseSync} sqlite @param {string} id */
function insertAsset(sqlite, id) {
  sqlite.prepare(`
    INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active)
    VALUES (?, 'image', ?, 'image/png', ?, ?, 1)
  `).run(id, `${id}.png`, `${id}.png`, `${id} alt`);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} caseId @param {number} order @param {boolean} active */
function insertGroup(sqlite, id, caseId, order, active) {
  sqlite.prepare(`
    INSERT INTO stimulus_groups
      (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active)
    VALUES (?, ?, ?, ?, 1, 'none', NULL, ?)
  `).run(id, caseId, id, order, active ? 1 : 0);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} groupId @param {string} assetId @param {number} order @param {boolean} active */
function insertOption(sqlite, id, groupId, assetId, order, active) {
  sqlite.prepare(`
    INSERT INTO stimulus_group_options
      (id, stimulus_group_id, asset_id, display_order, is_active, removed_from_case)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(id, groupId, assetId, order, active ? 1 : 0);
}

/** @param {DatabaseSync} sqlite @param {string} id */
function insertPrompt(sqlite, id) {
  sqlite.prepare(`
    INSERT INTO question_prompts (id, prompt_md, is_active)
    VALUES (?, ?, 1)
  `).run(id, id);
}

test('dormant ordinary Family and Option questions may reuse a live reusable Prompt until activation', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'ordinary-dormant-case');
    for (const id of ['ordinary-owner-asset', 'ordinary-family-asset', 'ordinary-option-asset']) insertAsset(sqlite, id);
    insertGroup(sqlite, 'ordinary-owner-family', 'ordinary-dormant-case', 0, true);
    insertGroup(sqlite, 'ordinary-dormant-family', 'ordinary-dormant-case', 1, false);
    insertGroup(sqlite, 'ordinary-option-family', 'ordinary-dormant-case', 2, true);
    insertOption(sqlite, 'ordinary-owner-option', 'ordinary-owner-family', 'ordinary-owner-asset', 0, true);
    insertOption(sqlite, 'ordinary-family-option', 'ordinary-dormant-family', 'ordinary-family-asset', 0, true);
    insertOption(sqlite, 'ordinary-dormant-option', 'ordinary-option-family', 'ordinary-option-asset', 0, false);
    insertPrompt(sqlite, 'ordinary-live-reusable-prompt');

    sqlite.prepare(`
      INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active)
      VALUES ('ordinary-owner-aq', 'ordinary-owner-asset', 'ordinary-live-reusable-prompt', 'Reusable owner', 1)
    `).run();
    sqlite.prepare(`
      INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id)
      VALUES ('ordinary-owner-option', 'ordinary-owner-aq')
    `).run();

    assert.doesNotThrow(() => sqlite.prepare(`
      INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active)
      VALUES ('ordinary-dormant-family-question', 'ordinary-dormant-family', 'ordinary-live-reusable-prompt', 'Dormant family', 1)
    `).run());
    assert.doesNotThrow(() => sqlite.prepare(`
      INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active)
      VALUES ('ordinary-dormant-option-question', 'ordinary-dormant-option', 'ordinary-live-reusable-prompt', 'Dormant option', 1)
    `).run());

    await assert.rejects(
      () => setStimulusOptionActive(db, 'ordinary-dormant-option', true),
      /Question Prompt|stimulus-specific|Stimulus Group/i
    );
    assert.equal(sqlite.prepare(`SELECT is_active FROM stimulus_group_options WHERE id = 'ordinary-dormant-option'`).get()?.is_active, 0);

    await assert.rejects(
      () => updateStimulusGroup(db, {
        groupId: 'ordinary-dormant-family',
        name: 'ordinary-dormant-family',
        specificQuestionMode: 'none',
        isActive: true
      }),
      /Question Prompt|stimulus-specific|Stimulus Group/i
    );
    assert.equal(sqlite.prepare(`SELECT is_active FROM stimulus_groups WHERE id = 'ordinary-dormant-family'`).get()?.is_active, 0);
  } finally {
    sqlite.close();
  }
});

test('dormant reusable opt-ins may reuse a live ordinary Prompt until their Family or Option becomes live', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'reusable-dormant-case');
    for (const id of ['reusable-owner-asset', 'reusable-family-asset', 'reusable-option-asset']) insertAsset(sqlite, id);
    insertGroup(sqlite, 'reusable-owner-family', 'reusable-dormant-case', 0, true);
    insertGroup(sqlite, 'reusable-dormant-family', 'reusable-dormant-case', 1, false);
    insertGroup(sqlite, 'reusable-option-family', 'reusable-dormant-case', 2, true);
    insertOption(sqlite, 'reusable-owner-option', 'reusable-owner-family', 'reusable-owner-asset', 0, true);
    insertOption(sqlite, 'reusable-family-option', 'reusable-dormant-family', 'reusable-family-asset', 0, true);
    insertOption(sqlite, 'reusable-dormant-option', 'reusable-option-family', 'reusable-option-asset', 0, false);
    insertPrompt(sqlite, 'reusable-live-ordinary-prompt');

    sqlite.prepare(`
      INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active)
      VALUES ('reusable-owner-question', 'reusable-owner-family', 'reusable-live-ordinary-prompt', 'Ordinary owner', 1)
    `).run();
    sqlite.prepare(`
      INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active)
      VALUES ('reusable-family-aq', 'reusable-family-asset', 'reusable-live-ordinary-prompt', 'Dormant family reusable', 1)
    `).run();
    sqlite.prepare(`
      INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active)
      VALUES ('reusable-option-aq', 'reusable-option-asset', 'reusable-live-ordinary-prompt', 'Dormant option reusable', 1)
    `).run();

    assert.doesNotThrow(() => sqlite.prepare(`
      INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id)
      VALUES ('reusable-family-option', 'reusable-family-aq')
    `).run());
    assert.doesNotThrow(() => sqlite.prepare(`
      INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id)
      VALUES ('reusable-dormant-option', 'reusable-option-aq')
    `).run());

    await assert.rejects(
      () => setStimulusOptionActive(db, 'reusable-dormant-option', true),
      /Question Prompt|stimulus-specific|Stimulus Group/i
    );
    assert.equal(sqlite.prepare(`SELECT is_active FROM stimulus_group_options WHERE id = 'reusable-dormant-option'`).get()?.is_active, 0);

    await assert.rejects(
      () => updateStimulusGroup(db, {
        groupId: 'reusable-dormant-family',
        name: 'reusable-dormant-family',
        specificQuestionMode: 'none',
        isActive: true
      }),
      /Question Prompt|stimulus-specific|Stimulus Group/i
    );
    assert.equal(sqlite.prepare(`SELECT is_active FROM stimulus_groups WHERE id = 'reusable-dormant-family'`).get()?.is_active, 0);
  } finally {
    sqlite.close();
  }
});
