import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { listActiveTagOptions, listAllTagOptions } from '../src/lib/server/db/library-options.js';
import {
  TAG_WORKSPACE_LIKE_PATTERN_BYTES,
  TAG_WORKSPACE_LIKE_TERM_BYTES,
  TAG_WORKSPACE_OVERVIEW_LIMIT,
  TAG_WORKSPACE_SELECTOR_LIMIT,
  TAG_WORKSPACE_TAG_LIMIT,
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

const textEncoder = new TextEncoder();

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
          if (params.length > 100) {
            throw new Error(`D1 bound parameter limit exceeded in fixture: ${params.length}`);
          }
          for (const param of params) {
            if (
              typeof param === 'string'
              && param.startsWith('%')
              && param.endsWith('%')
              && textEncoder.encode(param).byteLength > TAG_WORKSPACE_LIKE_PATTERN_BYTES
            ) {
              throw new Error(`D1 LIKE pattern limit exceeded in fixture: ${textEncoder.encode(param).byteLength} bytes`);
            }
          }
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
  sqlite.prepare('INSERT INTO tags (id, name, normalized_name, is_active) VALUES (?, ?, ?, 0)').run('inactive-tag', 'Inactive Tag', 'inactive tag');
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
  caseTagInsert.run('case-001', 'inactive-tag');
  questionTagInsert.run('question-001', 'inactive-tag');

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

test('Tags workspace Tag library and System enrichment stay below the D1 bound-parameter ceiling', async () => {
  const f = fixture();
  try {
    seedWorkspace(f.sqlite);
    const tagInsert = f.sqlite.prepare('INSERT INTO tags (id, name, normalized_name, is_active) VALUES (?, ?, ?, 1)');
    for (let index = 0; index < 105; index += 1) {
      const suffix = String(index).padStart(3, '0');
      tagInsert.run(`bulk-${suffix}`, `Bulk Tag ${suffix}`, `bulk tag ${suffix}`);
    }
    tagInsert.run('boundary-tag', 'ZZZ Boundary Tag', 'zzz boundary tag');

    const visibleTags = await listTagWorkspaceTags(f.db);
    assert.equal(visibleTags.length, TAG_WORKSPACE_TAG_LIMIT);
    assert.equal(visibleTags.some((tag) => tag.id === 'boundary-tag'), false);

    const searchedTags = await listTagWorkspaceTags(f.db, { search: 'Boundary Tag' });
    assert.deepEqual(searchedTags.map((tag) => tag.id), ['boundary-tag']);

    const allTagIds = (await listAllTagOptions(f.db)).map((tag) => tag.id);
    assert.ok(allTagIds.length > 100);
    await assert.doesNotReject(() => listTagWorkspaceSystemsForTags(f.db, allTagIds));
  } finally {
    f.sqlite.close();
  }
});

test('Tags workspace LIKE searches stay within the D1 50-byte pattern ceiling', async () => {
  const f = fixture();
  try {
    seedWorkspace(f.sqlite);
    assert.equal(TAG_WORKSPACE_LIKE_TERM_BYTES, TAG_WORKSPACE_LIKE_PATTERN_BYTES - 2);

    const asciiTerm = 'a'.repeat(TAG_WORKSPACE_LIKE_TERM_BYTES);
    const unicodeTerm = '界'.repeat(TAG_WORKSPACE_LIKE_TERM_BYTES / 3);
    assert.equal(textEncoder.encode(`%${asciiTerm}%`).byteLength, TAG_WORKSPACE_LIKE_PATTERN_BYTES);
    assert.equal(textEncoder.encode(`%${unicodeTerm}%`).byteLength, TAG_WORKSPACE_LIKE_PATTERN_BYTES);

    f.sqlite.prepare('INSERT INTO tags (id, name, normalized_name, is_active) VALUES (?, ?, ?, 1)')
      .run('long-search-tag', `${asciiTerm} Tag`, `${asciiTerm} tag`);
    f.sqlite.prepare('INSERT INTO cases (id, title, is_active) VALUES (?, ?, 1)')
      .run('long-search-case', `${asciiTerm} Case`);
    f.sqlite.prepare('INSERT INTO question_prompts (id, prompt_md, is_active) VALUES (?, ?, 1)')
      .run('long-search-prompt', `${unicodeTerm} Prompt`);
    f.sqlite.prepare('INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES (?, ?, ?, ?, 1)')
      .run('long-search-question', 'long-search-case', 'long-search-prompt', 'Boundary answer');

    const tagResults = await listTagWorkspaceTags(f.db, { search: 'a'.repeat(80) });
    assert.deepEqual(tagResults.map((row) => row.id), ['long-search-tag']);

    const caseResults = await listTagWorkspaceCaseOptions(f.db, { search: 'a'.repeat(80) });
    assert.deepEqual(caseResults.map((row) => row.id), ['long-search-case']);

    const questionResults = await listTagWorkspaceCaseQuestionOptions(f.db, { search: '界'.repeat(30) });
    assert.deepEqual(questionResults.map((row) => row.id), ['long-search-question']);
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

test('inactive Tags remain reachable for selected-Tag curation while mutation options stay active-only', async () => {
  const f = fixture();
  try {
    seedWorkspace(f.sqlite);
    const [activeOptions, allOptions, inactiveCases, inactiveQuestions] = await Promise.all([
      listActiveTagOptions(f.db),
      listAllTagOptions(f.db),
      listTagWorkspaceCaseAssignments(f.db, { tagId: 'inactive-tag' }),
      listTagWorkspaceQuestionAssignments(f.db, { tagId: 'inactive-tag' })
    ]);
    assert.equal(activeOptions.some((tag) => tag.id === 'inactive-tag'), false);
    assert.equal(allOptions.some((tag) => tag.id === 'inactive-tag' && tag.isActive === false), true);
    assert.deepEqual(inactiveCases.map((row) => row.caseId), ['case-001']);
    assert.deepEqual(inactiveQuestions.map((row) => row.caseQuestionId), ['question-001']);
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
  assert.match(source, /listAllTagOptions/);
  assert.match(source, /tagLimit: TAG_WORKSPACE_TAG_LIMIT/);
  assert.match(source, /searchInputMaxLength: TAG_WORKSPACE_LIKE_TERM_BYTES/);

  const page = readFileSync(new URL('../src/routes/admin/tags/+page.svelte', import.meta.url), 'utf8');
  assert.match(page, /data\.filterTags/);
  assert.match(page, /data\.activeTags/);
  assert.match(page, /Search to reach Tags outside the current window/);
  for (const searchName of ['q', 'case_q', 'question_q']) {
    assert.match(page, new RegExp(`name="${searchName}"[^>]*maxlength=\\{data\\.readModel\\.searchInputMaxLength\\}`));
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
    assert.match(page, new RegExp(action.replace(/[?]/g, '\\?')));
  }
});
