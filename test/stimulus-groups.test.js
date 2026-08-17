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
  readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8')
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

test('Stimulus Group conversion, metadata, and specific questions remain visible in Admin libraries', async () => {
  const fixture = createLearningDb();
  try {
    const { groupId, optionRows } = await buildGroupedCase(fixture);
    const fixedRows = await fixture.db.select().from(caseAssets).where(eq(caseAssets.caseId, 'seed-anterior-a'));
    assert.equal(fixedRows.some((row) => row.assetId === 'seed-asset-anterior-a'), false);

    const groupQuestionRows = await fixture.db.select().from(stimulusGroupQuestions).where(eq(stimulusGroupQuestions.stimulusGroupId, groupId));
    assert.equal(groupQuestionRows.length, 1);
    const bOption = optionRows.find((row) => row.assetId === 'seed-asset-anterior-b');
    const optionQuestionRows = await fixture.db.select().from(stimulusOptionQuestions).where(eq(stimulusOptionQuestions.stimulusGroupOptionId, bOption?.id ?? ''));
    assert.equal(optionQuestionRows.length, 1);

    const assets = await listAssetLibrary(fixture.db, { search: '', topicId: '', usage: 'all' });
    const anteriorA = assets.find((asset) => asset.id === 'seed-asset-anterior-a');
    assert.ok(anteriorA);
    assert.equal(anteriorA.usageCount, 1);

    const questions = await listQuestionLibrary(fixture.db, { search: 'diagnosis', topicId: '', scope: 'all' });
    const diagnosis = questions.find((question) => question.promptMd === 'What is the diagnosis?');
    assert.ok(diagnosis);
    assert.ok(diagnosis.usageCount >= 3);
    const detail = await getQuestionPromptDetail(fixture.db, diagnosis.id);
    assert.ok(detail?.usages.some((usage) => usage.scope === 'stimulus_group'));
    assert.ok(detail?.usages.some((usage) => usage.scope === 'stimulus_option'));
  } finally {
    fixture.sqlite.close();
  }
});

test('learner Review snapshots exactly one alternative option and stores contextual question source IDs', async () => {
  const fixture = createLearningDb();
  try {
    const { groupId, optionRows } = await buildGroupedCase(fixture);
    await updateCase(fixture.db, {
      caseId: 'seed-anterior-a',
      title: 'Anterior STEMI — ECG A',
      vignetteMd: 'A patient has acute chest pain.',
      conceptId: 'seed-anterior-stemi',
      questionSelectionMode: 'all'
    });

    const selectedB = optionRows.find((row) => row.assetId === 'seed-asset-anterior-b');
    assert.ok(selectedB);
    const reviewId = await startReview({
      db: fixture.db,
      userId: 'learner-1',
      conceptId: 'seed-anterior-stemi',
      rng: () => 0.34
    });
    assert.ok(reviewId);
    const review = await getReview(fixture.db, reviewId, 'learner-1');
    assert.ok(review);
    const groupedAssets = review.assets.filter((asset) => asset.stimulusGroupId === groupId);
    assert.equal(groupedAssets.length, 1);
    assert.equal(groupedAssets[0].assetId, selectedB.assetId);
    assert.equal(groupedAssets[0].stimulusOptionId, selectedB.id);
    assert.ok(review.questions.some((question) => question.sourceStimulusGroupId === groupId));
    assert.ok(review.questions.some((question) => question.sourceStimulusOptionId === selectedB.id));
  } finally {
    fixture.sqlite.close();
  }
});

test('inactive alternative options are excluded from learner selection', async () => {
  const fixture = createLearningDb();
  try {
    const { groupId, optionRows } = await buildGroupedCase(fixture);
    const first = optionRows[0];
    assert.ok(first);
    await setStimulusOptionActive(fixture.db, first.id, false);
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', rng: () => 0 });
    assert.ok(reviewId);
    const review = await getReview(fixture.db, reviewId, 'learner-1');
    assert.ok(review);
    assert.notEqual(review.assets.find((asset) => asset.stimulusGroupId === groupId)?.assetId, first.assetId);
  } finally {
    fixture.sqlite.close();
  }
});

test('Automatic selection enforces a minimum specific-question constraint after prompt dedupe', () => {
  const pool = resolveQuestionPool({
    caseQuestions: [
      { questionPromptId: 'diagnosis', promptMd: 'Diagnosis?', answerMd: 'Case answer' },
      { questionPromptId: 'management', promptMd: 'Management?', answerMd: 'Manage' }
    ],
    studyConceptQuestions: [],
    ancestorConceptQuestions: [],
    stimulusGroupQuestions: [
      { stimulusGroupId: 'g1', questionPromptId: 'diagnosis', promptMd: 'Diagnosis?', answerMd: 'Group answer' },
      { stimulusGroupId: 'g1', questionPromptId: 'group-specific', promptMd: 'Group?', answerMd: 'Group' }
    ],
    stimulusOptionQuestions: [
      { stimulusGroupId: 'g1', stimulusOptionId: 'o1', questionPromptId: 'diagnosis', promptMd: 'Diagnosis?', answerMd: 'Option answer' },
      { stimulusGroupId: 'g1', stimulusOptionId: 'o1', questionPromptId: 'option-specific', promptMd: 'Option?', answerMd: 'Option' }
    ]
  });
  assert.equal(pool.find((question) => question.questionPromptId === 'diagnosis')?.sourceType, 'stimulus_option');

  const picked = pickReviewQuestions(pool, {
    rng: () => 0.99,
    mode: 'automatic',
    count: 2,
    groupCoverage: [{ groupId: 'g1', mode: 'minimum', minimum: 1 }]
  });
  assert.equal(picked.length, 2);
  assert.ok(picked.some((question) => question.sourceStimulusGroupId === 'g1'));
});

test('All mode returns the full resolved question pool and Fixed respects the configured count', () => {
  const pool = resolveQuestionPool({
    caseQuestions: [
      { questionPromptId: 'q1', promptMd: 'Q1?', answerMd: 'A1' },
      { questionPromptId: 'q2', promptMd: 'Q2?', answerMd: 'A2' },
      { questionPromptId: 'q3', promptMd: 'Q3?', answerMd: 'A3' },
      { questionPromptId: 'q4', promptMd: 'Q4?', answerMd: 'A4' }
    ],
    studyConceptQuestions: [],
    ancestorConceptQuestions: [],
    stimulusGroupQuestions: [],
    stimulusOptionQuestions: []
  });
  assert.equal(pickReviewQuestions(pool, { mode: 'all', count: 2 }).length, 4);
  assert.equal(pickReviewQuestions(pool, { mode: 'fixed', count: 2, rng: () => 0.2 }).length, 2);
});

test('specific-question coverage modes none/minimum/all control pool constraints', () => {
  const pool = resolveQuestionPool({
    caseQuestions: [
      { questionPromptId: 'q1', promptMd: 'Q1?', answerMd: 'A1' },
      { questionPromptId: 'q2', promptMd: 'Q2?', answerMd: 'A2' }
    ],
    studyConceptQuestions: [],
    ancestorConceptQuestions: [],
    stimulusGroupQuestions: [
      { stimulusGroupId: 'g1', questionPromptId: 'gq1', promptMd: 'GQ1?', answerMd: 'GA1' },
      { stimulusGroupId: 'g1', questionPromptId: 'gq2', promptMd: 'GQ2?', answerMd: 'GA2' }
    ],
    stimulusOptionQuestions: []
  });
  assert.equal(pickReviewQuestions(pool, { mode: 'automatic', count: 2, rng: () => 0, groupCoverage: [{ groupId: 'g1', mode: 'none', minimum: 0 }] }).length, 2);
  const minimum = pickReviewQuestions(pool, { mode: 'automatic', count: 2, rng: () => 0.99, groupCoverage: [{ groupId: 'g1', mode: 'minimum', minimum: 2 }] });
  assert.equal(minimum.filter((q) => q.sourceStimulusGroupId === 'g1').length, 2);
  const all = pickReviewQuestions(pool, { mode: 'automatic', count: 2, rng: () => 0.99, groupCoverage: [{ groupId: 'g1', mode: 'all', minimum: 0 }] });
  assert.ok(all.filter((q) => q.sourceStimulusGroupId === 'g1').length >= 2);
});
