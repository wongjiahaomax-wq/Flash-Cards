import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { listCaseQuestions, saveCaseQuestion } from '../src/lib/server/db/case-questions.js';
import { moveCaseQuestionToStimulusTarget, saveQuestionAtScope } from '../src/lib/server/db/question-scope.js';
import { addStimulusOption, convertCaseAssetToStimulusOption, createStimulusGroup, getAdminStimulusData, saveStimulusOptionQuestion } from '../src/lib/server/db/stimulus-groups.js';
import { buildSeedSql } from '../scripts/seed-content.mjs';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

const migrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0005_tag_foundation.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0007_image_collections.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0008_tag_shared_questions.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0009_reusable_image_questions.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0010_reusable_image_reactivation_guard.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0011_asset_supersession.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0012_archive_stimulus_options.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0013_review_assets_asset_lookup.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0014_review_question_pool_mode.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0015_contextual_system_topic_tag_navigation.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0016_original_stimulus_options.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
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
              return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
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
  return { db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))), sqlite };
}

test('creates a stimulus-specific question directly against an existing option', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'ECG alternatives', specificQuestionMode: 'none' });
    const optionId = await convertCaseAssetToStimulusOption(fixture.db, groupId, 'seed-asset-anterior-a');
    const promptId = await saveQuestionAtScope(fixture.db, {
      caseId: 'seed-anterior-a', scope: 'stimulus', target: `option:${optionId}`,
      promptMd: 'What exact ECG finding is present?', answerMd: 'Anterior ST elevation.'
    });
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT question_prompt_id AS promptId, answer_md AS answerMd, is_active AS isActive FROM stimulus_option_questions WHERE stimulus_group_option_id = ?').all(optionId).map((row) => ({ ...row })),
      [{ promptId, answerMd: 'Anterior ST elevation.', isActive: 1 }]
    );
  } finally { fixture.sqlite.close(); }
});

test('creating against a fixed image atomically creates a one-option group and preserves asset and caption', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.prepare('UPDATE case_assets SET caption_md = ? WHERE case_id = ? AND asset_id = ?').run('Case-specific ECG caption', 'seed-anterior-a', 'seed-asset-anterior-a');
    const promptId = await saveQuestionAtScope(fixture.db, {
      caseId: 'seed-anterior-a', scope: 'stimulus', target: 'fixed:seed-asset-anterior-a',
      promptMd: 'What are the ECG changes?', answerMd: 'Widespread concave ST elevation with PR depression.'
    });
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM case_assets WHERE case_id = ? AND asset_id = ?').get('seed-anterior-a', 'seed-asset-anterior-a')?.count, 0);
    const option = fixture.sqlite.prepare(`SELECT sgo.id, sgo.asset_id AS assetId, sgo.caption_md AS captionMd, sg.selection_count AS selectionCount, sg.is_active AS groupActive, sgo.is_active AS optionActive
      FROM stimulus_group_options sgo JOIN stimulus_groups sg ON sg.id = sgo.stimulus_group_id
      WHERE sg.case_id = ? AND sgo.asset_id = ?`).get('seed-anterior-a', 'seed-asset-anterior-a');
    assert.ok(option);
    assert.deepEqual({ ...option }, { id: option.id, assetId: 'seed-asset-anterior-a', captionMd: 'Case-specific ECG caption', selectionCount: 1, groupActive: 1, optionActive: 1 });
    assert.equal(fixture.sqlite.prepare('SELECT answer_md AS answerMd FROM stimulus_option_questions WHERE stimulus_group_option_id = ? AND question_prompt_id = ?').get(option.id, promptId)?.answerMd, 'Widespread concave ST elevation with PR depression.');
  } finally { fixture.sqlite.close(); }
});

test('moving a Case question to a fixed image preserves prompt and answer and removes it from Case-wide loader', async () => {
  const fixture = createLearningDb();
  try {
    const promptId = await saveCaseQuestion(fixture.db, {
      caseId: 'seed-anterior-a', promptMd: 'What are the ECG changes?',
      answerMd: 'Widespread concave ST elevation with PR depression.', reusableForTopic: true
    });
    await moveCaseQuestionToStimulusTarget(fixture.db, { caseId: 'seed-anterior-a', promptId, target: 'fixed:seed-asset-anterior-a' });
    assert.equal((await listCaseQuestions(fixture.db, 'seed-anterior-a')).some((question) => question.questionPromptId === promptId), false);
    const row = fixture.sqlite.prepare(`SELECT soq.question_prompt_id AS promptId, soq.answer_md AS answerMd
      FROM stimulus_option_questions soq JOIN stimulus_group_options sgo ON sgo.id = soq.stimulus_group_option_id JOIN stimulus_groups sg ON sg.id = sgo.stimulus_group_id
      WHERE sg.case_id = ? AND sgo.asset_id = ? AND soq.is_active = 1`).get('seed-anterior-a', 'seed-asset-anterior-a');
    assert.deepEqual({ ...row }, { promptId, answerMd: 'Widespread concave ST elevation with PR depression.' });
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM concept_questions WHERE concept_id = ? AND question_prompt_id = ?').get('seed-anterior-stemi', promptId)?.count, 0);
  } finally { fixture.sqlite.close(); }
});

test('failed fixed-image assignment cannot leave the fixed relationship converted', async () => {
  const fixture = createLearningDb();
  try {
    const originalBatch = fixture.db.batch;
    fixture.db.batch = async () => { throw new Error('simulated D1 batch failure'); };
    await assert.rejects(
      saveQuestionAtScope(fixture.db, {
        caseId: 'seed-anterior-a', scope: 'stimulus', target: 'fixed:seed-asset-anterior-a',
        promptMd: 'Failure injection question', answerMd: 'Should not be attached.'
      }),
      /simulated D1 batch failure/
    );
    fixture.db.batch = originalBatch;
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM case_assets WHERE case_id = ? AND asset_id = ?').get('seed-anterior-a', 'seed-asset-anterior-a')?.count, 1);
    assert.equal(fixture.sqlite.prepare(`SELECT COUNT(*) AS count FROM stimulus_group_options sgo JOIN stimulus_groups sg ON sg.id = sgo.stimulus_group_id WHERE sg.case_id = ? AND sgo.asset_id = ?`).get('seed-anterior-a', 'seed-asset-anterior-a')?.count, 0);
  } finally { fixture.sqlite.close(); }
});

test('stimulus scope rejects contradictory Topic reuse and preserves cross-group prompt conflict protection', async () => {
  const fixture = createLearningDb();
  try {
    await assert.rejects(
      saveQuestionAtScope(fixture.db, {
        caseId: 'seed-anterior-a', scope: 'stimulus', target: 'fixed:seed-asset-anterior-a',
        promptMd: 'Contradictory question', answerMd: 'Answer', reusableForTopic: true
      }),
      /cannot also be shared with the Topic/
    );
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM case_assets WHERE case_id = ? AND asset_id = ?').get('seed-anterior-a', 'seed-asset-anterior-a')?.count, 1);

    const firstGroup = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'ECG alternatives', specificQuestionMode: 'none' });
    const firstOption = await convertCaseAssetToStimulusOption(fixture.db, firstGroup, 'seed-asset-anterior-a');
    const promptId = await saveStimulusOptionQuestion(fixture.db, firstOption, { promptMd: 'Shared exact wording?', answerMd: 'ECG answer.' });
    const secondGroup = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'X-ray alternatives', specificQuestionMode: 'none' });
    const secondOption = await addStimulusOption(fixture.db, secondGroup, 'seed-asset-anterior-b', 'X-ray');
    await assert.rejects(
      saveQuestionAtScope(fixture.db, { caseId: 'seed-anterior-a', scope: 'stimulus', target: `option:${secondOption}`, promptMd: 'Shared exact wording?', answerMd: 'X-ray answer.' }),
      /same Question Prompt cannot be independently attached to multiple active Stimulus Groups/
    );
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM stimulus_option_questions WHERE stimulus_group_option_id = ? AND question_prompt_id = ?').get(secondOption, promptId)?.count, 0);
  } finally { fixture.sqlite.close(); }
});

test('same prompt can keep different answers on two options in the same set and stimulus data returns each beside its image', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'ECG alternatives', specificQuestionMode: 'none' });
    const optionA = await convertCaseAssetToStimulusOption(fixture.db, groupId, 'seed-asset-anterior-a');
    const optionB = await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b', 'ECG B');
    const promptId = await saveQuestionAtScope(fixture.db, { caseId: 'seed-anterior-a', scope: 'stimulus', target: `option:${optionA}`, promptMd: 'What are the ECG changes?', answerMd: 'Answer A' });
    const reusedPromptId = await saveQuestionAtScope(fixture.db, { caseId: 'seed-anterior-a', scope: 'stimulus', target: `option:${optionB}`, promptMd: 'What are the ECG changes?', answerMd: 'Answer B' });
    assert.equal(reusedPromptId, promptId);
    const data = await getAdminStimulusData(fixture.db, 'seed-anterior-a');
    const group = data.find((entry) => entry.id === groupId);
    assert.ok(group);
    assert.deepEqual(group.optionQuestions.filter((question) => question.isActive).map((question) => [question.stimulusGroupOptionId, question.answerMd]).sort(), [[optionA, 'Answer A'], [optionB, 'Answer B']].sort());
  } finally { fixture.sqlite.close(); }
});