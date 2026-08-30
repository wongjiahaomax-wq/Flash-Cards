import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getAdminDashboardSummary } from '../src/lib/server/db/admin-dashboard.js';
import { getAdminCaseById, getAdminCaseData } from '../src/lib/server/db/case-assets.js';
import { createDb } from '../src/lib/server/db/index.js';
import { serverTimingValue, withServerReadTiming } from '../src/lib/server/performance-timing.js';
import { applyCurrentSchema } from './current-schema.js';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  /** @type {string[]} */
  const preparedSql = [];
  const d1 = {
    /** @param {string} sql */
    prepare(sql) {
      preparedSql.push(sql);
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
  };
  return {
    db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))),
    sqlite,
    preparedSql
  };
}

/** @param {ReturnType<typeof createLearningDb>} fixture */
function seed(fixture) {
  const { sqlite } = fixture;
  sqlite.exec("INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview-1', 'user-1', 'active', 4102444800000)");
  sqlite.exec("INSERT INTO concepts (id, name, slug, is_active) VALUES ('topic-a', 'Topic A', 'topic-a', 1), ('topic-b', 'Topic B', 'topic-b', 1), ('topic-off', 'Topic Off', 'topic-off', 0)");

  for (let index = 1; index <= 8; index += 1) {
    const id = `case-${index}`;
    const title = `Case ${String(index).padStart(2, '0')}`;
    sqlite
      .prepare('INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, is_active) VALUES (?, ?, ?, ?, ?, 1)')
      .run(id, title, `Stem ${index}`, index === 1 ? 'fixed' : 'automatic', index === 1 ? 3 : null);
    sqlite.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, 'topic-a', 'primary')").run(id);
  }

  sqlite.exec("INSERT INTO cases (id, title, is_active) VALUES ('case-off', 'Inactive Case', 0)");
  sqlite.exec("INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-off', 'topic-a', 'primary')");
  sqlite.exec("INSERT INTO cases (id, title, preview_session_id, is_active) VALUES ('case-preview', 'Preview Case', 'preview-1', 1)");
  sqlite.exec("INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-preview', 'topic-a', 'primary')");

  sqlite.exec("INSERT INTO assets (id, type, storage_key, mime_type, is_active) VALUES ('asset-on', 'image', 'on.png', 'image/png', 1), ('asset-off', 'image', 'off.png', 'image/png', 0)");
  sqlite.exec("INSERT INTO assets (id, type, storage_key, mime_type, preview_session_id, is_active) VALUES ('asset-preview', 'image', 'preview.png', 'image/png', 'preview-1', 1)");

  sqlite.exec("INSERT INTO question_prompts (id, prompt_md, is_active) VALUES ('prompt-on', 'Prompt on', 1), ('prompt-off', 'Prompt off', 0)");
  sqlite.exec("INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active) VALUES ('prompt-preview', 'Preview prompt', 'preview-1', 1)");
  sqlite.exec("INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES ('cq-1', 'case-1', 'prompt-on', 'A', 1), ('cq-2', 'case-2', 'prompt-on', 'B', 0), ('cq-3', 'case-off', 'prompt-on', 'C', 1), ('cq-4', 'case-3', 'prompt-off', 'D', 1)");
  sqlite.exec("INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES ('cq-preview', 'case-preview', 'prompt-preview', 'E', 1)");
}

/** @param {string[]} preparedSql @param {string} table */
function queriesFrom(preparedSql, table) {
  return preparedSql.filter((statement) => statement.includes(`from "${table}"`));
}

test('dashboard read model preserves production/inactive semantics and bounds Case summaries in SQL', async () => {
  const fixture = createLearningDb();
  try {
    seed(fixture);
    fixture.preparedSql.length = 0;

    const summary = await getAdminDashboardSummary(fixture.db);
    assert.equal(summary.caseCount, 8);
    assert.equal(summary.questionCount, 4);
    assert.equal(summary.assetCount, 2);
    assert.equal(summary.topicCount, 2);
    assert.equal(summary.dashboardCases.length, 6);
    assert.deepEqual(summary.dashboardCases.map((item) => item.id), ['case-1', 'case-2', 'case-3', 'case-4', 'case-5', 'case-6']);
    assert.deepEqual(summary.dashboardCases[0], { id: 'case-1', title: 'Case 01', conceptName: 'Topic A' });

    const caseQueries = queriesFrom(fixture.preparedSql, 'cases');
    const caseSummaryQueries = caseQueries.filter((statement) => !/^\s*select\s+count\s*\(/i.test(statement));
    assert.equal(caseSummaryQueries.length, 1, JSON.stringify(caseQueries));
    assert.match(caseSummaryQueries[0], /\blimit\b/i, 'dashboard Case summaries must remain bounded by the database');

    fixture.preparedSql.length = 0;
    const bounded = await getAdminDashboardSummary(fixture.db, { caseLimit: 2 });
    assert.equal(bounded.dashboardCases.length, 2);
    const boundedCaseQueries = queriesFrom(fixture.preparedSql, 'cases');
      .filter((statement) => !/^\s*select\s+count\s*\(/i.test(statement));
    assert.equal(boundedCaseQueries.length, 1, JSON.stringify(boundedCaseQueries));
    assert.match(boundedCaseQueries[0], /\blimit\b/i);
  } finally {
    fixture.sqlite.close();
  }
});

test('dashboard Question count remains a database-side aggregate instead of loading Question rows', async () => {
  const fixture = createLearningDb();
  try {
    seed(fixture);
    fixture.preparedSql.length = 0;

    const summary = await getAdminDashboardSummary(fixture.db);
    assert.equal(summary.questionCount, 4);

    const questionQueries = queriesFrom(fixture.preparedSql, 'case_questions');
    assert.equal(questionQueries.length, 1, JSON.stringify(questionQueries));
    assert.match(questionQueries[0], /^\s*select\s+count\s*\(/i);
  } finally {
    fixture.sqlite.close();
  }
});

test('targeted production Case lookup returns one active Case with primary Topic and settings', async () => {
  const fixture = createLearningDb();
  try {
    seed(fixture);
    const row = await getAdminCaseById(fixture.db, 'case-1');
    assert.deepEqual(row, {
      id: 'case-1',
      title: 'Case 01',
      vignetteMd: 'Stem 1',
      questionSelectionMode: 'fixed',
      questionCount: 3,
      conceptId: 'topic-a',
      conceptName: 'Topic A'
    });
    assert.equal(await getAdminCaseById(fixture.db, 'case-off'), null);
    assert.equal(await getAdminCaseById(fixture.db, 'case-preview'), null);
    assert.equal(await getAdminCaseById(fixture.db, 'missing'), null);
  } finally {
    fixture.sqlite.close();
  }
});

test('Case editor read keeps its external model while executing one bounded exact Case lookup', async () => {
  const fixture = createLearningDb();
  try {
    seed(fixture);
    fixture.sqlite.exec("INSERT INTO assets (id, type, storage_key, mime_type, original_filename, is_active) VALUES ('asset-case', 'image', 'case.png', 'image/png', 'Case image', 1)");
    fixture.sqlite.exec("INSERT INTO case_assets (case_id, asset_id, display_order, caption_md) VALUES ('case-1', 'asset-case', 0, 'Caption')");
    fixture.preparedSql.length = 0;

    const data = await getAdminCaseData(fixture.db, 'case-1', { includeAvailable: false });
    assert.ok(data);
    assert.equal(data.case.id, 'case-1');
    assert.equal(data.case.conceptId, 'topic-a');
    assert.equal(data.case.questionSelectionMode, 'fixed');
    assert.equal(data.attached.length, 1);
    assert.deepEqual(data.available, []);

    const caseQueries = queriesFrom(fixture.preparedSql, 'cases');
    assert.equal(caseQueries.length, 1, `Case detail read executed unexpected Case-table queries: ${JSON.stringify(caseQueries)}`);
    assert.match(caseQueries[0], /"cases"\."id"\s*=\s*\?/);
    assert.match(caseQueries[0], /\blimit\b/i);

    assert.equal(await getAdminCaseData(fixture.db, 'case-off', { includeAvailable: false }), null);
    assert.equal(await getAdminCaseData(fixture.db, 'case-preview', { includeAvailable: false }), null);
    assert.equal(await getAdminCaseData(fixture.db, 'missing', { includeAvailable: false }), null);
  } finally {
    fixture.sqlite.close();
  }
});

test('timing instrumentation preserves return values and failure semantics', async () => {
  /** @type {{ operation: string, durationMs: number, outcome: 'ok' | 'error' }[]} */
  const timings = [];
  const value = await withServerReadTiming('admin dashboard read', async () => ({ ok: true }), (timing) => timings.push(timing));
  assert.deepEqual(value, { ok: true });
  assert.equal(timings.length, 1);
  assert.equal(timings[0].operation, 'admin dashboard read');
  assert.equal(timings[0].outcome, 'ok');
  assert.ok(timings[0].durationMs >= 0);
  assert.match(serverTimingValue(timings[0].operation, timings[0].durationMs), /^admin-dashboard-read;dur=\d+\.\d$/);

  const expected = new Error('read failed');
  await assert.rejects(
    () => withServerReadTiming('failure', async () => { throw expected; }, () => { throw new Error('observer failed'); }),
    (error) => error === expected
  );
});