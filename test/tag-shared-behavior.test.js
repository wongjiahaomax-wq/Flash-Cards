import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { getReview, startReview } from '../src/lib/server/db/learning.js';
import { pickReviewQuestions, resolveQuestionPool } from '../src/lib/server/learning/questions.js';
import {
  createSharedQuestion,
  setSharedQuestionActive,
  SharedQuestionInputError
} from '../src/lib/server/db/shared-question-library.js';
import { applyCurrentSchema } from './current-schema.js';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  const d1 = /** @type {any} */ ({
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
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  });
  return { sqlite, db: createDb(/** @type {D1Database} */ (d1)) };
}

/** @param {DatabaseSync} sqlite @param {{ mode?: string, count?: number|null }} [options] */
function addCase(sqlite, { mode = 'all', count = null } = {}) {
  sqlite.prepare('INSERT INTO concepts (id, name, slug, is_active) VALUES (?, ?, ?, 1)')
    .run('stage-b-topic', 'Stage B Topic', 'stage-b-topic');
  sqlite.prepare(`INSERT INTO cases (id, title, question_selection_mode, question_count, is_active)
    VALUES (?, ?, ?, ?, 1)`).run('stage-b-case', 'Stage B Case', mode, count);
  sqlite.prepare('INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, ?, ?)')
    .run('stage-b-case', 'stage-b-topic', 'primary');
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} name @param {boolean} [active] */
function addTag(sqlite, id, name, active = true) {
  sqlite.prepare('INSERT INTO tags (id, name, normalized_name, is_active) VALUES (?, ?, ?, ?)')
    .run(id, name, name.toLowerCase(), active ? 1 : 0);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} wording @param {boolean} [active] */
function addPrompt(sqlite, id, wording, active = true) {
  sqlite.prepare('INSERT INTO question_prompts (id, prompt_md, is_active) VALUES (?, ?, ?)')
    .run(id, wording, active ? 1 : 0);
}

/** @param {DatabaseSync} sqlite @param {{ id: string, promptId: string, tagId: string, answer?: string, active?: boolean }} input */
function addShared(sqlite, { id, promptId, tagId, answer = 'Shared answer', active = true }) {
  sqlite.prepare(`INSERT INTO shared_questions (id, question_prompt_id, answer_md, reuse_scope_tag_id, is_active)
    VALUES (?, ?, ?, ?, ?)`).run(id, promptId, answer, tagId, active ? 1 : 0);
}

/** @param {DatabaseSync} sqlite @param {string} tagId */
function attachCaseTag(sqlite, tagId) {
  sqlite.prepare('INSERT INTO case_tags (case_id, tag_id) VALUES (?, ?)').run('stage-b-case', tagId);
}

/** @param {ReturnType<typeof fixture>} f */
async function review(f) {
  const reviewId = await startReview({ db: f.db, userId: 'learner-stage-b', conceptId: 'stage-b-topic', questionPoolMode: 'expanded', rng: () => 0 });
  assert.ok(reviewId);
  const row = await getReview(f.db, reviewId, 'learner-stage-b');
  assert.ok(row);
  return { reviewId, row };
}

test('matching active Case Tag makes Shared Question eligible; nonmatching and descriptive Tags do not', async () => {
  const f = fixture();
  try {
    addCase(f.sqlite);
    addTag(f.sqlite, 'scope', 'Scope');
    addTag(f.sqlite, 'descriptive', 'Descriptive');
    attachCaseTag(f.sqlite, 'scope');
    addPrompt(f.sqlite, 'matching-prompt', 'Matching?');
    addPrompt(f.sqlite, 'wrong-scope-prompt', 'Wrong scope?');
    addPrompt(f.sqlite, 'descriptive-only-prompt', 'Descriptive only?');
    addShared(f.sqlite, { id: 'matching', promptId: 'matching-prompt', tagId: 'scope' });
    addShared(f.sqlite, { id: 'wrong-scope', promptId: 'wrong-scope-prompt', tagId: 'descriptive' });
    addShared(f.sqlite, { id: 'descriptive-only', promptId: 'descriptive-only-prompt', tagId: 'descriptive' });
    f.sqlite.prepare('INSERT INTO shared_question_tags (shared_question_id, tag_id) VALUES (?, ?)')
      .run('descriptive-only', 'scope');

    const { row } = await review(f);
    assert.deepEqual(row.questions.map((q) => q.prompt), ['Matching?']);
    assert.equal(row.questions[0].sourceType, 'tag_shared');
    assert.equal(row.questions[0].sourceSharedQuestionId, 'matching');
  } finally { f.sqlite.close(); }
});

test('inactive Shared Question, inactive Prompt, and inactive attached Tag are excluded', async () => {
  const f = fixture();
  try {
    addCase(f.sqlite);
    addTag(f.sqlite, 'scope', 'Scope');
    attachCaseTag(f.sqlite, 'scope');
    addPrompt(f.sqlite, 'inactive-shared-prompt', 'Inactive Shared?');
    addPrompt(f.sqlite, 'inactive-prompt', 'Inactive Prompt?', false);
    addPrompt(f.sqlite, 'tag-disabled-prompt', 'Tag disabled?');
    addShared(f.sqlite, { id: 'inactive-shared', promptId: 'inactive-shared-prompt', tagId: 'scope', active: false });
    addShared(f.sqlite, { id: 'inactive-prompt-shared', promptId: 'inactive-prompt', tagId: 'scope' });
    addShared(f.sqlite, { id: 'tag-disabled-shared', promptId: 'tag-disabled-prompt', tagId: 'scope' });
    f.sqlite.prepare('UPDATE tags SET is_active = 0 WHERE id = ?').run('scope');

    await assert.rejects(
      () => review(f),
      /no eligible questions available for Expanded Learning/
    );
  } finally { f.sqlite.close(); }
});

test('resolver deduplicates by Prompt ID and context-specific sources outrank tag-shared', () => {
  const common = { questionPromptId: 'same', promptMd: 'Same?', answerMd: 'Shared', sourceSharedQuestionId: 'shared-1' };
  const pool = resolveQuestionPool({
    ancestorConceptQuestions: [{ questionPromptId: 'ancestor-only', promptMd: 'Ancestor?', answerMd: 'Ancestor', inheritToDescendants: true, distance: 1, sourceConceptId: 'parent' }],
    tagSharedQuestions: [common, { questionPromptId: 'ancestor-only', promptMd: 'Ancestor?', answerMd: 'Tag beats ancestor', sourceSharedQuestionId: 'shared-2' }],
    studyConceptQuestions: [{ questionPromptId: 'same', promptMd: 'Same?', answerMd: 'Study', sourceConceptId: 'study' }],
    caseQuestions: [{ questionPromptId: 'same', promptMd: 'Same?', answerMd: 'Case' }],
    stimulusGroupQuestions: [{ questionPromptId: 'same', promptMd: 'Same?', answerMd: 'Group', stimulusGroupId: 'group' }],
    stimulusOptionQuestions: [{ questionPromptId: 'same', promptMd: 'Same?', answerMd: 'Option', stimulusGroupId: 'group', stimulusOptionId: 'option' }]
  });
  assert.equal(pool.filter((q) => q.questionPromptId === 'same').length, 1);
  assert.equal(pool.find((q) => q.questionPromptId === 'same')?.sourceType, 'stimulus_option');
  assert.equal(pool.find((q) => q.questionPromptId === 'same')?.answerMd, 'Option');
  assert.equal(pool.find((q) => q.questionPromptId === 'ancestor-only')?.sourceType, 'tag_shared');
});

test('multiple matching Shared Questions participate normally in Automatic, All, and Fixed selection', async () => {
  /** @type {{ mode: 'automatic'|'all'|'fixed', count: number|null, expected: number }[]} */
  const scenarios = [
    { mode: 'automatic', count: null, expected: 3 },
    { mode: 'all', count: null, expected: 5 },
    { mode: 'fixed', count: 2, expected: 2 }
  ];
  for (const { mode, count, expected } of scenarios) {
    const f = fixture();
    try {
      addCase(f.sqlite, { mode, count });
      addTag(f.sqlite, 'scope', 'Scope');
      attachCaseTag(f.sqlite, 'scope');
      for (let index = 1; index <= 5; index += 1) {
        addPrompt(f.sqlite, `p${index}`, `Question ${index}?`);
        addShared(f.sqlite, { id: `s${index}`, promptId: `p${index}`, tagId: 'scope', answer: `Answer ${index}` });
      }
      const { row } = await review(f);
      assert.equal(row.questions.length, expected, mode);
      assert.equal(new Set(row.questions.map((q) => q.prompt)).size, expected);
    } finally { f.sqlite.close(); }
  }
});

test('Review snapshots tag-shared provenance and stays stable when Tag curation later changes', async () => {
  const f = fixture();
  try {
    addCase(f.sqlite);
    addTag(f.sqlite, 'scope', 'Scope');
    addTag(f.sqlite, 'other', 'Other');
    attachCaseTag(f.sqlite, 'scope');
    addPrompt(f.sqlite, 'p', 'Stable wording?');
    addShared(f.sqlite, { id: 'shared', promptId: 'p', tagId: 'scope', answer: 'Stable answer' });
    f.sqlite.prepare('INSERT INTO shared_question_tags (shared_question_id, tag_id) VALUES (?, ?)').run('shared', 'other');

    const { reviewId, row: before } = await review(f);
    assert.equal(before.questions[0].sourceType, 'tag_shared');
    assert.equal(before.questions[0].sourceSharedQuestionId, 'shared');
    assert.equal(before.questions[0].prompt, 'Stable wording?');
    assert.equal(before.questions[0].answer, 'Stable answer');

    f.sqlite.prepare('DELETE FROM case_tags WHERE case_id = ? AND tag_id = ?').run('stage-b-case', 'scope');
    f.sqlite.prepare('DELETE FROM shared_question_tags WHERE shared_question_id = ?').run('shared');
    f.sqlite.prepare('UPDATE shared_questions SET reuse_scope_tag_id = ? WHERE id = ?').run('other', 'shared');
    f.sqlite.prepare('UPDATE tags SET name = ? WHERE id = ?').run('Renamed Other', 'other');

    const after = await getReview(f.db, reviewId, 'learner-stage-b');
    assert.deepEqual(after?.questions, before.questions);
  } finally { f.sqlite.close(); }
});

test('Preview-owned Prompt cannot become a production Shared Question through Admin helper', async () => {
  const f = fixture();
  try {
    addTag(f.sqlite, 'scope', 'Scope');
    f.sqlite.prepare(`INSERT INTO preview_sessions (id, user_id, status, expires_at)
      VALUES ('preview', 'user', 'active', 4102444800000)`).run();
    f.sqlite.prepare(`INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active)
      VALUES ('preview-prompt', 'Preview?', 'preview', 1)`).run();

    await assert.rejects(
      () => createSharedQuestion(f.db, {
        questionPromptId: 'preview-prompt',
        answerMd: 'No',
        reuseScopeTagId: 'scope',
        descriptiveTagIds: []
      }),
      (error) => error instanceof SharedQuestionInputError && /Preview-owned/i.test(error.message)
    );
  } finally { f.sqlite.close(); }
});

test('archiving removes a Shared Question from eligibility and reactivation restores it', async () => {
  const f = fixture();
  try {
    addCase(f.sqlite);
    addTag(f.sqlite, 'scope', 'Scope');
    attachCaseTag(f.sqlite, 'scope');
    addPrompt(f.sqlite, 'p', 'Archive me?');
    addShared(f.sqlite, { id: 'shared', promptId: 'p', tagId: 'scope' });
    await setSharedQuestionActive(f.db, { id: 'shared', isActive: false });
    await assert.rejects(
      () => review(f),
      /no eligible questions available for Expanded Learning/
    );
    await setSharedQuestionActive(f.db, { id: 'shared', isActive: true });
    assert.equal((await review(f)).row.questions.length, 1);
  } finally { f.sqlite.close(); }
});

test('Fixed selection never exceeds requested count when Shared Questions enlarge the pool', () => {
  const pool = Array.from({ length: 8 }, (_, index) => ({ questionPromptId: `q${index}` }));
  assert.equal(pickReviewQuestions(pool, { mode: 'fixed', count: 2, rng: () => 0 }).length, 2);
  assert.equal(pickReviewQuestions(pool, { mode: 'all', count: 2, rng: () => 0 }).length, 8);
  assert.equal(pickReviewQuestions(pool, { mode: 'automatic', count: 3, rng: () => 0 }).length, 3);
});