import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import { applyCurrentSchema } from './current-schema.js';
import {
  getQuestionPromptDetail,
  listQuestionLibrary,
  QuestionPromptInputError,
  updateQuestionPrompt
} from '../src/lib/server/db/question-library.js';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('$lib/')) {
      return {
        url: new URL('../src/lib/' + specifier.slice('$lib/'.length), import.meta.url).href,
        shortCircuit: true
      };
    }
    return nextResolve(specifier, context);
  }
});

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(buildSeedSql());
  let statementCount = 0;
  const d1 = /** @type {any} */ ({
    get statementCount() { return statementCount; },
    /** @param {string} sql */
    prepare(sql) {
      statementCount += 1;
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
  return { db: createDb(/** @type {D1Database} */ (d1)), d1, sqlite };
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

test('active Case Question on an inactive Case is excluded from current active usage', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.prepare('UPDATE cases SET is_active = 0 WHERE id = ?').run('seed-anterior-c');

    const listRow = (await listQuestionLibrary(fixture.db))
      .find((row) => row.id === 'seed-prompt-describe-ecg');
    assert.ok(listRow);
    assert.equal(listRow.caseUsageCount, 2);
    assert.equal(listRow.usageCount, 2);

    const detail = await getQuestionPromptDetail(fixture.db, 'seed-prompt-describe-ecg');
    assert.ok(detail);
    assert.equal(detail.usageCount, 2);
    assert.equal(detail.totalUsageCount, 3);
    const historicalUsage = detail.caseUsages.find((usage) => usage.caseId === 'seed-anterior-c');
    assert.ok(historicalUsage);
    assert.equal(Boolean(historicalUsage.isActive), true);
    assert.equal(Boolean(historicalUsage.caseIsActive), false);
  } finally {
    fixture.sqlite.close();
  }
});

test('active Concept Question on an inactive Concept is excluded from current active usage', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.prepare('UPDATE concepts SET is_active = 0 WHERE id = ?').run('seed-anterior-stemi');
    fixture.sqlite.prepare('UPDATE concepts SET is_active = 0 WHERE id = ?').run('seed-stemi');

    const listRow = (await listQuestionLibrary(fixture.db))
      .find((row) => row.id === 'seed-prompt-reperfusion');
    assert.ok(listRow);
    assert.equal(listRow.conceptUsageCount, 0);
    assert.equal(listRow.usageCount, 0);

    const detail = await getQuestionPromptDetail(fixture.db, 'seed-prompt-reperfusion');
    assert.ok(detail);
    assert.equal(detail.usageCount, 0);
    assert.equal(detail.totalUsageCount, 1);
    assert.equal(detail.conceptUsages.length, 1);
    assert.equal(Boolean(detail.conceptUsages[0].isActive), true);
    assert.equal(Boolean(detail.conceptUsages[0].conceptIsActive), false);
  } finally {
    fixture.sqlite.close();
  }
});

test('detail usage count matches update guard and valid shared save after parent inactivity', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.prepare('UPDATE cases SET is_active = 0 WHERE id = ?').run('seed-anterior-c');

    const detail = await getQuestionPromptDetail(fixture.db, 'seed-prompt-describe-ecg');
    assert.ok(detail);
    assert.equal(detail.usageCount, 2);

    await assert.rejects(
      updateQuestionPrompt(fixture.db, {
        promptId: 'seed-prompt-describe-ecg',
        promptMd: 'Describe this ECG in detail.',
        expectedUsageCount: detail.usageCount
      }),
      (error) => error instanceof QuestionPromptInputError && /used in 2 places/.test(error.message)
    );

    const result = await updateQuestionPrompt(fixture.db, {
      promptId: 'seed-prompt-describe-ecg',
      promptMd: 'Describe this ECG in detail.',
      confirmSharedEdit: 'on',
      expectedUsageCount: detail.usageCount
    });
    assert.equal(result.usageCount, detail.usageCount);

    const updated = fixture.sqlite.prepare('SELECT prompt_md FROM question_prompts WHERE id = ?').get('seed-prompt-describe-ecg');
    assert.ok(updated);
    assert.equal(updated.prompt_md, 'Describe this ECG in detail.');
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
    assert.equal(caseCount.count, 3);
    const preservedAnswer = fixture.sqlite.prepare('SELECT answer_md FROM case_questions WHERE id = ?').get('seed-caseq-anterior-a-describe');
    assert.ok(preservedAnswer);
    assert.equal(preservedAnswer.answer_md, 'ST elevation in V1–V4 with reciprocal inferior ST depression.');
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

test('Question Prompt route denies unauthenticated and learner loads and actions before database or form access', async () => {
  const fixture = createLearningDb();
  try {
    const { load, actions } = await import('../src/routes/admin/questions/[promptId]/+page.server.js');
    let formDataCalls = 0;

    for (const user of [null, { id: 'learner', role: 'user' }]) {
      const event = /** @type {any} */ ({
        locals: { user },
        params: { promptId: 'seed-prompt-describe-ecg' },
        platform: { env: { DB: fixture.d1 } },
        request: {
          async formData() {
            formDataCalls += 1;
            return new FormData();
          }
        }
      });

      assert.deepEqual(await load(event), { prompt: null });
      const result = await actions.updatePrompt(event);
      assert.equal(result.status, 403);
      assert.match(result.data.error, /Administrator access is required/);
    }

    assert.equal(fixture.d1.statementCount, 0, 'unauthorized route calls must not prepare D1 statements');
    assert.equal(formDataCalls, 0, 'unauthorized actions must reject before parsing form data');
  } finally {
    fixture.sqlite.close();
  }
});

test('Production Admin can load and update a Production Prompt while Preview Prompts stay excluded', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec(
      "INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('prompt-route-preview-session', 'prompt-route-preview-owner', 'active', 2000000000000); " +
      "INSERT INTO question_prompts (id, prompt_md, is_active, preview_session_id) VALUES ('prompt-route-preview-only', 'Preview-only prompt wording', 1, 'prompt-route-preview-session');"
    );

    const { load, actions } = await import('../src/routes/admin/questions/[promptId]/+page.server.js');
    const admin = { id: 'production-admin', role: 'admin' };
    /** @param {string} promptId @param {any} [request] */
    const routeEvent = (promptId, request = new Request('http://localhost/admin/questions/' + promptId)) => /** @type {any} */ ({
      locals: { user: admin },
      params: { promptId },
      platform: { env: { DB: fixture.d1 } },
      request
    });

    const loaded = await load(routeEvent('seed-prompt-describe-ecg'));
    const loadedPrompt = loaded.prompt;
    assert.ok(loadedPrompt);
    assert.equal(loadedPrompt.id, 'seed-prompt-describe-ecg');
    assert.equal(loadedPrompt.promptMd, 'Describe this ECG.');
    assert.equal(loadedPrompt.usageCount, 3);

    const previewLoad = await load(routeEvent('prompt-route-preview-only'));
    assert.deepEqual(previewLoad, { prompt: null });

    let previewFormDataCalls = 0;
    const previewAction = await actions.updatePrompt(routeEvent('prompt-route-preview-only', /** @type {any} */ ({
      async formData() {
        previewFormDataCalls += 1;
        return new FormData();
      }
    })));
    assert.equal(previewAction.status, 404);
    assert.match(previewAction.data.error, /Production Question Prompt not found/);
    assert.equal(previewFormDataCalls, 0);
    assert.equal(fixture.sqlite.prepare('SELECT prompt_md FROM question_prompts WHERE id = ?').get('prompt-route-preview-only')?.prompt_md, 'Preview-only prompt wording');

    /** @param {{ promptMd: string, expectedUsageCount: number, confirmSharedEdit: boolean }} input */
    const makeUpdateRequest = ({ promptMd, expectedUsageCount, confirmSharedEdit }) => {
      const formData = new FormData();
      formData.set('prompt_md', promptMd);
      formData.set('expected_usage_count', String(expectedUsageCount));
      if (confirmSharedEdit) formData.set('confirm_shared_edit', 'on');
      return new Request('http://localhost/admin/questions/seed-prompt-describe-ecg?/updatePrompt', {
        method: 'POST',
        body: formData
      });
    };

    const staleResult = await actions.updatePrompt(routeEvent('seed-prompt-describe-ecg', makeUpdateRequest({
      promptMd: 'A stale wording update',
      expectedUsageCount: loadedPrompt.usageCount + 1,
      confirmSharedEdit: true
    })));
    assert.equal(staleResult.status, 400);
    assert.match(staleResult.data.error, /changed while you were editing/);

    const unconfirmedResult = await actions.updatePrompt(routeEvent('seed-prompt-describe-ecg', makeUpdateRequest({
      promptMd: 'An unconfirmed wording update',
      expectedUsageCount: loadedPrompt.usageCount,
      confirmSharedEdit: false
    })));
    assert.equal(unconfirmedResult.status, 400);
    assert.match(unconfirmedResult.data.error, /used in 3 places/);

    await assert.rejects(
      () => actions.updatePrompt(routeEvent('seed-prompt-describe-ecg', makeUpdateRequest({
        promptMd: 'Describe this ECG in detail.',
        expectedUsageCount: loadedPrompt.usageCount,
        confirmSharedEdit: true
      }))),
      (error) => {
        const redirectError = /** @type {{ status?: number, location?: string }} */ (error);
        assert.equal(redirectError.status, 303);
        assert.equal(redirectError.location, '/admin/questions/seed-prompt-describe-ecg?status=saved');
        return true;
      }
    );

    assert.equal(fixture.sqlite.prepare('SELECT prompt_md FROM question_prompts WHERE id = ?').get('seed-prompt-describe-ecg')?.prompt_md, 'Describe this ECG in detail.');
    assert.equal(fixture.sqlite.prepare('SELECT answer_md FROM case_questions WHERE id = ?').get('seed-caseq-anterior-a-describe')?.answer_md, 'ST elevation in V1–V4 with reciprocal inferior ST depression.');
  } finally {
    fixture.sqlite.close();
  }
});
