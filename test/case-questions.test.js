import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  listCaseQuestions,
  moveCaseQuestion,
  removeCaseQuestion,
  saveCaseQuestion
} from '../src/lib/server/db/case-questions.js';
import { getReview, startReview } from '../src/lib/server/db/learning.js';
import { buildSeedSql } from '../scripts/seed-content.mjs';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

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
