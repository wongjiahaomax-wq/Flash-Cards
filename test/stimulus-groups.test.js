import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import { and, eq } from 'drizzle-orm';
import { createAssetQuestion, optInAssetQuestion } from '../src/lib/server/db/asset-questions.js';
import { assets, caseAssets, stimulusGroupOptions, stimulusGroupQuestions, stimulusOptionAssetQuestions, stimulusOptionQuestions } from '../src/lib/server/db/schema.js';
import { updateCase } from '../src/lib/server/db/admin-content.js';
import { getReview, startReview } from '../src/lib/server/db/learning.js';
import { listAssetLibrary } from '../src/lib/server/db/asset-library.js';
import { getQuestionPromptDetail, listQuestionLibrary } from '../src/lib/server/db/question-library.js';
import {
  addStimulusOption,
  convertCaseAssetToStimulusOption,
  createStimulusGroup,
  getAdminStimulusData,
  getCaseStimulusCoverageRequirement,
  removeStimulusOptionFromCase,
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
  readFileSync(new URL('../drizzle/0005_tag_foundation.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0007_image_collections.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0008_tag_shared_questions.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0009_reusable_image_questions.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0011_asset_supersession.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0012_archive_stimulus_options.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0013_review_assets_asset_lookup.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0014_review_question_pool_mode.sql', import.meta.url), 'utf8'),
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
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', questionPoolMode: 'expanded', rng: (() => { const values = [0, 0.5]; return () => values.shift() ?? 0; })() });
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
    const deactivatedRow = fixture.sqlite.prepare('SELECT is_active FROM stimulus_group_options WHERE id = ?').get(optionRows[0].id);
    assert.ok(deactivatedRow);
    assert.equal(deactivatedRow.is_active, 0);
    const admin = await getAdminStimulusData(fixture.db, 'seed-anterior-a');
    const deactivated = admin.flatMap((group) => group.options).find((option) => option.id === optionRows[0].id);
    assert.ok(deactivated);
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', questionPoolMode: 'expanded', rng: () => 0 });
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
    const image = (await listAssetLibrary(fixture.db, { topic: 'seed-anterior-stemi', usage: 'current' })).find((row) => row.id === 'seed-asset-anterior-b');
    assert.ok(image);
    assert.equal(image.usageCount, 2);
  } finally {
    fixture.sqlite.close();
  }
});

test('Remove from Case archives the option relationship without deleting Asset or historical provenance', async () => {
  const fixture = createLearningDb();
  try {
    const { groupId, optionRows } = await buildGroupedCase(fixture);
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-archive', conceptId: 'seed-anterior-stemi', questionPoolMode: 'expanded', rng: () => 0 });
    assert.ok(reviewId);
    const reviewBeforeRemoval = await getReview(fixture.db, reviewId, 'learner-archive');
    const optionId = reviewBeforeRemoval?.assets[0]?.stimulusOptionId;
    assert.ok(optionId);
    const option = optionRows.find((/** @type {{ id: string, assetId: string }} */ row) => row.id === optionId);
    assert.ok(option);
    await saveStimulusOptionQuestion(fixture.db, optionId, { promptMd: 'Removed image question?', answerMd: 'Retained historical answer.' });
    const usageBeforeRemoval = (await listAssetLibrary(fixture.db, { status: 'active' })).find((row) => row.id === option.assetId);
    assert.ok(usageBeforeRemoval);

    await removeStimulusOptionFromCase(fixture.db, optionId);

    const archived = (await fixture.db.select({ isActive: stimulusGroupOptions.isActive, removedFromCase: stimulusGroupOptions.removedFromCase }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.id, optionId)))[0];
    assert.deepEqual(archived, { isActive: false, removedFromCase: true });
    const asset = (await fixture.db.select({ isActive: assets.isActive }).from(assets).where(eq(assets.id, option.assetId)))[0];
    assert.equal(asset?.isActive, true);

    const admin = await getAdminStimulusData(fixture.db, 'seed-anterior-a');
    assert.equal(admin.flatMap((group) => group.options).some((option) => option.id === optionId), false);
    const usageAfterRemoval = (await listAssetLibrary(fixture.db, { status: 'active' })).find((row) => row.id === option.assetId);
    assert.equal(usageAfterRemoval?.isActive, true);
    assert.equal(usageAfterRemoval?.usageCount, (usageBeforeRemoval.usageCount ?? 0) - 1);

    const historical = await getReview(fixture.db, reviewId, 'learner-archive');
    assert.equal(historical?.assets.some((assetRow) => assetRow.stimulusOptionId === optionId), true);
    assert.equal((await fixture.db.select({ count: stimulusOptionQuestions.id }).from(stimulusOptionQuestions).where(eq(stimulusOptionQuestions.stimulusGroupOptionId, optionId))).length, 1);
    const newReviewId = await startReview({ db: fixture.db, userId: 'learner-after-archive', conceptId: 'seed-anterior-stemi', questionPoolMode: 'expanded', rng: () => 0 });
    assert.ok(newReviewId);
    const newReview = await getReview(fixture.db, newReviewId, 'learner-after-archive');
    assert.equal(newReview?.assets.some((assetRow) => assetRow.stimulusOptionId === optionId), false);
  } finally {
    fixture.sqlite.close();
  }
});

test('archived restoration uses retained option questions for minimum coverage', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Minimum restoration set', specificQuestionMode: 'none' });
    const optionId = await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b');
    await saveStimulusOptionQuestion(fixture.db, optionId, { promptMd: 'Retained minimum question?', answerMd: 'Yes.' });
    await updateStimulusGroup(fixture.db, { groupId, name: 'Minimum restoration set', specificQuestionMode: 'minimum', minimumSpecificQuestions: 1, isActive: true });
    await removeStimulusOptionFromCase(fixture.db, optionId);
    assert.equal(await getCaseStimulusCoverageRequirement(fixture.db, 'seed-anterior-a'), 0);
    assert.equal(await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b'), optionId);
    assert.equal(await getCaseStimulusCoverageRequirement(fixture.db, 'seed-anterior-a'), 1);
  } finally {
    fixture.sqlite.close();
  }
});

test('archived restoration revalidates all coverage against a changed fixed Case count', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'All restoration set', specificQuestionMode: 'none' });
    const retainedOptionId = await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b');
    const otherOptionId = await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-c');
    await saveStimulusOptionQuestion(fixture.db, retainedOptionId, { promptMd: 'Retained all question one?', answerMd: 'One.' });
    await saveStimulusOptionQuestion(fixture.db, retainedOptionId, { promptMd: 'Retained all question two?', answerMd: 'Two.' });
    await saveStimulusOptionQuestion(fixture.db, otherOptionId, { promptMd: 'Other all question?', answerMd: 'Other.' });
    await updateStimulusGroup(fixture.db, { groupId, name: 'All restoration set', specificQuestionMode: 'all', isActive: true });
    await updateCase(fixture.db, { caseId: 'seed-anterior-a', title: 'Anterior STEMI ECG A', questionSelectionMode: 'fixed', questionCount: 2 });
    assert.equal(await getCaseStimulusCoverageRequirement(fixture.db, 'seed-anterior-a'), 2);

    await removeStimulusOptionFromCase(fixture.db, retainedOptionId);
    assert.equal(await getCaseStimulusCoverageRequirement(fixture.db, 'seed-anterior-a'), 1);
    await updateCase(fixture.db, { caseId: 'seed-anterior-a', title: 'Anterior STEMI ECG A', questionSelectionMode: 'fixed', questionCount: 1 });
    await assert.rejects(() => addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b'), /can require at least 2 questions/);
    const stillArchived = (await fixture.db.select({ isActive: stimulusGroupOptions.isActive, removedFromCase: stimulusGroupOptions.removedFromCase }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.id, retainedOptionId)))[0];
    assert.deepEqual(stillArchived, { isActive: false, removedFromCase: true });

    await updateCase(fixture.db, { caseId: 'seed-anterior-a', title: 'Anterior STEMI ECG A', questionSelectionMode: 'fixed', questionCount: 2 });
    assert.equal(await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b'), retainedOptionId);
  } finally {
    fixture.sqlite.close();
  }
});

test('archived restoration rejects retained specific and reusable prompts that became current elsewhere', async () => {
  const fixture = createLearningDb();
  try {
    const firstGroup = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'First restoration set', specificQuestionMode: 'none' });
    const secondGroup = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Second restoration set', specificQuestionMode: 'none' });
    const firstOption = await addStimulusOption(fixture.db, firstGroup, 'seed-asset-anterior-b');
    const secondOption = await addStimulusOption(fixture.db, secondGroup, 'seed-asset-anterior-c');
    await saveStimulusOptionQuestion(fixture.db, firstOption, { promptMd: 'Shared retained prompt?', answerMd: 'First.' });
    const reusableFirst = await createAssetQuestion(fixture.db, { assetId: 'seed-asset-anterior-b', promptMd: 'Shared reusable prompt?', answerMd: 'Reusable first.' });
    await optInAssetQuestion(fixture.db, { caseId: 'seed-anterior-a', optionId: firstOption, assetQuestionId: reusableFirst });
    await removeStimulusOptionFromCase(fixture.db, firstOption);
    await saveStimulusOptionQuestion(fixture.db, secondOption, { promptMd: 'Shared retained prompt?', answerMd: 'Second.' });
    await assert.rejects(() => addStimulusOption(fixture.db, firstGroup, 'seed-asset-anterior-b'), /Question Prompt/);

    const reusableFirstGroup = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Reusable first set', specificQuestionMode: 'none' });
    const reusableSecondGroup = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Reusable second set', specificQuestionMode: 'none' });
    const reusableFirstOption = await addStimulusOption(fixture.db, reusableFirstGroup, 'seed-asset-pityriasis-trunk');
    const reusableSecondOption = await addStimulusOption(fixture.db, reusableSecondGroup, 'seed-asset-pityriasis-herald');
    const reusableSecond = await createAssetQuestion(fixture.db, { assetId: 'seed-asset-pityriasis-trunk', promptMd: 'Shared reusable prompt?', answerMd: 'Reusable second.' });
    await optInAssetQuestion(fixture.db, { caseId: 'seed-anterior-a', optionId: reusableFirstOption, assetQuestionId: reusableSecond });
    await removeStimulusOptionFromCase(fixture.db, reusableFirstOption);
    const reusableOther = await createAssetQuestion(fixture.db, { assetId: 'seed-asset-pityriasis-herald', promptMd: 'Shared reusable prompt?', answerMd: 'Reusable other.' });
    await optInAssetQuestion(fixture.db, { caseId: 'seed-anterior-a', optionId: reusableSecondOption, assetQuestionId: reusableOther });
    await assert.rejects(() => addStimulusOption(fixture.db, reusableFirstGroup, 'seed-asset-pityriasis-trunk'), /Question Prompt/);
    assert.equal((await fixture.db.select().from(stimulusOptionAssetQuestions).where(eq(stimulusOptionAssetQuestions.stimulusGroupOptionId, firstOption))).length, 1);
  } finally {
    fixture.sqlite.close();
  }
});

test('re-adding an archived Asset to its original set restores the same option identity', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Restore set', specificQuestionMode: 'none' });
    const optionId = await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b', 'Original caption');
    await removeStimulusOptionFromCase(fixture.db, optionId);
    const restoredId = await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b', 'Restored caption');
    assert.equal(restoredId, optionId);
    const restored = (await fixture.db.select({ isActive: stimulusGroupOptions.isActive, removedFromCase: stimulusGroupOptions.removedFromCase, captionMd: stimulusGroupOptions.captionMd }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.id, optionId)))[0];
    assert.deepEqual(restored, { isActive: true, removedFromCase: false, captionMd: 'Restored caption' });
  } finally {
    fixture.sqlite.close();
  }
});
