import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import {
  getQuestionPromptDetail,
  listQuestionLibrary,
  QuestionPromptInputError,
  updateQuestionPrompt
} from '../src/lib/server/db/question-library.js';

const migrationSql = readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(buildSeedSql());
  const d1 = /** @type {any} */ ({
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
      return Promise.all(statements.map((statement) => statement.run()));
    }
  });
  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite };
}

test('Question Library searches prompt and answer text and aggregates shared usage', async () => {
  const fixture = createLearningDb();
  try {
    const promptMatches = await listQuestionLibrary(fixture.db, { search: 'right bundle branch' });
    assert.deepEqual(promptMatches.map((row) => row.id), ['seed-prompt-describe-ecg', 'seed-prompt-conduction']);

    const sharedPrompt = (await listQuestionLibrary(fixture.db, { scope: 'shared' }))
      .find((row) => row.id === 'seed-prompt-reperfusion');
    assert.ok(sharedPrompt);
    assert.equal(sharedPrompt.scope, 'Shared');
    const caseOnlyPrompt = (await listQuestionLibrary(fixture.db, { scope: 'case' }))
      .find((row) => row.id === 'seed-prompt-describe-ecg');
    assert.ok(caseOnlyPrompt);
    assert.equal(caseOnlyPrompt.scope, 'Case-specific');

    const detail = await getQuestionPromptDetail(fixture.db, 'seed-prompt-describe-ecg');
    assert.ok(detail);
    assert.equal(detail.usageCount, 3);
    assert.equal(detail.caseUsages.length, 3);
    assert.deepEqual(detail.caseUsages.map((usage) => usage.caseId), [
      'seed-anterior-a',
      'seed-anterior-b',
      'seed-anterior-c'
    ]);
    assert.match(detail.caseUsages[0].answerMd, /V1–V4/);
  } finally {
    fixture.sqlite.close();
  }
});

test('Question Library filters Topic usages and exposes inheritance state', async () => {
  const fixture = createLearningDb();
  try {
    const rows = await listQuestionLibrary(fixture.db, { topicId: 'seed-stemi', scope: 'shared' });
    assert.deepEqual(rows.map((row) => row.id), ['seed-prompt-reperfusion']);

    const detail = await getQuestionPromptDetail(fixture.db, 'seed-prompt-reperfusion');
    assert.equal(detail?.conceptUsages[0].conceptName, 'STEMI');
    assert.equal(detail?.conceptUsages[0].inheritToDescendants, true);
  } finally {
    fixture.sqlite.close();
  }
});

test('reused Question Prompt edits require explicit confirmation and preserve answers', async () => {
  const fixture = createLearningDb();
  try {
    await assert.rejects(
      updateQuestionPrompt(fixture.db, {
        promptId: 'seed-prompt-describe-ecg',
        promptMd: 'Describe this ECG in detail.',
        expectedUsageCount: 3
      }),
      (error) => error instanceof QuestionPromptInputError && /used in 3 places/.test(error.message)
    );
    const unchanged = fixture.sqlite.prepare('SELECT prompt_md FROM question_prompts WHERE id = ?').get('seed-prompt-describe-ecg');
    assert.ok(unchanged);
    assert.equal(unchanged.prompt_md, 'Describe this ECG.');

    await updateQuestionPrompt(fixture.db, {
      promptId: 'seed-prompt-describe-ecg',
      promptMd: 'Describe this ECG in detail.',
      confirmSharedEdit: 'on',
      expectedUsageCount: 3
    });
    const updated = fixture.sqlite.prepare('SELECT prompt_md FROM question_prompts WHERE id = ?').get('seed-prompt-describe-ecg');
    assert.ok(updated);
    assert.equal(updated.prompt_md, 'Describe this ECG in detail.');
    const caseCount = fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM case_questions WHERE question_prompt_id = ?').get('seed-prompt-describe-ecg');
    assert.ok(caseCount);
    assert.equal(
      caseCount.count,
      3
    );
    const preservedAnswer = fixture.sqlite.prepare('SELECT answer_md FROM case_questions WHERE id = ?').get('seed-caseq-anterior-a-describe');
    assert.ok(preservedAnswer);
    assert.equal(
      preservedAnswer.answer_md,
      'ST elevation in V1–V4 with reciprocal inferior ST depression.'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Question Prompt edit rejects a stale usage snapshot', async () => {
  const fixture = createLearningDb();
  try {
    await assert.rejects(
      updateQuestionPrompt(fixture.db, {
        promptId: 'seed-prompt-describe-ecg',
        promptMd: 'Changed wording',
        confirmSharedEdit: 'on',
        expectedUsageCount: 2
      }),
      (error) => error instanceof QuestionPromptInputError && /changed while you were editing/.test(error.message)
    );
  } finally {
    fixture.sqlite.close();
  }
});
