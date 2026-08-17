import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import {
  addCaseQuestionTag,
  addCaseTag,
  createTag,
  listActiveTags,
  listCaseQuestionTagAssignments,
  listCaseTagAssignments,
  listCurrentCaseTagAssignments,
  listCurrentPromptTagAssignments,
  listTaggableCaseQuestions,
  listTaggableCases,
  listTags,
  setTagActive,
  TagInputError
} from '../src/lib/server/db/tag-library.js';

const migrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0005_tag_foundation.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');

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
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  });
  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite };
}

/** @param {DatabaseSync} sqlite */
function firstActiveCaseAndQuestion(sqlite) {
  const row = sqlite.prepare(`
    SELECT c.id AS case_id, cq.id AS case_question_id, cq.question_prompt_id AS prompt_id
    FROM cases c
    JOIN case_questions cq ON cq.case_id = c.id
    JOIN question_prompts qp ON qp.id = cq.question_prompt_id
    WHERE c.is_active = 1 AND cq.is_active = 1 AND qp.is_active = 1
    ORDER BY c.id, cq.id
    LIMIT 1
  `).get();
  assert.ok(row);
  return /** @type {{ case_id: string, case_question_id: string, prompt_id: string }} */ (row);
}

test('Tags normalize canonical names and report current Case and Case Question counts', async () => {
  const fixture = createLearningDb();
  try {
    const context = firstActiveCaseAndQuestion(fixture.sqlite);
    const tag = await createTag(fixture.db, '  Prolonged   QTc  ');
    assert.equal(tag.name, 'Prolonged QTc');

    await assert.rejects(
      () => createTag(fixture.db, 'prolonged qtc'),
      (error) => error instanceof TagInputError && /already exists/i.test(error.message)
    );

    await addCaseTag(fixture.db, { caseId: context.case_id, tagId: tag.id });
    await addCaseQuestionTag(fixture.db, { caseQuestionId: context.case_question_id, tagId: tag.id });

    const row = (await listTags(fixture.db)).find((item) => item.id === tag.id);
    assert.ok(row);
    assert.equal(row.activeCaseCount, 1);
    assert.equal(row.activeCaseQuestionCount, 1);
    const currentCaseAssignments = await listCurrentCaseTagAssignments(fixture.db);
    const currentPromptAssignments = await listCurrentPromptTagAssignments(fixture.db);
    assert.equal(currentCaseAssignments.some((item) => item.tagId === tag.id), true, JSON.stringify(currentCaseAssignments));
    assert.equal(
      currentPromptAssignments.some((item) => item.promptId === context.prompt_id && item.tagId === tag.id),
      true,
      JSON.stringify({ context, assignments: currentPromptAssignments })
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Case Tags do not automatically become Question Tags', async () => {
  const fixture = createLearningDb();
  try {
    const context = firstActiveCaseAndQuestion(fixture.sqlite);
    const tag = await createTag(fixture.db, 'Hypocalcaemia');
    await addCaseTag(fixture.db, { caseId: context.case_id, tagId: tag.id });

    assert.equal((await listCurrentCaseTagAssignments(fixture.db)).some((item) => item.tagId === tag.id), true);
    assert.equal((await listCurrentPromptTagAssignments(fixture.db)).some((item) => item.tagId === tag.id), false);

    await addCaseQuestionTag(fixture.db, { caseQuestionId: context.case_question_id, tagId: tag.id });
    const currentPromptAssignments = await listCurrentPromptTagAssignments(fixture.db);
    assert.equal(
      currentPromptAssignments.some((item) => item.tagId === tag.id),
      true,
      JSON.stringify(currentPromptAssignments)
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('deactivating a Tag preserves curated relationships but prevents new active assignment', async () => {
  const fixture = createLearningDb();
  try {
    const context = firstActiveCaseAndQuestion(fixture.sqlite);
    const tag = await createTag(fixture.db, 'Prolonged QTc');
    await addCaseTag(fixture.db, { caseId: context.case_id, tagId: tag.id });
    await addCaseQuestionTag(fixture.db, { caseQuestionId: context.case_question_id, tagId: tag.id });
    await setTagActive(fixture.db, { tagId: tag.id, isActive: false });

    assert.equal((await listActiveTags(fixture.db)).some((item) => item.id === tag.id), false);
    const retainedCaseAssignments = await listCaseTagAssignments(fixture.db);
    const retainedQuestionAssignments = await listCaseQuestionTagAssignments(fixture.db);
    assert.equal(retainedCaseAssignments.some((item) => item.tagId === tag.id), true, JSON.stringify(retainedCaseAssignments));
    assert.equal(retainedQuestionAssignments.some((item) => item.tagId === tag.id), true, JSON.stringify(retainedQuestionAssignments));
    assert.equal((await listCurrentCaseTagAssignments(fixture.db)).some((item) => item.tagId === tag.id), false);
    assert.equal((await listCurrentPromptTagAssignments(fixture.db)).some((item) => item.tagId === tag.id), false);

    const otherCase = fixture.sqlite.prepare('SELECT id FROM cases WHERE is_active = 1 AND id <> ? LIMIT 1').get(context.case_id);
    assert.ok(otherCase);
    await assert.rejects(
      () => addCaseTag(fixture.db, { caseId: String(otherCase.id), tagId: tag.id }),
      (error) => error instanceof TagInputError && /inactive/i.test(error.message)
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview-owned Cases and Prompts are absent from normal Tag counts, details, and mutation targets', async () => {
  const fixture = createLearningDb();
  try {
    const context = firstActiveCaseAndQuestion(fixture.sqlite);
    const tag = await createTag(fixture.db, 'Preview isolation');
    await addCaseTag(fixture.db, { caseId: context.case_id, tagId: tag.id });
    await addCaseQuestionTag(fixture.db, { caseQuestionId: context.case_question_id, tagId: tag.id });

    fixture.sqlite.prepare(`
      INSERT INTO preview_sessions (id, user_id, status, expires_at)
      VALUES (?, ?, 'active', ?)
    `).run('preview-tag-session', 'preview-tag-user', 4102444800000);
    fixture.sqlite.prepare(`
      INSERT INTO cases (id, title, preview_session_id, is_active)
      VALUES (?, ?, ?, 1)
    `).run('preview-tag-case', 'Disposable tagged Case', 'preview-tag-session');
    fixture.sqlite.prepare(`
      INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active)
      VALUES (?, ?, ?, 1)
    `).run('preview-tag-prompt', 'Disposable tagged prompt?', 'preview-tag-session');
    fixture.sqlite.prepare(`
      INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run('preview-tag-question', 'preview-tag-case', 'preview-tag-prompt', 'Disposable answer');
    fixture.sqlite.prepare('INSERT INTO case_tags (case_id, tag_id) VALUES (?, ?)').run('preview-tag-case', tag.id);
    fixture.sqlite.prepare('INSERT INTO case_question_tags (case_question_id, tag_id) VALUES (?, ?)').run('preview-tag-question', tag.id);

    const row = (await listTags(fixture.db)).find((item) => item.id === tag.id);
    assert.ok(row);
    assert.equal(row.activeCaseCount, 1);
    assert.equal(row.activeCaseQuestionCount, 1);

    assert.equal((await listTaggableCases(fixture.db)).some((item) => item.id === 'preview-tag-case'), false);
    assert.equal((await listTaggableCaseQuestions(fixture.db)).some((item) => item.id === 'preview-tag-question'), false);
    assert.equal((await listCaseTagAssignments(fixture.db)).some((item) => item.caseId === 'preview-tag-case'), false);
    assert.equal(
      (await listCaseQuestionTagAssignments(fixture.db)).some((item) => item.caseQuestionId === 'preview-tag-question'),
      false
    );
    assert.equal((await listCurrentCaseTagAssignments(fixture.db)).some((item) => item.caseId === 'preview-tag-case'), false);
    assert.equal((await listCurrentPromptTagAssignments(fixture.db)).some((item) => item.promptId === 'preview-tag-prompt'), false);

    await assert.rejects(
      () => addCaseTag(fixture.db, { caseId: 'preview-tag-case', tagId: tag.id }),
      (error) => error instanceof TagInputError && /production Case/i.test(error.message)
    );
    await assert.rejects(
      () => addCaseQuestionTag(fixture.db, { caseQuestionId: 'preview-tag-question', tagId: tag.id }),
      (error) => error instanceof TagInputError && /production Case Question/i.test(error.message)
    );
  } finally {
    fixture.sqlite.close();
  }
});
