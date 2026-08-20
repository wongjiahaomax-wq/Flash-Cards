import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  listCaseQuestions,
  moveCaseQuestion,
  moveCaseQuestionToStimulusOption,
  removeCaseQuestion,
  saveCaseQuestion
} from '../src/lib/server/db/case-questions.js';
import {
  addStimulusOption,
  convertCaseAssetToStimulusOption,
  createStimulusGroup,
  saveStimulusOptionQuestion,
  setStimulusOptionActive
} from '../src/lib/server/db/stimulus-groups.js';
import { getReview, startReview } from '../src/lib/server/db/learning.js';
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
  readFileSync(new URL('../drizzle/0009_reusable_image_questions.sql', import.meta.url), 'utf8')
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
    async batch(statements) {
      return Promise.all(statements.map((/** @type {any} */ statement) => statement.run()));
    }
  };
  return { db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))), sqlite };
}

test('Case questions can be added, edited, reused for the topic, reordered, and removed', async () => {
  const fixture = createLearningDb();
  try {
    const caseId = 'seed-pityriasis-rosea';
    const firstPromptId = await saveCaseQuestion(fixture.db, {
      caseId,
      promptMd: 'ECG finding',
      answerMd: 'Prolonged QTc',
      reusableForTopic: true
    });
    const secondPromptId = await saveCaseQuestion(fixture.db, {
      caseId,
      promptMd: 'Name 2 physical examination findings with this condition',
      answerMd: 'Positive Chvostek and Trousseau signs'
    });
    const thirdPromptId = await saveCaseQuestion(fixture.db, {
      caseId,
      promptMd: 'Name 3 other causes of this condition',
      answerMd: 'Hypomagnesemia; alkalosis; vitamin D deficiency'
    });

    let questions = await listCaseQuestions(fixture.db, caseId);
    assert.deepEqual(questions.map((question) => question.promptMd), [
      'What is the initial lesion shown?',
      'ECG finding',
      'Name 2 physical examination findings with this condition',
      'Name 3 other causes of this condition'
    ]);
    assert.equal(questions[1].reusableForTopic, true);
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT answer_md, inherit_to_descendants FROM concept_questions WHERE concept_id = ? AND question_prompt_id = ?').all('seed-pityriasis-rosea', firstPromptId).map((row) => ({ ...row })),
      [{ answer_md: 'Prolonged QTc', inherit_to_descendants: 0 }]
    );

    await saveCaseQuestion(fixture.db, {
      caseId,
      originalPromptId: secondPromptId,
      promptMd: 'Name 2 physical examination findings with this condition',
      answerMd: 'Positive Chvostek and Trousseau signs (updated)'
    });
    questions = await listCaseQuestions(fixture.db, caseId);
    assert.equal(questions[2].answerMd, 'Positive Chvostek and Trousseau signs (updated)');

    await moveCaseQuestion(fixture.db, caseId, thirdPromptId, 'up');
    questions = await listCaseQuestions(fixture.db, caseId);
    assert.deepEqual(questions.map((question) => question.questionPromptId), [
      'seed-prompt-herald',
      firstPromptId,
      thirdPromptId,
      secondPromptId
    ]);

    await removeCaseQuestion(fixture.db, caseId, thirdPromptId);
    assert.deepEqual((await listCaseQuestions(fixture.db, caseId)).map((question) => question.questionPromptId), [
      'seed-prompt-herald',
      firstPromptId,
      secondPromptId
    ]);
  } finally {
    fixture.sqlite.close();
  }
});

test('exact prompt text reuses the existing question_prompts row', async () => {
  const fixture = createLearningDb();
  try {
    const before = fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM question_prompts WHERE prompt_md = ?').get('Describe this ECG.');
    assert.ok(before);
    const promptId = await saveCaseQuestion(fixture.db, {
      caseId: 'seed-pityriasis-rosea',
      promptMd: 'Describe this ECG.',
      answerMd: 'The existing prompt row is reused.'
    });
    const after = fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM question_prompts WHERE prompt_md = ?').get('Describe this ECG.');
    assert.ok(after);
    assert.equal(after.count, before.count);
    assert.equal(promptId, 'seed-prompt-describe-ecg');
  } finally {
    fixture.sqlite.close();
  }
});

test('reusable topic answers retain Case-specific precedence in learner reviews', async () => {
  const fixture = createLearningDb();
  try {
    const promptId = await saveCaseQuestion(fixture.db, {
      caseId: 'seed-anterior-a',
      originalPromptId: 'seed-prompt-describe-ecg',
      promptMd: 'Describe this ECG.',
      answerMd: 'Case-specific answer wins.',
      reusableForTopic: true
    });
    fixture.sqlite.prepare('UPDATE concept_questions SET answer_md = ? WHERE concept_id = ? AND question_prompt_id = ?').run(
      'Study topic answer loses to the Case answer.',
      'seed-anterior-stemi',
      promptId
    );
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', rng: () => 0 });
    assert.ok(reviewId);
    const review = await getReview(fixture.db, reviewId, 'learner-1');
    assert.ok(review);
    assert.ok(review.questions.some((question) => question.prompt === 'Describe this ECG.' && question.answer === 'Case-specific answer wins.'));
    assert.ok(promptId);
  } finally {
    fixture.sqlite.close();
  }
});

test('moving a Case question to an exact image preserves its prompt and answer', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'ECG alternatives',
      specificQuestionMode: 'none'
    });
    const optionA = await convertCaseAssetToStimulusOption(fixture.db, groupId, 'seed-asset-anterior-a');
    const optionB = await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b', 'ECG B');
    const promptId = await saveCaseQuestion(fixture.db, {
      caseId: 'seed-anterior-a',
      promptMd: 'What are the ECG changes?',
      answerMd: 'Widespread concave ST elevation with PR depression.',
      reusableForTopic: true
    });

    await moveCaseQuestionToStimulusOption(fixture.db, {
      caseId: 'seed-anterior-a',
      promptId,
      optionId: optionA
    });

    assert.deepEqual(
      fixture.sqlite.prepare('SELECT is_active AS isActive FROM case_questions WHERE case_id = ? AND question_prompt_id = ?').all('seed-anterior-a', promptId).map((row) => ({ ...row })),
      [{ isActive: 0 }]
    );
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT question_prompt_id AS promptId, answer_md AS answerMd, is_active AS isActive FROM stimulus_option_questions WHERE stimulus_group_option_id = ?').all(optionA).map((row) => ({ ...row })),
      [{ promptId, answerMd: 'Widespread concave ST elevation with PR depression.', isActive: 1 }]
    );
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM concept_questions WHERE concept_id = ? AND question_prompt_id = ?').get('seed-anterior-stemi', promptId)?.count, 0);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM stimulus_option_questions WHERE stimulus_group_option_id = ?').get(optionB)?.count, 0);

    await saveStimulusOptionQuestion(fixture.db, optionB, {
      promptMd: 'What are the ECG changes?',
      answerMd: 'Hyperacute anterior T waves with subtle ST elevation.'
    });
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT answer_md AS answerMd FROM stimulus_option_questions WHERE stimulus_group_option_id = ? AND question_prompt_id = ?').all(optionB, promptId).map((row) => ({ ...row })),
      [{ answerMd: 'Hyperacute anterior T waves with subtle ST elevation.' }]
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('moving a Case question validates Case ownership, active targets, and conflicts safely', async () => {
  const fixture = createLearningDb();
  try {
    const caseGroupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'ECG alternatives',
      specificQuestionMode: 'none'
    });
    const optionId = await convertCaseAssetToStimulusOption(fixture.db, caseGroupId, 'seed-asset-anterior-a');
    const otherCaseGroupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-b',
      name: 'Other ECG alternatives',
      specificQuestionMode: 'none'
    });
    const otherCaseOptionId = await convertCaseAssetToStimulusOption(fixture.db, otherCaseGroupId, 'seed-asset-anterior-b');
    const promptId = await saveCaseQuestion(fixture.db, {
      caseId: 'seed-anterior-a',
      promptMd: 'Move validation question?',
      answerMd: 'Original answer.'
    });

    await assert.rejects(
      moveCaseQuestionToStimulusOption(fixture.db, { caseId: 'seed-anterior-a', promptId, optionId: otherCaseOptionId }),
      /Choose an image from this Case/
    );
    await setStimulusOptionActive(fixture.db, optionId, false);
    await assert.rejects(
      moveCaseQuestionToStimulusOption(fixture.db, { caseId: 'seed-anterior-a', promptId, optionId }),
      /missing or inactive/
    );
    assert.equal(fixture.sqlite.prepare('SELECT is_active AS isActive FROM case_questions WHERE case_id = ? AND question_prompt_id = ?').get('seed-anterior-a', promptId)?.isActive, 1);

    await setStimulusOptionActive(fixture.db, optionId, true);
    await saveStimulusOptionQuestion(fixture.db, optionId, {
      promptMd: 'Move validation question?',
      answerMd: 'Existing image answer.'
    });
    await assert.rejects(
      moveCaseQuestionToStimulusOption(fixture.db, { caseId: 'seed-anterior-a', promptId, optionId }),
      /already has an active question/
    );
    assert.equal(fixture.sqlite.prepare('SELECT answer_md AS answerMd FROM stimulus_option_questions WHERE stimulus_group_option_id = ? AND question_prompt_id = ?').get(optionId, promptId)?.answerMd, 'Existing image answer.');
    assert.equal(fixture.sqlite.prepare('SELECT is_active AS isActive FROM case_questions WHERE case_id = ? AND question_prompt_id = ?').get('seed-anterior-a', promptId)?.isActive, 1);
  } finally {
    fixture.sqlite.close();
  }
});

test('moving a Case question respects the cross-Alternative-Set prompt invariant', async () => {
  const fixture = createLearningDb();
  try {
    const sourceGroupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'ECG alternatives',
      specificQuestionMode: 'none'
    });
    const sourceOptionId = await convertCaseAssetToStimulusOption(fixture.db, sourceGroupId, 'seed-asset-anterior-a');
    const targetGroupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'X-ray alternatives',
      specificQuestionMode: 'none'
    });
    const targetOptionId = await addStimulusOption(fixture.db, targetGroupId, 'seed-asset-anterior-b', 'X-ray A');
    const promptId = await saveStimulusOptionQuestion(fixture.db, sourceOptionId, {
      promptMd: 'What abnormality is present?',
      answerMd: 'Source image answer.'
    });
    await saveCaseQuestion(fixture.db, {
      caseId: 'seed-anterior-a',
      promptMd: 'What abnormality is present?',
      answerMd: 'Case answer.'
    });

    await assert.rejects(
      moveCaseQuestionToStimulusOption(fixture.db, {
        caseId: 'seed-anterior-a',
        promptId,
        optionId: targetOptionId
      }),
      /same Question Prompt cannot be independently attached to multiple active Stimulus Groups/
    );
    assert.equal(fixture.sqlite.prepare('SELECT is_active AS isActive FROM case_questions WHERE case_id = ? AND question_prompt_id = ?').get('seed-anterior-a', promptId)?.isActive, 1);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM stimulus_option_questions WHERE stimulus_group_option_id = ? AND question_prompt_id = ?').get(targetOptionId, promptId)?.count, 0);
    assert.equal(fixture.sqlite.prepare('SELECT answer_md AS answerMd FROM stimulus_option_questions WHERE stimulus_group_option_id = ? AND question_prompt_id = ?').get(sourceOptionId, promptId)?.answerMd, 'Source image answer.');
  } finally {
    fixture.sqlite.close();
  }
});
