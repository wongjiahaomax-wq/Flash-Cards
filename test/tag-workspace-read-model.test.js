import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  TAG_WORKSPACE_OVERVIEW_LIMIT,
  TAG_WORKSPACE_SELECTOR_LIMIT,
  listTagWorkspaceCaseAssignments,
  listTagWorkspaceCaseOptions,
  listTagWorkspaceCaseQuestionOptions,
  listTagWorkspaceQuestionAssignments,
  listTagWorkspaceSharedQuestionUsages,
  listTagWorkspaceSystemExposures,
  listTagWorkspaceSystemsForTags,
  listTagWorkspaceTags
} from '../src/lib/server/db/tag-workspace-read-model.js';
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

/** @param {DatabaseSync} sqlite */
function seedWorkspace(sqlite) {
  sqlite.prepare('INSERT INTO tags (id, name, normalized_name, is_active) VALUES (?, ?, ?, 1)').run('target', 'Target Tag', 'target tag');
  sqlite.prepare('INSERT INTO tags (id, name, normalized_name, is_active) VALUES (?, ?, ?, 1)').run('other', 'Other Tag', 'other tag');
  sqlite.prepare("INSERT INTO concepts (id, name, slug, kind, is_active) VALUES ('system-a', 'System A', 'system-a', 'system', 1)").run();
  sqlite.prepare("INSERT INTO concepts (id, name, slug, kind, is_active) VALUES ('system-b', 'System B', 'system-b', 'system', 1)").run();
  sqlite.prepare("INSERT INTO system_tags (system_concept_id, tag_id, display_order) VALUES ('system-a', 'target', 0)").run();
  sqlite.prepare("INSERT INTO system_tags (system_concept_id, tag_id, display_order) VALUES ('system-b', 'other', 0)").run();

  const caseInsert = sqlite.prepare('INSERT INTO cases (id, title, is_active) VALUES (?, ?, 1)');
  const promptInsert = sqlite.prepare('INSERT INTO question_prompts (id, prompt_md, is_active) VALUES (?, ?, 1)');
  const questionInsert = sqlite.prepare('INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES (?, ?, ?, ?, 1)');
  const caseTagInsert = sqlite.prepare('INSERT INTO case_tags (case_id, tag_id) VALUES (?, ?)');
  const questionTagInsert = sqlite.prepare('INSERT INTO case_question_tags (case_question_id, tag_id) VALUES (?, ?)');

  for (let index = 0; index < TAG_WORKSPACE_SELECTOR_LIMIT + 5; index += 1) {
    const suffix = String(index).padStart(3, '0');
    const caseId = `case-${suffix}`;
    const promptId = `prompt-${suffix}`;
    const questionId = `question-${suffix}`;
    caseInsert.run(caseId, `Case ${suffix}`);
    promptInsert.run(promptId, `Question ${suffix}?`);
    questionInsert.run(questionId, caseId, promptId, `Answer ${suffix}`);
    caseTagInsert.run(caseId, 'target');
    questionTagInsert.run(questionId, 'target');
  }
  caseTagInsert.run('case-000', 'other');
  questionTagInsert.run('question-000', 'other');

  sqlite.prepare("INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview', 'preview-user', 'active', 4102444800000)").run();
  sqlite.prepare("INSERT INTO cases (id, title, preview_session_id, is_active) VALUES ('preview-case', 'Preview Case', 'preview', 1)").run();
  sqlite.prepare("INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active) VALUES ('preview-prompt', 'Preview Question?', 'preview', 1)").run();
  sqlite.prepare("INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES ('preview-question', 'preview-case', 'preview-prompt', 'Preview answer', 1)").run();
  caseTagInsert.run('preview-case', 'target');
  questionTagInsert.run('preview-question', 'target');

  sqlite.prepare("INSERT INTO cases (id, title, is_active) VALUES ('inactive-case', 'Inactive Case', 0)").run();
  sqlite.prepare("INSERT INTO question_prompts (id, prompt_md, is_active) VALUES ('inactive-prompt', 'Inactive Question?', 0)").run();
  sqlite.prepare("INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES ('inactive-question', 'inactive-case', 'inactive-prompt', 'Inactive answer', 0)").run();

  sqlite.prepare("INSERT INTO question_prompts (id, prompt_md, is_active) VALUES ('shared-prompt-target', 'Target shared?', 1)").run();
  sqlite.prepare("INSERT INTO question_prompts (id, prompt_md, is_active) VALUES ('shared-prompt-other', 'Other shared?', 1)").run();
  sqlite.prepare("INSERT INTO shared_questions (id, question_prompt_id, answer_md, reuse_scope_tag_id, is_active) VALUES ('shared-target', 'shared-prompt-target', 'Target shared answer', 'target', 1)").run();
  sqlite.prepare("INSERT INTO shared_questions (id, question_prompt_id, answer_md, reuse_scope_tag_id, is_active) VALUES ('shared-other', 'shared-prompt-other', 'Other shared answer', 'other', 1)").run();
  sqlite.prepare("INSERT INTO shared_question_tags (shared_question_id, tag_id) VALUES ('shared-other', 'target')").run();
}

test('Tags workspace selectors are bounded/searchable and preserve Production eligibility', async () => {
  const f = fixture();
  try {
    seedWorkspace(f.sqlite);
    const caseOptions = await listTagWorkspaceCaseOptions(f.db);
    assert.equal(caseOptions.length, TAG_WORKSPACE_SELECTOR_LIMIT);
    assert.equal(caseOptions.some((row) => row.id === 'preview-case' || row.id === 'inactive-case'), false);

    const lateCase = await listTagWorkspaceCaseOptions(f.db, { search: 'Case 064' });
    assert.deepEqual(lateCase.map((row) => row.id), ['case-064']);

    const questionOptions = await listTagWorkspaceCaseQuestionOptions(f.db);
    assert.equal(questionOptions.length, TAG_WORKSPACE_SELECTOR_LIMIT);
    assert.equal(questionOptions.some((row) => row.id === 'preview-question' || row.id === 'inactive-question'), false);
    assert.equal(Object.hasOwn(questionOptions[0], 'answerMd'), false, 'selector should not read answer content');

    const lateQuestionByCase = await listTagWorkspaceCaseQuestionOptions(f.db, { search: 'Case 064' });
    assert.deepEqual(lateQuestionByCase.map((row) => row.id), ['question-064']);
    const lateQuestionByPrompt = await listTagWorkspaceCaseQuestionOptions(f.db, { search: 'Question 064' });
    assert.deepEqual(lateQuestionByPrompt.map((row) => row.id), ['question-064']);
  } finally {
    f.sqlite.close();
  }
});

test('Tags workspace relationship reads are exact for a selected Tag and bounded otherwise', async () => {
  const f = fixture();
  try {
    seedWorkspace(f.sqlite);

    const caseOverview = await listTagWorkspaceCaseAssignments(f.db);
    assert.equal(caseOverview.length, TAG_WORKSPACE_OVERVIEW_LIMIT);
    const selectedCases = await listTagWorkspaceCaseAssignments(f.db, { tagId: 'target' });
    assert.equal(selectedCases.length, TAG_WORKSPACE_SELECTOR_LIMIT + 5);
    assert.equal(selectedCases.every((row) => row.tagId === 'target'), true);
    assert.equal(selectedCases.some((row) => row.caseId === 'preview-case'), false);

    const questionOverview = await listTagWorkspaceQuestionAssignments(f.db);
    assert.equal(questionOverview.length, TAG_WORKSPACE_OVERVIEW_LIMIT);
    const selectedQuestions = await listTagWorkspaceQuestionAssignments(f.db, { tagId: 'target' });
    assert.equal(selectedQuestions.length, TAG_WORKSPACE_SELECTOR_LIMIT + 5);
    assert.equal(selectedQuestions.every((row) => row.tagId === 'target'), true);
    assert.equal(selectedQuestions.some((row) => row.caseQuestionId === 'preview-question'), false);

    const sharedUsages = await listTagWorkspaceSharedQuestionUsages(f.db, { tagId: 'target' });
    assert.deepEqual(
      sharedUsages.map((row) => [row.sharedQuestionId, row.usageType, row.tagId]),
      [
        ['shared-other', 'descriptive', 'target'],
        ['shared-target', 'reuse_scope', 'target']
      ]
    );

    const selectedExposure = await listTagWorkspaceSystemExposures(f.db, { tagId: 'target' });
    assert.deepEqual(selectedExposure.map((row) => [row.systemId, row.tagId]), [['system-a', 'target']]);
    const tagSystems = await listTagWorkspaceSystemsForTags(f.db, ['target']);
    assert.deepEqual(tagSystems.map((row) => [row.systemId, row.tagId]), [['system-a', 'target']]);
  } finally {
    f.sqlite.close();
  }
});

test('Tags workspace usage counts aggregate Production rows without Preview leakage', async () => {
  const f = fixture();
  try {
    seedWorkspace(f.sqlite);
    const target = (await listTagWorkspaceTags(f.db)).find((tag) => tag.id === 'target');
    assert.ok(target);
    assert.equal(target.activeCaseCount, TAG_WORKSPACE_SELECTOR_LIMIT + 5);
    assert.equal(target.activeCaseQuestionCount, TAG_WORKSPACE_SELECTOR_LIMIT + 5);
    assert.equal(target.activeSharedReuseScopeCount, 1);
    assert.equal(target.activeSharedDescriptiveCount, 1);
  } finally {
    f.sqlite.close();
  }
});

test('Tags page normal load uses the bounded read model while existing Tag mutations remain wired', () => {
  const source = readFileSync(new URL('../src/routes/admin/tags/+page.server.js', import.meta.url), 'utf8');
  for (const broadRead of [
    'listTaggableCases',
    'listTaggableCaseQuestions',
    'listCaseTagAssignments',
    'listCaseQuestionTagAssignments',
    'listSharedQuestionTagUsages',
    'listSystemTagExposures',
    'listActiveTags'
  ]) {
    assert.equal(source.includes(broadRead), false, `${broadRead} must not remain in the normal Tags-page load path`);
  }
  for (const action of [
    '?/createTag',
    '?/renameTag',
    '?/setTagActive',
    '?/addCaseTag',
    '?/removeCaseTag',
    '?/addCaseQuestionTag',
    '?/removeCaseQuestionTag'
  ]) {
    const page = readFileSync(new URL('../src/routes/admin/tags/+page.svelte', import.meta.url), 'utf8');
    assert.match(page, new RegExp(action.replace(/[?]/g, '\\?')));
  }
});
