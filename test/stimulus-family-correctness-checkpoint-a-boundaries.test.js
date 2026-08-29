import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { saveCaseQuestion } from '../src/lib/server/db/case-questions.js';
import { moveStimulusOptionWithinCase } from '../src/lib/server/db/image-option-move.js';
import { createDb } from '../src/lib/server/db/index.js';
import { moveCaseQuestionToStimulusTarget } from '../src/lib/server/db/question-scope.js';
import { setStimulusOptionActive } from '../src/lib/server/db/stimulus-groups.js';

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
  sqlite.exec(buildSeedSql());
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
  return { sqlite, db: createDb(/** @type {any} */ (d1)) };
}

/** @param {DatabaseSync} sqlite @param {string} id @param {{ mode?: string, count?: number | null }} [options] */
function insertCase(sqlite, id, options = {}) {
  sqlite.prepare(`
    INSERT INTO cases (id, title, question_selection_mode, question_count, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run(id, id, options.mode ?? 'automatic', options.count ?? null);
}

/** @param {DatabaseSync} sqlite @param {string} id */
function insertAsset(sqlite, id) {
  sqlite.prepare(`
    INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active)
    VALUES (?, 'image', ?, 'image/png', ?, ?, 1)
  `).run(id, `${id}.png`, `${id}.png`, `${id} alt`);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} caseId @param {number} order @param {{ mode?: string, minimum?: number | null }} [options] */
function insertGroup(sqlite, id, caseId, order, options = {}) {
  sqlite.prepare(`
    INSERT INTO stimulus_groups
      (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active)
    VALUES (?, ?, ?, ?, 1, ?, ?, 1)
  `).run(id, caseId, id, order, options.mode ?? 'none', options.minimum ?? null);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} groupId @param {string} assetId @param {number} order @param {boolean} [active] */
function insertOption(sqlite, id, groupId, assetId, order, active = true) {
  sqlite.prepare(`
    INSERT INTO stimulus_group_options
      (id, stimulus_group_id, asset_id, display_order, is_active, removed_from_case)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(id, groupId, assetId, order, active ? 1 : 0);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} wording */
function insertPrompt(sqlite, id, wording) {
  sqlite.prepare(`INSERT INTO question_prompts (id, prompt_md, is_active) VALUES (?, ?, 1)`).run(id, wording);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} optionId @param {string} promptId */
function insertOptionQuestion(sqlite, id, optionId, promptId) {
  sqlite.prepare(`
    INSERT INTO stimulus_option_questions
      (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active)
    VALUES (?, ?, ?, ?, 1)
  `).run(id, optionId, promptId, `${id} answer`);
}

test('Fixed-N rejects Option activation when canonical whole-Case guarantees would exceed the Case count', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'fixed-activation-case', { mode: 'fixed', count: 1 });
    for (const id of ['fixed-activation-a', 'fixed-activation-b']) insertAsset(sqlite, id);
    insertGroup(sqlite, 'fixed-activation-first', 'fixed-activation-case', 0, { mode: 'minimum', minimum: 1 });
    insertGroup(sqlite, 'fixed-activation-second', 'fixed-activation-case', 1, { mode: 'minimum', minimum: 1 });
    insertOption(sqlite, 'fixed-activation-first-option', 'fixed-activation-first', 'fixed-activation-a', 0);
    insertOption(sqlite, 'fixed-activation-second-option', 'fixed-activation-second', 'fixed-activation-b', 0, false);
    insertPrompt(sqlite, 'fixed-activation-first-prompt', 'First guarantee');
    insertPrompt(sqlite, 'fixed-activation-second-prompt', 'Second guarantee');
    sqlite.prepare(`INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active) VALUES ('fixed-activation-first-question', 'fixed-activation-first', 'fixed-activation-first-prompt', 'A', 1)`).run();
    insertOptionQuestion(sqlite, 'fixed-activation-second-question', 'fixed-activation-second-option', 'fixed-activation-second-prompt');

    await assert.rejects(
      () => setStimulusOptionActive(db, 'fixed-activation-second-option', true),
      /coverage can require at least 2 questions, but the Case is configured for 1/
    );
    assert.equal(sqlite.prepare(`SELECT is_active FROM stimulus_group_options WHERE id = 'fixed-activation-second-option'`).get()?.is_active, 0);
  } finally {
    sqlite.close();
  }
});

test('Production movement allows a retained Prompt to become a duplicate source only inside the target Family', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'move-same-family-case');
    for (const id of ['move-same-family-a', 'move-same-family-b']) insertAsset(sqlite, id);
    insertGroup(sqlite, 'move-same-family-source', 'move-same-family-case', 0);
    insertGroup(sqlite, 'move-same-family-target', 'move-same-family-case', 1);
    insertOption(sqlite, 'move-same-family-moving', 'move-same-family-source', 'move-same-family-a', 0);
    insertOption(sqlite, 'move-same-family-existing', 'move-same-family-target', 'move-same-family-b', 0);
    insertPrompt(sqlite, 'move-same-family-prompt', 'Duplicate after movement');
    insertOptionQuestion(sqlite, 'move-same-family-moving-question', 'move-same-family-moving', 'move-same-family-prompt');
    insertOptionQuestion(sqlite, 'move-same-family-existing-question', 'move-same-family-existing', 'move-same-family-prompt');

    const moved = await moveStimulusOptionWithinCase(db, {
      caseId: 'move-same-family-case',
      optionId: 'move-same-family-moving',
      targetGroupId: 'move-same-family-target',
      previewSessionId: null
    });
    assert.equal(moved.optionId, 'move-same-family-moving');
    assert.equal(sqlite.prepare(`SELECT stimulus_group_id FROM stimulus_group_options WHERE id = 'move-same-family-moving'`).get()?.stimulus_group_id, 'move-same-family-target');
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM stimulus_option_questions soq JOIN stimulus_group_options sgo ON sgo.id = soq.stimulus_group_option_id WHERE sgo.stimulus_group_id = 'move-same-family-target' AND soq.question_prompt_id = 'move-same-family-prompt' AND soq.is_active = 1`).get()?.count, 2);
  } finally {
    sqlite.close();
  }
});

test('Production movement rejects a retained Prompt when a third active Family would still own it', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'move-third-family-case');
    for (const id of ['move-third-a', 'move-third-b', 'move-third-c']) insertAsset(sqlite, id);
    insertGroup(sqlite, 'move-third-source', 'move-third-family-case', 0);
    insertGroup(sqlite, 'move-third-target', 'move-third-family-case', 1);
    insertGroup(sqlite, 'move-third-owner', 'move-third-family-case', 2);
    insertOption(sqlite, 'move-third-moving', 'move-third-source', 'move-third-a', 0);
    insertOption(sqlite, 'move-third-target-option', 'move-third-target', 'move-third-b', 0);
    insertOption(sqlite, 'move-third-owner-option', 'move-third-owner', 'move-third-c', 0);
    insertPrompt(sqlite, 'move-third-prompt', 'Third family conflict');
    insertOptionQuestion(sqlite, 'move-third-moving-question', 'move-third-moving', 'move-third-prompt');
    insertOptionQuestion(sqlite, 'move-third-owner-question', 'move-third-owner-option', 'move-third-prompt');

    await assert.rejects(
      () => moveStimulusOptionWithinCase(db, {
        caseId: 'move-third-family-case',
        optionId: 'move-third-moving',
        targetGroupId: 'move-third-target',
        previewSessionId: null
      }),
      /same Question Prompt cannot be independently attached to multiple active Stimulus Groups/
    );
    assert.equal(sqlite.prepare(`SELECT stimulus_group_id FROM stimulus_group_options WHERE id = 'move-third-moving'`).get()?.stimulus_group_id, 'move-third-source');
  } finally {
    sqlite.close();
  }
});

test('Production movement rejects a post-move Fixed-N coverage total that exceeds the Case count', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'move-fixed-case', { mode: 'fixed', count: 1 });
    for (const id of ['move-fixed-a', 'move-fixed-b', 'move-fixed-c']) insertAsset(sqlite, id);
    insertGroup(sqlite, 'move-fixed-source', 'move-fixed-case', 0);
    insertGroup(sqlite, 'move-fixed-target', 'move-fixed-case', 1, { mode: 'minimum', minimum: 1 });
    insertGroup(sqlite, 'move-fixed-existing', 'move-fixed-case', 2, { mode: 'minimum', minimum: 1 });
    insertOption(sqlite, 'move-fixed-moving', 'move-fixed-source', 'move-fixed-a', 0);
    insertOption(sqlite, 'move-fixed-target-option', 'move-fixed-target', 'move-fixed-b', 0, false);
    insertOption(sqlite, 'move-fixed-existing-option', 'move-fixed-existing', 'move-fixed-c', 0);
    insertPrompt(sqlite, 'move-fixed-moving-prompt', 'Moving guarantee');
    insertPrompt(sqlite, 'move-fixed-existing-prompt', 'Existing guarantee');
    insertOptionQuestion(sqlite, 'move-fixed-moving-question', 'move-fixed-moving', 'move-fixed-moving-prompt');
    insertOptionQuestion(sqlite, 'move-fixed-existing-question', 'move-fixed-existing-option', 'move-fixed-existing-prompt');

    await assert.rejects(
      () => moveStimulusOptionWithinCase(db, {
        caseId: 'move-fixed-case',
        optionId: 'move-fixed-moving',
        targetGroupId: 'move-fixed-target',
        previewSessionId: null
      }),
      /require at least 2 stimulus-specific questions, but the Case is configured for 1/
    );
    assert.equal(sqlite.prepare(`SELECT stimulus_group_id FROM stimulus_group_options WHERE id = 'move-fixed-moving'`).get()?.stimulus_group_id, 'move-fixed-source');
  } finally {
    sqlite.close();
  }
});

test('moving an existing Case question to a fixed image assigns the preserved Option as Original', async () => {
  const { sqlite, db } = fixture();
  try {
    const promptId = await saveCaseQuestion(db, {
      caseId: 'seed-anterior-a',
      promptMd: 'Checkpoint A move-to-fixed prompt',
      answerMd: 'Preserved Case answer'
    });
    await moveCaseQuestionToStimulusTarget(db, {
      caseId: 'seed-anterior-a',
      promptId,
      target: 'fixed:seed-asset-anterior-a'
    });

    const row = sqlite.prepare(`
      SELECT sg.original_option_id AS originalOptionId,
             sgo.id AS optionId,
             soq.answer_md AS answerMd,
             cq.is_active AS caseQuestionActive
      FROM stimulus_groups sg
      JOIN stimulus_group_options sgo ON sgo.stimulus_group_id = sg.id
      JOIN stimulus_option_questions soq ON soq.stimulus_group_option_id = sgo.id AND soq.question_prompt_id = ?
      JOIN case_questions cq ON cq.case_id = sg.case_id AND cq.question_prompt_id = ?
      WHERE sg.case_id = 'seed-anterior-a' AND sgo.asset_id = 'seed-asset-anterior-a'
    `).get(promptId, promptId);
    assert.ok(row);
    assert.equal(row.originalOptionId, row.optionId);
    assert.equal(row.answerMd, 'Preserved Case answer');
    assert.equal(row.caseQuestionActive, 0);
  } finally {
    sqlite.close();
  }
});
