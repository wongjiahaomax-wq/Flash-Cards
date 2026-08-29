import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import {
  createAssetQuestion,
  optInFixedAssetQuestion
} from '../src/lib/server/db/asset-questions.js';
import { moveStimulusOptionWithinCase } from '../src/lib/server/db/image-option-move.js';
import { createDb } from '../src/lib/server/db/index.js';
import { saveQuestionAtScope } from '../src/lib/server/db/question-scope.js';
import {
  addStimulusOption,
  createStimulusGroup,
  ensurePromptIsNotUsedByAnotherGroup,
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

/** @param {DatabaseSync} sqlite @param {string} id @param {boolean} [active] */
function insertAsset(sqlite, id, active = true) {
  sqlite.prepare(`
    INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active)
    VALUES (?, 'image', ?, 'image/png', ?, ?, ?)
  `).run(id, `${id}.png`, `${id}.png`, `${id} alt`, active ? 1 : 0);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} caseId @param {number} order @param {{ active?: boolean, mode?: string, minimum?: number | null }} [options] */
function insertGroup(sqlite, id, caseId, order, options = {}) {
  sqlite.prepare(`
    INSERT INTO stimulus_groups
      (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, caseId, id, order, options.mode ?? 'none', options.minimum ?? null, options.active === false ? 0 : 1);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} groupId @param {string} assetId @param {number} order @param {{ active?: boolean, removed?: boolean, caption?: string | null }} [options] */
function insertOption(sqlite, id, groupId, assetId, order, options = {}) {
  sqlite.prepare(`
    INSERT INTO stimulus_group_options
      (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, groupId, assetId, order, options.caption ?? null, options.active === false ? 0 : 1, options.removed ? 1 : 0);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} wording */
function insertPrompt(sqlite, id, wording) {
  sqlite.prepare(`
    INSERT INTO question_prompts (id, prompt_md, is_active)
    VALUES (?, ?, 1)
  `).run(id, wording);
}

test('inactive Families, inactive Options and removed Options are dormant Prompt owners', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'dormant-case');
    for (const id of ['dormant-a', 'dormant-b', 'dormant-c']) insertAsset(sqlite, id);
    insertGroup(sqlite, 'dormant-target', 'dormant-case', 0);
    insertGroup(sqlite, 'dormant-family', 'dormant-case', 1, { active: false });
    insertGroup(sqlite, 'dormant-other', 'dormant-case', 2);
    insertOption(sqlite, 'dormant-family-option', 'dormant-family', 'dormant-a', 0);
    insertOption(sqlite, 'dormant-inactive-option', 'dormant-other', 'dormant-b', 0, { active: false });
    insertOption(sqlite, 'dormant-removed-option', 'dormant-other', 'dormant-c', 1, { active: false, removed: true });

    for (const [id, wording] of [
      ['dormant-family-prompt', 'Dormant family prompt'],
      ['dormant-option-prompt', 'Dormant option prompt'],
      ['dormant-removed-prompt', 'Dormant removed prompt']
    ]) insertPrompt(sqlite, id, wording);
    sqlite.prepare(`INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active) VALUES ('dormant-family-question', 'dormant-family', 'dormant-family-prompt', 'A', 1)`).run();
    sqlite.prepare(`INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active) VALUES ('dormant-option-question', 'dormant-inactive-option', 'dormant-option-prompt', 'B', 1)`).run();
    sqlite.prepare(`INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active) VALUES ('dormant-removed-question', 'dormant-removed-option', 'dormant-removed-prompt', 'C', 1)`).run();

    await ensurePromptIsNotUsedByAnotherGroup(db, 'dormant-case', 'dormant-family-prompt', 'dormant-target');
    await ensurePromptIsNotUsedByAnotherGroup(db, 'dormant-case', 'dormant-option-prompt', 'dormant-target');
    await ensurePromptIsNotUsedByAnotherGroup(db, 'dormant-case', 'dormant-removed-prompt', 'dormant-target');
  } finally {
    sqlite.close();
  }
});

test('Option activation validates reusable coverage and live cross-Family Prompt ownership only when it becomes selectable', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'reactivation-case', { mode: 'fixed', count: 2 });
    for (const id of ['reactivation-a', 'reactivation-b', 'reactivation-c']) insertAsset(sqlite, id);
    insertGroup(sqlite, 'reactivation-source', 'reactivation-case', 0);
    insertGroup(sqlite, 'reactivation-minimum', 'reactivation-case', 1, { mode: 'minimum', minimum: 1 });
    insertGroup(sqlite, 'reactivation-dormant-family', 'reactivation-case', 2, { active: false });
    insertOption(sqlite, 'reactivation-source-option', 'reactivation-source', 'reactivation-a', 0);
    insertOption(sqlite, 'reactivation-minimum-option', 'reactivation-minimum', 'reactivation-b', 0, { active: false });
    insertOption(sqlite, 'reactivation-dormant-option', 'reactivation-dormant-family', 'reactivation-c', 0, { active: false });

    insertPrompt(sqlite, 'reactivation-reusable-prompt', 'Reusable coverage on reactivation');
    sqlite.prepare(`INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active) VALUES ('reactivation-aq', 'reactivation-b', 'reactivation-reusable-prompt', 'Reusable answer', 1)`).run();
    sqlite.prepare(`INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id) VALUES ('reactivation-minimum-option', 'reactivation-aq')`).run();

    await setStimulusOptionActive(db, 'reactivation-minimum-option', true);
    assert.equal(sqlite.prepare(`SELECT is_active FROM stimulus_group_options WHERE id = 'reactivation-minimum-option'`).get()?.is_active, 1);

    sqlite.prepare(`UPDATE assets SET is_active = 0 WHERE id = 'reactivation-c'`).run();
    await setStimulusOptionActive(db, 'reactivation-dormant-option', true);
    assert.equal(sqlite.prepare(`SELECT is_active FROM stimulus_group_options WHERE id = 'reactivation-dormant-option'`).get()?.is_active, 1);
    await assert.rejects(
      () => updateStimulusGroup(db, {
        groupId: 'reactivation-dormant-family',
        name: 'Dormant becomes live',
        specificQuestionMode: 'none',
        isActive: true
      }),
      /Asset|image|eligible|inactive/i
    );
  } finally {
    sqlite.close();
  }
});

test('Option and Family activation reject dormant Prompt conflicts before making them live', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'activation-conflict-case');
    for (const id of ['activation-a', 'activation-b', 'activation-c']) insertAsset(sqlite, id);
    insertGroup(sqlite, 'activation-owner', 'activation-conflict-case', 0);
    insertGroup(sqlite, 'activation-option-family', 'activation-conflict-case', 1);
    insertGroup(sqlite, 'activation-family', 'activation-conflict-case', 2, { active: false });
    insertOption(sqlite, 'activation-owner-option', 'activation-owner', 'activation-a', 0);
    insertOption(sqlite, 'activation-dormant-option', 'activation-option-family', 'activation-b', 0, { active: false });
    insertOption(sqlite, 'activation-family-option', 'activation-family', 'activation-c', 0);
    insertPrompt(sqlite, 'activation-shared-prompt', 'Prompt conflict on activation');
    sqlite.prepare(`INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active) VALUES ('activation-owner-question', 'activation-owner', 'activation-shared-prompt', 'Owner', 1)`).run();
    sqlite.prepare(`INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active) VALUES ('activation-option-question', 'activation-dormant-option', 'activation-shared-prompt', 'Option', 1)`).run();
    sqlite.prepare(`INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active) VALUES ('activation-family-question', 'activation-family-option', 'activation-shared-prompt', 'Family', 1)`).run();

    await assert.rejects(
      () => setStimulusOptionActive(db, 'activation-dormant-option', true),
      /Question Prompt|stimulus-specific|Stimulus Group/i
    );
    assert.equal(sqlite.prepare(`SELECT is_active FROM stimulus_group_options WHERE id = 'activation-dormant-option'`).get()?.is_active, 0);

    await assert.rejects(
      () => updateStimulusGroup(db, {
        groupId: 'activation-family',
        name: 'Activation family',
        specificQuestionMode: 'none',
        isActive: true
      }),
      /Question Prompt|stimulus-specific|Stimulus Group/i
    );
    assert.equal(sqlite.prepare(`SELECT is_active FROM stimulus_groups WHERE id = 'activation-family'`).get()?.is_active, 0);
  } finally {
    sqlite.close();
  }
});

test('same-Case Production movement validates retained Prompt ownership in the post-move graph', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'move-specificity-case');
    for (const id of ['move-specificity-a', 'move-specificity-b']) insertAsset(sqlite, id);
    insertGroup(sqlite, 'move-specificity-source', 'move-specificity-case', 0);
    insertGroup(sqlite, 'move-specificity-target', 'move-specificity-case', 1);
    insertOption(sqlite, 'move-specificity-option', 'move-specificity-source', 'move-specificity-a', 0);
    insertOption(sqlite, 'move-specificity-target-option', 'move-specificity-target', 'move-specificity-b', 0);
    insertPrompt(sqlite, 'move-specificity-prompt', 'Retained move prompt');
    sqlite.prepare(`INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active) VALUES ('move-specificity-group-question', 'move-specificity-source', 'move-specificity-prompt', 'Source family', 1)`).run();
    sqlite.prepare(`INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active) VALUES ('move-specificity-option-question', 'move-specificity-option', 'move-specificity-prompt', 'Moving option', 1)`).run();

    await assert.rejects(
      () => moveStimulusOptionWithinCase(db, {
        caseId: 'move-specificity-case',
        optionId: 'move-specificity-option',
        targetGroupId: 'move-specificity-target',
        previewSessionId: null
      }),
      /Question Prompt|stimulus-specific|independently selectable/i
    );
    assert.equal(sqlite.prepare(`SELECT stimulus_group_id FROM stimulus_group_options WHERE id = 'move-specificity-option'`).get()?.stimulus_group_id, 'move-specificity-source');
  } finally {
    sqlite.close();
  }
});

test('same-Case Production movement uses reusable Asset Questions in canonical coverage and preserves the opt-in identity', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'move-coverage-case', { mode: 'fixed', count: 1 });
    insertAsset(sqlite, 'move-coverage-asset');
    insertGroup(sqlite, 'move-coverage-source', 'move-coverage-case', 0);
    insertGroup(sqlite, 'move-coverage-target', 'move-coverage-case', 1, { mode: 'minimum', minimum: 1 });
    insertOption(sqlite, 'move-coverage-option', 'move-coverage-source', 'move-coverage-asset', 0, { caption: 'Retained caption' });
    insertPrompt(sqlite, 'move-coverage-prompt', 'Reusable move coverage prompt');
    sqlite.prepare(`INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active) VALUES ('move-coverage-aq', 'move-coverage-asset', 'move-coverage-prompt', 'Reusable answer', 1)`).run();
    sqlite.prepare(`INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id) VALUES ('move-coverage-option', 'move-coverage-aq')`).run();

    const moved = await moveStimulusOptionWithinCase(db, {
      caseId: 'move-coverage-case',
      optionId: 'move-coverage-option',
      targetGroupId: 'move-coverage-target',
      previewSessionId: null
    });
    assert.equal(moved.optionId, 'move-coverage-option');
    const option = sqlite.prepare(`SELECT id, stimulus_group_id, asset_id, caption_md FROM stimulus_group_options WHERE id = 'move-coverage-option'`).get();
    assert.deepEqual({ ...option }, {
      id: 'move-coverage-option',
      stimulus_group_id: 'move-coverage-target',
      asset_id: 'move-coverage-asset',
      caption_md: 'Retained caption'
    });
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM stimulus_option_asset_questions WHERE stimulus_group_option_id = 'move-coverage-option' AND asset_question_id = 'move-coverage-aq'`).get()?.count, 1);
  } finally {
    sqlite.close();
  }
});

test('source-aware exact fixed-image conversion assigns the preserved Option as Original atomically', async () => {
  const { sqlite, db } = fixture();
  try {
    await saveQuestionAtScope(db, {
      caseId: 'seed-anterior-a',
      scope: 'stimulus',
      target: 'fixed:seed-asset-anterior-a',
      promptMd: 'Checkpoint A source-aware exact prompt',
      answerMd: 'Exact answer'
    });
    const row = sqlite.prepare(`
      SELECT sg.original_option_id AS originalOptionId, sgo.id AS optionId
      FROM stimulus_groups sg
      JOIN stimulus_group_options sgo ON sgo.stimulus_group_id = sg.id
      WHERE sg.case_id = 'seed-anterior-a' AND sgo.asset_id = 'seed-asset-anterior-a'
    `).get();
    assert.ok(row);
    assert.equal(row.originalOptionId, row.optionId);
  } finally {
    sqlite.close();
  }
});

test('source-aware reusable fixed-image conversion assigns Original while generic insertion remains unassigned', async () => {
  const { sqlite, db } = fixture();
  try {
    const assetQuestionId = await createAssetQuestion(db, {
      assetId: 'seed-asset-anterior-a',
      promptMd: 'Checkpoint A reusable fixed prompt',
      answerMd: 'Reusable answer'
    });
    const optionId = await optInFixedAssetQuestion(db, {
      caseId: 'seed-anterior-a',
      assetId: 'seed-asset-anterior-a',
      assetQuestionId
    });
    const sourceAware = sqlite.prepare(`
      SELECT sg.original_option_id AS originalOptionId
      FROM stimulus_groups sg
      JOIN stimulus_group_options sgo ON sgo.stimulus_group_id = sg.id
      WHERE sgo.id = ?
    `).get(optionId);
    assert.equal(sourceAware?.originalOptionId, optionId);

    insertAsset(sqlite, 'generic-option-asset');
    const genericGroupId = await createStimulusGroup(db, {
      caseId: 'seed-anterior-a',
      name: 'Generic insertion remains unassigned',
      specificQuestionMode: 'none'
    });
    await addStimulusOption(db, genericGroupId, 'generic-option-asset');
    assert.equal(sqlite.prepare(`SELECT original_option_id FROM stimulus_groups WHERE id = ?`).get(genericGroupId)?.original_option_id, null);
  } finally {
    sqlite.close();
  }
});
