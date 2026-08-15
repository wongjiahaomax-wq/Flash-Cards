import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import { and, eq } from 'drizzle-orm';
import { caseAssets, stimulusGroupOptions, stimulusGroupQuestions, stimulusOptionQuestions } from '../src/lib/server/db/schema.js';
import { updateCase } from '../src/lib/server/db/admin-content.js';
import { getReview, startReview } from '../src/lib/server/db/learning.js';
import { listAssetLibrary } from '../src/lib/server/db/asset-library.js';
import { getQuestionPromptDetail, listQuestionLibrary } from '../src/lib/server/db/question-library.js';
import {
  addStimulusOption,
  convertCaseAssetToStimulusOption,
  createStimulusGroup,
  saveStimulusGroupQuestion,
  saveStimulusOptionQuestion,
  setStimulusOptionActive,
  updateStimulusGroup
} from '../src/lib/server/db/stimulus-groups.js';
import { pickReviewQuestions, resolveQuestionPool } from '../src/lib/server/learning/questions.js';

const migrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8')
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
    async batch(statements) { return Promise.all(statements.map((/** @type {any} */ statement) => statement.run())); }
  };
  return { db: createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1))), sqlite };
}

/** @param {{ db: any, sqlite: DatabaseSync }} fixture */
async function buildGroupedCase(fixture) {
  const groupId = await createStimulusGroup(fixture.db, {
    caseId: 'seed-anterior-a',
    name: 'ECG alternatives',
    specificQuestionMode: 'none'
  });
  await convertCaseAssetToStimulusOption(fixture.db, groupId, 'seed-asset-anterior-a');
  await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b', 'ECG B');
  await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-c', 'ECG C');
  await saveStimulusGroupQuestion(fixture.db, groupId, {
    promptMd: 'What is the diagnosis?',
    answerMd: 'The group-level answer.'
  });
  const optionRows = await fixture.db.select({ id: stimulusGroupOptions.id, assetId: stimulusGroupOptions.assetId }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.stimulusGroupId, groupId));
  await saveStimulusOptionQuestion(fixture.db, optionRows.find((/** @type {{ assetId: string }} */ row) => row.assetId === 'seed-asset-anterior-b')?.id ?? '', {
    promptMd: 'What is the diagnosis?',
    answerMd: 'The option-level answer.'
  });
  await updateStimulusGroup(fixture.db, {
    groupId,
    name: 'ECG alternatives',
    specificQuestionMode: 'minimum',
    minimumSpecificQuestions: 1,
    isActive: true
  });
  return { groupId, optionRows };
}

test('one selected option is frozen with provenance and option precedence', async () => {
  const fixture = createLearningDb();
  try {
    const { optionRows } = await buildGroupedCase(fixture);
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', rng: (() => { const values = [0, 0.5]; return () => values.shift() ?? 0; })() });
    assert.ok(reviewId);
    const review = await getReview(fixture.db, reviewId, 'learner-1');
    assert.ok(review);
    assert.equal(review.assets.length, 1);
    assert.equal(review.assets[0].assetId, optionRows[1].assetId);
    assert.ok(review.assets[0].stimulusGroupId);
    assert.equal(review.assets[0].stimulusOptionId, optionRows[1].id);
    const diagnosis = review.questions.find((question) => question.prompt === 'What is the diagnosis?');
    assert.equal(diagnosis?.answer, 'The option-level answer.');
    assert.equal(diagnosis?.sourceType, 'stimulus_option');
  } finally {
    fixture.sqlite.close();
  }
});

test('inactive options are excluded and historical snapshots survive later changes', async () => {
  const fixture = createLearningDb();
  try {
    const { groupId, optionRows } = await buildGroupedCase(fixture);
    await setStimulusOptionActive(fixture.db, optionRows[0].id, false);
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', rng: () => 0 });
    assert.ok(reviewId);
    await setStimulusOptionActive(fixture.db, optionRows[1].id, false);
    const review = await getReview(fixture.db, reviewId, 'learner-1');
    assert.equal(review?.assets[0].assetId, optionRows[1].assetId);
    assert.equal(groupId.length > 0, true);
  } finally {
    fixture.sqlite.close();
  }
});

test('contextual precedence includes option, group, Case, Study Concept, and ancestor layers', () => {
  const pool = resolveQuestionPool({
    ancestorConceptQuestions: [{ questionPromptId: 'p', promptMd: 'P', answerMd: 'ancestor', inheritToDescendants: true, distance: 1 }],
    studyConceptQuestions: [{ questionPromptId: 'p', promptMd: 'P', answerMd: 'concept' }],
    caseQuestions: [{ questionPromptId: 'p', promptMd: 'P', answerMd: 'case' }],
    stimulusGroupQuestions: [{ questionPromptId: 'p', promptMd: 'P', answerMd: 'group', stimulusGroupId: 'g' }],
    stimulusOptionQuestions: [{ questionPromptId: 'p', promptMd: 'P', answerMd: 'option', stimulusGroupId: 'g', stimulusOptionId: 'o' }]
  });
  assert.equal(pool.length, 1);
  assert.equal(pool[0].answerMd, 'option');
  assert.equal(pool[0].sourceType, 'stimulus_option');
});

test('question modes and independent minimum coverage are deterministic', () => {
  const pool = ['ecg-1', 'ecg-2', 'xray-1', 'general'].map((id) => ({ questionPromptId: id, promptMd: id, answerMd: id, stimulusGroupId: id.startsWith('ecg') ? 'ecg' : id.startsWith('xray') ? 'xray' : null }));
  const selected = pickReviewQuestions(pool, { mode: 'fixed', count: 2, rng: () => 0, groupCoverage: [{ groupId: 'ecg', mode: 'minimum', minimum: 1 }, { groupId: 'xray', mode: 'minimum', minimum: 1 }] });
  assert.deepEqual(new Set(selected.map((question) => question.stimulusGroupId)), new Set(['ecg', 'xray']));
  assert.equal(pickReviewQuestions(pool, { mode: 'all', rng: () => 0 }).length, 4);
  assert.throws(() => pickReviewQuestions(pool, { mode: 'fixed', count: 1, rng: () => 0, groupCoverage: [{ groupId: 'ecg', mode: 'minimum', minimum: 1 }, { groupId: 'xray', mode: 'minimum', minimum: 1 }] }), /cannot fit/);
});

test('fixed Case count rejects all-coverage configurations that can require more questions', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'ECG alternatives', specificQuestionMode: 'none' });
    await convertCaseAssetToStimulusOption(fixture.db, groupId, 'seed-asset-anterior-a');
    for (const [index, prompt] of ['Stimulus finding one?', 'Stimulus finding two?', 'Stimulus finding three?'].entries()) {
      await saveStimulusGroupQuestion(fixture.db, groupId, { promptMd: prompt, answerMd: `Answer ${index + 1}` });
    }
    await updateStimulusGroup(fixture.db, { groupId, name: 'ECG alternatives', specificQuestionMode: 'all', isActive: true });
    await assert.rejects(
      updateCase(fixture.db, {
        caseId: 'seed-anterior-a',
        title: 'Anterior STEMI ECG A',
        conceptId: 'seed-anterior-stemi',
        questionSelectionMode: 'fixed',
        questionCount: 2
      }),
      /needs at least 3 questions/
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('minimum coverage cannot be enabled when an active option lacks enough eligible specific questions', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'ECG alternatives', specificQuestionMode: 'none' });
    await convertCaseAssetToStimulusOption(fixture.db, groupId, 'seed-asset-anterior-a');
    await saveStimulusGroupQuestion(fixture.db, groupId, { promptMd: 'Only one specific question?', answerMd: 'Yes.' });
    await assert.rejects(
      updateStimulusGroup(fixture.db, { groupId, name: 'ECG alternatives', specificQuestionMode: 'minimum', minimumSpecificQuestions: 2, isActive: true }),
      /requires at least 2 specific questions/
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('conversion validation preserves the fixed attachment when the Asset is already a grouped option', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'ECG alternatives', specificQuestionMode: 'none' });
    await fixture.db.insert(stimulusGroupOptions).values({ id: 'duplicate-option', stimulusGroupId: groupId, assetId: 'seed-asset-anterior-a', displayOrder: 0, isActive: true });
    await assert.rejects(convertCaseAssetToStimulusOption(fixture.db, groupId, 'seed-asset-anterior-a'), /already used as a Stimulus Option/);
    const fixed = await fixture.db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(and(eq(caseAssets.caseId, 'seed-anterior-a'), eq(caseAssets.assetId, 'seed-asset-anterior-a')));
    assert.equal(fixed.length, 1);
  } finally {
    fixture.sqlite.close();
  }
});

test('stimulus question edits accept the unchanged prompt id and update the answer', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'ECG alternatives', specificQuestionMode: 'none' });
    await convertCaseAssetToStimulusOption(fixture.db, groupId, 'seed-asset-anterior-a');
    const groupPromptId = await saveStimulusGroupQuestion(fixture.db, groupId, { promptMd: 'Editable group prompt?', answerMd: 'Old group answer.' });
    await saveStimulusGroupQuestion(fixture.db, groupId, { originalPromptId: groupPromptId, promptMd: 'Editable group prompt?', answerMd: 'New group answer.' });

    const option = (await fixture.db.select({ id: stimulusGroupOptions.id }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.stimulusGroupId, groupId)).limit(1))[0];
    const optionPromptId = await saveStimulusOptionQuestion(fixture.db, option.id, { promptMd: 'Editable option prompt?', answerMd: 'Old option answer.' });
    await saveStimulusOptionQuestion(fixture.db, option.id, { originalPromptId: optionPromptId, promptMd: 'Editable option prompt?', answerMd: 'New option answer.' });

    const groupRows = await fixture.db.select({ answerMd: stimulusGroupQuestions.answerMd }).from(stimulusGroupQuestions).where(and(eq(stimulusGroupQuestions.stimulusGroupId, groupId), eq(stimulusGroupQuestions.questionPromptId, groupPromptId)));
    assert.equal(groupRows[0]?.answerMd, 'New group answer.');
    const optionRows = await fixture.db.select({ answerMd: stimulusOptionQuestions.answerMd }).from(stimulusOptionQuestions).where(and(eq(stimulusOptionQuestions.stimulusGroupOptionId, option.id), eq(stimulusOptionQuestions.questionPromptId, optionPromptId)));
    assert.equal(optionRows[0]?.answerMd, 'New option answer.');
  } finally {
    fixture.sqlite.close();
  }
});

test('Question and Image Libraries include grouped usage without double-counting a Case', async () => {
  const fixture = createLearningDb();
  try {
    await buildGroupedCase(fixture);
    const prompt = (await listQuestionLibrary(fixture.db, { search: 'option-level answer' })).find((row) => row.promptMd === 'What is the diagnosis?');
    assert.ok(prompt);
    assert.equal(prompt.stimulusOptionUsageCount, 1);
    const detail = await getQuestionPromptDetail(fixture.db, 'seed-prompt-diagnosis');
    assert.ok(detail);
    assert.equal(detail.stimulusGroupUsages.length, 1);
    assert.equal(detail.stimulusOptionUsages.length, 1);
    const image = (await listAssetLibrary(fixture.db, { topic: 'seed-anterior-stemi', usage: 'used' })).find((row) => row.id === 'seed-asset-anterior-b');
    assert.ok(image);
    assert.equal(image.usageCount, 2);
  } finally {
    fixture.sqlite.close();
  }
});
