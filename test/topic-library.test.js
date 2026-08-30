import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import { getTopicDetail, listTopicLibrary } from '../src/lib/server/db/topic-library.js';
import { applyCurrentSchema } from './current-schema.js';

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
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
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  });
  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite };
}

test('Topic Library searches names and reports active current counts', async () => {
  const fixture = createLearningDb();
  try {
    const rows = await listTopicLibrary(fixture.db, { search: 'anterior' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'seed-anterior-stemi');
    assert.equal(rows[0].parentName, 'STEMI');
    assert.equal(rows[0].activeCaseCount, 3);
    assert.equal(rows[0].activeSharedQuestionCount, 2);
  } finally { fixture.sqlite.close(); }
});

test('Topic detail returns primary Cases, reusable answers, prompt IDs, and inheritance state', async () => {
  const fixture = createLearningDb();
  try {
    const detail = await getTopicDetail(fixture.db, 'seed-anterior-stemi');
    assert.ok(detail);
    assert.equal(detail.parent?.id, 'seed-stemi');
    assert.deepEqual(new Set(detail.cases.map((row) => row.caseId)), new Set(['seed-anterior-a', 'seed-anterior-b', 'seed-anterior-c']));
    assert.deepEqual(new Set(detail.questions.map((row) => row.promptId)), new Set(['seed-prompt-diagnosis', 'seed-prompt-culprit']));
    const culprit = detail.questions.find((row) => row.promptId === 'seed-prompt-culprit');
    assert.ok(culprit);
    assert.match(culprit.answerMd, /LAD/);
    assert.equal(Boolean(culprit.inheritToDescendants), false);

    const parent = await getTopicDetail(fixture.db, 'seed-stemi');
    assert.ok(parent);
    assert.equal(parent.children.some((row) => row.id === 'seed-anterior-stemi'), true);
    const inherited = parent.questions.find((row) => row.promptId === 'seed-prompt-reperfusion');
    assert.ok(inherited);
    assert.equal(Boolean(inherited.inheritToDescendants), true);
  } finally { fixture.sqlite.close(); }
});

test('inactive Cases are excluded from active Topic Case counts but retained on detail', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.prepare('UPDATE cases SET is_active = 0 WHERE id = ?').run('seed-anterior-c');
    const row = (await listTopicLibrary(fixture.db)).find((item) => item.id === 'seed-anterior-stemi');
    assert.ok(row);
    assert.equal(row.activeCaseCount, 2);

    const detail = await getTopicDetail(fixture.db, 'seed-anterior-stemi');
    assert.ok(detail);
    assert.equal(detail.activeCaseCount, 2);
    assert.equal(detail.cases.length, 3);
    assert.equal(Boolean(detail.cases.find((item) => item.caseId === 'seed-anterior-c')?.caseIsActive), false);
  } finally { fixture.sqlite.close(); }
});

test('inactive Concept Question or Question Prompt is excluded from current reusable count', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.prepare('UPDATE concept_questions SET is_active = 0 WHERE id = ?').run('seed-cq-anterior-diagnosis');
    fixture.sqlite.prepare('UPDATE question_prompts SET is_active = 0 WHERE id = ?').run('seed-prompt-culprit');

    const row = (await listTopicLibrary(fixture.db)).find((item) => item.id === 'seed-anterior-stemi');
    assert.ok(row);
    assert.equal(row.activeSharedQuestionCount, 0);

    const detail = await getTopicDetail(fixture.db, 'seed-anterior-stemi');
    assert.ok(detail);
    assert.equal(detail.activeSharedQuestionCount, 0);
    assert.equal(detail.questions.length, 2);
    assert.equal(Boolean(detail.questions.find((item) => item.promptId === 'seed-prompt-diagnosis')?.usageIsActive), false);
    assert.equal(Boolean(detail.questions.find((item) => item.promptId === 'seed-prompt-culprit')?.promptIsActive), false);
  } finally { fixture.sqlite.close(); }
});

test('inactive Topic has zero current counts while retaining relationships and hierarchy for orientation', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.prepare('UPDATE concepts SET is_active = 0 WHERE id = ?').run('seed-anterior-stemi');
    const row = (await listTopicLibrary(fixture.db)).find((item) => item.id === 'seed-anterior-stemi');
    assert.ok(row);
    assert.equal(Boolean(row.isActive), false);
    assert.equal(row.activeCaseCount, 0);
    assert.equal(row.activeSharedQuestionCount, 0);

    const detail = await getTopicDetail(fixture.db, 'seed-anterior-stemi');
    assert.ok(detail);
    assert.equal(detail.cases.length, 3);
    assert.equal(detail.questions.length, 2);
    assert.equal(detail.parent?.id, 'seed-stemi');
  } finally { fixture.sqlite.close(); }
});

test('Preview-owned Cases never inflate Topic counts or appear in normal Admin Topic detail', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.prepare(`
      INSERT INTO preview_sessions (id, user_id, status, expires_at)
      VALUES (?, ?, 'active', ?)
    `).run('preview-topic-session', 'preview-topic-user', 4102444800000);
    fixture.sqlite.prepare(`
      INSERT INTO cases (id, title, preview_session_id, is_active)
      VALUES (?, ?, ?, 1)
    `).run('preview-topic-case', 'Disposable Preview Case', 'preview-topic-session');
    fixture.sqlite.prepare(`
      INSERT INTO case_concepts (case_id, concept_id, role)
      VALUES (?, ?, 'primary')
    `).run('preview-topic-case', 'seed-anterior-stemi');

    const row = (await listTopicLibrary(fixture.db)).find((item) => item.id === 'seed-anterior-stemi');
    assert.ok(row);
    assert.equal(row.activeCaseCount, 3);

    const detail = await getTopicDetail(fixture.db, 'seed-anterior-stemi');
    assert.ok(detail);
    assert.equal(detail.activeCaseCount, 3);
    assert.equal(detail.cases.some((item) => item.caseId === 'preview-topic-case'), false);
    assert.equal(detail.cases.length, 3);
  } finally { fixture.sqlite.close(); }
});

test('Preview-owned Prompts never inflate Topic shared-question counts or appear in normal Admin Topic detail', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.prepare(`
      INSERT INTO preview_sessions (id, user_id, status, expires_at)
      VALUES (?, ?, 'active', ?)
    `).run('preview-topic-prompt-session', 'preview-topic-prompt-user', 4102444800000);
    fixture.sqlite.prepare(`
      INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active)
      VALUES (?, ?, ?, 1)
    `).run('preview-topic-prompt', 'Disposable Preview Topic prompt?', 'preview-topic-prompt-session');
    fixture.sqlite.prepare(`
      INSERT INTO concept_questions (
        id, concept_id, question_prompt_id, answer_md, inherit_to_descendants, is_active
      ) VALUES (?, ?, ?, ?, 0, 1)
    `).run(
      'preview-topic-concept-question',
      'seed-anterior-stemi',
      'preview-topic-prompt',
      'Disposable Preview answer'
    );

    const row = (await listTopicLibrary(fixture.db)).find((item) => item.id === 'seed-anterior-stemi');
    assert.ok(row);
    assert.equal(row.activeSharedQuestionCount, 2);

    const detail = await getTopicDetail(fixture.db, 'seed-anterior-stemi');
    assert.ok(detail);
    assert.equal(detail.activeSharedQuestionCount, 2);
    assert.equal(detail.questions.some((item) => item.promptId === 'preview-topic-prompt'), false);
    assert.equal(detail.questions.length, 2);
  } finally { fixture.sqlite.close(); }
});
