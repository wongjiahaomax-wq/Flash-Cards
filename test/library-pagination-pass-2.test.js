import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getCaseLibraryPage, parseCaseLibraryPage } from '../src/lib/server/db/case-library.js';
import { createDb } from '../src/lib/server/db/index.js';
import { getQuestionPromptDetail } from '../src/lib/server/db/question-library.js';
import { getQuestionLibraryPage, parseQuestionLibraryPage } from '../src/lib/server/db/question-library-page.js';

const migrationSql = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql',
  '0010_reusable_image_reactivation_guard.sql',
  '0011_asset_supersession.sql',
  '0012_archive_stimulus_options.sql',
  '0013_review_assets_asset_lookup.sql',
  '0014_review_question_pool_mode.sql',
  '0015_contextual_system_topic_tag_navigation.sql'
]
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  /** @type {{ sql: string, params: any[] }[]} */
  const statements = [];
  const d1 = /** @type {any} */ ({
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
        bind(...params) {
          statements.push({ sql, params });
          return {
            async all() {
              return { results: sqlite.prepare(sql).all(...params) };
            },
            async raw() {
              return sqlite.prepare(sql).all(...params).map((row) => Object.values(row));
            },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return {
                success: true,
                results: [],
                meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
              };
            }
          };
        }
      };
    },
    /** @param {any[]} queries */
    async batch(queries) {
      return Promise.all(queries.map((query) => query.run()));
    }
  });
  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite, statements };
}

/** @param {ReturnType<typeof createLearningDb>} fixture */
function seedCases(fixture) {
  const { sqlite } = fixture;
  sqlite.exec("INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview-1', 'user-1', 'active', 4102444800000)");
  sqlite.exec("INSERT INTO concepts (id, name, slug, is_active) VALUES ('topic-a', 'Topic A', 'topic-a', 1)");
  sqlite.exec("INSERT INTO tags (id, name, normalized_name, is_active) VALUES ('tag-a', 'Alpha', 'alpha', 1), ('tag-b', 'Beta', 'beta', 1), ('tag-off', 'Inactive', 'inactive', 0)");

  for (let index = 1; index <= 65; index += 1) {
    const id = `case-${String(index).padStart(3, '0')}`;
    const title = `Case ${String(index).padStart(3, '0')}`;
    sqlite.prepare("INSERT INTO cases (id, title, is_active) VALUES (?, ?, 1)").run(id, title);
    sqlite.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, 'topic-a', 'primary')").run(id);
    if (index % 2 === 1) sqlite.prepare("INSERT INTO case_tags (case_id, tag_id) VALUES (?, 'tag-a')").run(id);
    if (index === 1) sqlite.prepare("INSERT INTO case_tags (case_id, tag_id) VALUES (?, 'tag-b')").run(id);
    if (index === 2) sqlite.prepare("INSERT INTO case_tags (case_id, tag_id) VALUES (?, 'tag-off')").run(id);
  }

  sqlite.exec("INSERT INTO cases (id, title, is_active) VALUES ('case-inactive', 'Case inactive', 0)");
  sqlite.exec("INSERT INTO cases (id, title, preview_session_id, is_active) VALUES ('case-preview', 'Case preview', 'preview-1', 1)");
}

/** @param {ReturnType<typeof createLearningDb>} fixture */
function seedQuestions(fixture) {
  const { sqlite } = fixture;
  sqlite.exec("INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview-1', 'user-1', 'active', 4102444800000)");
  sqlite.exec("INSERT INTO concepts (id, name, slug, is_active) VALUES ('topic-a', 'Topic A', 'topic-a', 1), ('topic-off', 'Topic Off', 'topic-off', 0)");
  sqlite.exec("INSERT INTO tags (id, name, normalized_name, is_active) VALUES ('tag-a', 'Alpha', 'alpha', 1)");
  sqlite.exec("INSERT INTO cases (id, title, is_active) VALUES ('case-a', 'Active Case', 1), ('case-off', 'Inactive Case', 0)");
  sqlite.exec("INSERT INTO cases (id, title, preview_session_id, is_active) VALUES ('case-preview', 'Preview Case', 'preview-1', 1)");
  sqlite.exec("INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-a', 'topic-a', 'primary'), ('case-off', 'topic-a', 'primary'), ('case-preview', 'topic-a', 'primary')");
  sqlite.exec("INSERT INTO assets (id, type, storage_key, mime_type, is_active) VALUES ('asset-a', 'image', 'a.png', 'image/png', 1), ('asset-b', 'image', 'b.png', 'image/png', 1)");

  const productionPrompts = [
    ['prompt-case', 'Case prompt'],
    ['prompt-concept', 'Concept prompt'],
    ['prompt-group', 'Group prompt'],
    ['prompt-option', 'Option prompt'],
    ['prompt-shared', 'Shared prompt'],
    ['prompt-asset', 'Asset prompt'],
    ['prompt-removed', 'Removed option prompt'],
    ['prompt-inactive-case', 'Inactive case prompt'],
    ['prompt-inactive-topic', 'Inactive topic prompt'],
    ['prompt-same-a', 'Same wording'],
    ['prompt-same-b', 'Same wording']
  ];
  for (const [id, wording] of productionPrompts) {
    sqlite.prepare("INSERT INTO question_prompts (id, prompt_md, is_active) VALUES (?, ?, 1)").run(id, wording);
  }
  sqlite.exec("INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active) VALUES ('prompt-preview', 'Preview prompt', 'preview-1', 1)");
  for (let index = 1; index <= 65; index += 1) {
    sqlite.prepare("INSERT INTO question_prompts (id, prompt_md, is_active) VALUES (?, ?, 1)").run(
      `prompt-filler-${String(index).padStart(3, '0')}`,
      `ZZ filler ${String(index).padStart(3, '0')}`
    );
  }

  sqlite.exec("INSERT INTO concept_questions (id, concept_id, question_prompt_id, answer_md, is_active) VALUES ('conceptq-a', 'topic-a', 'prompt-concept', 'concept-answer-token', 1), ('conceptq-off', 'topic-off', 'prompt-inactive-topic', 'inactive-topic-answer-token', 1)");
  sqlite.exec("INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES ('caseq-a', 'case-a', 'prompt-case', 'case-answer-token', 1), ('caseq-off', 'case-off', 'prompt-inactive-case', 'inactive-case-answer-token', 1), ('caseq-preview', 'case-preview', 'prompt-preview', 'preview-answer-token', 1)");
  sqlite.exec("INSERT INTO case_question_tags (case_question_id, tag_id) VALUES ('caseq-a', 'tag-a')");

  sqlite.exec("INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, is_active) VALUES ('group-a', 'case-a', 'Group', 0, 1, 'none', 1)");
  sqlite.exec("INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active) VALUES ('groupq-a', 'group-a', 'prompt-group', 'group-answer-token', 1)");
  sqlite.exec("INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, is_active, removed_from_case) VALUES ('option-a', 'group-a', 'asset-a', 0, 1, 0), ('option-removed', 'group-a', 'asset-b', 1, 1, 1)");
  sqlite.exec("INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active) VALUES ('optionq-a', 'option-a', 'prompt-option', 'option-answer-token', 1), ('optionq-removed', 'option-removed', 'prompt-removed', 'removed-answer-token', 1)");

  sqlite.exec("INSERT INTO shared_questions (id, question_prompt_id, answer_md, reuse_scope_tag_id, is_active) VALUES ('sharedq-a', 'prompt-shared', 'shared-answer-token', 'tag-a', 1)");
  sqlite.exec("INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active) VALUES ('assetq-a', 'asset-a', 'prompt-asset', 'asset-answer-token', 1)");
}

function questionFilters() {
  return { search: '', topicId: '', scope: /** @type {'all'} */ ('all'), tagId: '' };
}

test('Case Library is bounded, counted, SQL-filtered, deterministic, and page-enriched', async () => {
  const fixture = createLearningDb();
  try {
    seedCases(fixture);
    fixture.sqlite.exec("INSERT INTO concepts (id, name, slug, is_active) VALUES ('topic-b', 'Topic B', 'topic-b', 1)");
    fixture.sqlite.exec("INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-005', 'topic-b', 'primary')");

    fixture.statements.length = 0;
    const first = await getCaseLibraryPage(fixture.db, { search: '', tagId: '' }, { page: 1, pageSize: 10 });
    assert.equal(first.rows.length, 10);
    assert.equal(first.totalCount, 65);
    assert.equal(first.totalPages, 7);
    assert.deepEqual(first.rows[0].tags, [{ id: 'tag-a', name: 'Alpha' }, { id: 'tag-b', name: 'Beta' }]);
    assert.equal(first.rows[1].tags.length, 0, 'inactive Tags are not displayed');
    assert.equal(first.rows.find((row) => row.id === 'case-005')?.conceptId, 'topic-a', 'malformed duplicate primaries are enriched deterministically without duplicating the Case');

    const primaryQuery = fixture.statements.find((statement) => /from "case_concepts"/.test(statement.sql) && / in \(/.test(statement.sql));
    assert.ok(primaryQuery, 'expected page-bounded primary Topic enrichment');
    const primaryCaseIds = primaryQuery.params.filter((value) => typeof value === 'string' && value.startsWith('case-'));
    assert.deepEqual(primaryCaseIds, first.rows.map((row) => row.id));
    assert.ok(!primaryCaseIds.includes('case-065'));

    const tagQuery = fixture.statements.find((statement) => /from "case_tags"/.test(statement.sql) && / in \(/.test(statement.sql));
    assert.ok(tagQuery, 'expected page-bounded Case Tag enrichment');
    const queriedCaseIds = tagQuery.params.filter((value) => typeof value === 'string' && value.startsWith('case-'));
    assert.deepEqual(queriedCaseIds, first.rows.map((row) => row.id));
    assert.ok(!queriedCaseIds.includes('case-065'));

    const second = await getCaseLibraryPage(fixture.db, { search: '', tagId: '' }, { page: 2, pageSize: 10 });
    const adjacent = [...first.rows, ...second.rows].map((row) => row.id);
    assert.equal(new Set(adjacent).size, adjacent.length);
    assert.deepEqual(adjacent, Array.from({ length: 20 }, (_, index) => `case-${String(index + 1).padStart(3, '0')}`));

    const searched = await getCaseLibraryPage(fixture.db, { search: 'Case 025', tagId: '' }, { pageSize: 10 });
    assert.deepEqual(searched.rows.map((row) => row.id), ['case-025']);
    assert.equal(searched.totalCount, 1);

    const tagged = await getCaseLibraryPage(fixture.db, { search: '', tagId: 'tag-a' }, { pageSize: 60 });
    assert.equal(tagged.totalCount, 33);
    assert.ok(tagged.rows.every((row) => row.tags.some((tag) => tag.id === 'tag-a')));
    assert.ok(!tagged.rows.some((row) => row.id === 'case-preview' || row.id === 'case-inactive'));
  } finally {
    fixture.sqlite.close();
  }
});

test('Case and Question page parsing handles invalid and out-of-range values safely', async () => {
  assert.equal(parseCaseLibraryPage(new URLSearchParams('page=bogus')), 1);
  assert.equal(parseCaseLibraryPage(new URLSearchParams('page=-2')), 1);
  assert.equal(parseQuestionLibraryPage(new URLSearchParams('page=1.5')), 1);

  const fixture = createLearningDb();
  try {
    seedCases(fixture);
    const result = await getCaseLibraryPage(fixture.db, { search: '', tagId: '' }, { page: 999, pageSize: 10 });
    assert.equal(result.page, result.totalPages);
    assert.equal(result.rows.length, 5);
  } finally {
    fixture.sqlite.close();
  }
});

test('Question Library preserves search, Topic, scopes, Tags, reusable usage, and isolation semantics', async () => {
  const fixture = createLearningDb();
  try {
    seedQuestions(fixture);
    const searches = new Map([
      ['case-answer-token', 'prompt-case'],
      ['concept-answer-token', 'prompt-concept'],
      ['group-answer-token', 'prompt-group'],
      ['option-answer-token', 'prompt-option'],
      ['shared-answer-token', 'prompt-shared'],
      ['asset-answer-token', 'prompt-asset']
    ]);
    for (const [search, expectedId] of searches) {
      const page = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search }, { pageSize: 60 });
      assert.deepEqual(page.rows.map((row) => row.id), [expectedId], `answer search should find ${expectedId}`);
    }
    assert.deepEqual(
      (await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: 'Case prompt' }, { pageSize: 60 })).rows.map((row) => row.id),
      ['prompt-case', 'prompt-inactive-case']
    );

    for (const hiddenAnswer of ['removed-answer-token', 'inactive-case-answer-token', 'inactive-topic-answer-token', 'preview-answer-token']) {
      const page = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: hiddenAnswer }, { pageSize: 60 });
      assert.equal(page.totalCount, 0, `${hiddenAnswer} must not match current production usage`);
    }

    const topic = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), topicId: 'topic-a' }, { pageSize: 60 });
    assert.deepEqual(new Set(topic.rows.map((row) => row.id)), new Set(['prompt-case', 'prompt-concept', 'prompt-group', 'prompt-option']));

    const shared = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), scope: 'shared' }, { pageSize: 60 });
    assert.deepEqual(new Set(shared.rows.map((row) => row.id)), new Set(['prompt-asset', 'prompt-concept', 'prompt-shared']));
    const caseScoped = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), scope: 'case' }, { pageSize: 60 });
    assert.deepEqual(new Set(caseScoped.rows.map((row) => row.id)), new Set(['prompt-case', 'prompt-group', 'prompt-option']));

    const tagged = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), tagId: 'tag-a' }, { pageSize: 60 });
    assert.deepEqual(tagged.rows.map((row) => row.id), ['prompt-case']);
    assert.deepEqual(tagged.rows[0].tags, [{ id: 'tag-a', name: 'Alpha' }]);

    const page = await getQuestionLibraryPage(fixture.db, questionFilters(), { pageSize: 60 });
    assert.equal(page.totalCount, 76);
    const byId = new Map(page.rows.map((row) => [row.id, row]));
    assert.equal(byId.get('prompt-case')?.caseUsageCount, 1);
    assert.equal(byId.get('prompt-group')?.stimulusGroupUsageCount, 1);
    assert.equal(byId.get('prompt-option')?.stimulusOptionUsageCount, 1);
    assert.equal(byId.get('prompt-shared')?.sharedQuestionUsageCount, 1);
    assert.equal(byId.get('prompt-shared')?.hasSharedUsage, true);
    assert.equal(byId.get('prompt-asset')?.assetQuestionUsageCount, 1);
    assert.equal(byId.get('prompt-asset')?.hasSharedUsage, true);
    assert.equal(byId.get('prompt-removed')?.usageCount, 0);
    assert.equal(byId.get('prompt-inactive-case')?.usageCount, 0);
    assert.equal(byId.get('prompt-inactive-topic')?.usageCount, 0);
    assert.ok(!page.rows.some((row) => row.id === 'prompt-preview'));
  } finally {
    fixture.sqlite.close();
  }
});

test('production Prompt usage on a Preview Case remains excluded even in a malformed legacy state', async () => {
  const fixture = createLearningDb();
  try {
    seedQuestions(fixture);
    fixture.sqlite.exec("INSERT INTO question_prompts (id, prompt_md, is_active) VALUES ('prompt-preview-leak', 'Preview leak production prompt', 1)");

    assert.throws(() => {
      fixture.sqlite.exec("INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES ('caseq-preview-leak', 'case-preview', 'prompt-preview-leak', 'preview-production-answer-token', 1)");
    }, 'the normal database ownership trigger should reject production Prompt usage on a Preview Case');

    fixture.sqlite.exec('DROP TRIGGER case_questions_preview_prompt_ownership_insert');
    fixture.sqlite.exec("INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES ('caseq-preview-leak', 'case-preview', 'prompt-preview-leak', 'preview-production-answer-token', 1)");
    fixture.sqlite.exec("INSERT INTO case_question_tags (case_question_id, tag_id) VALUES ('caseq-preview-leak', 'tag-a')");

    const visiblePrompt = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: 'Preview leak production prompt' }, { pageSize: 60 });
    assert.equal(visiblePrompt.totalCount, 1, 'the production Prompt itself remains a valid library row');
    assert.equal(visiblePrompt.rows[0]?.usageCount, 0);
    assert.equal(visiblePrompt.rows[0]?.caseUsageCount, 0);
    assert.deepEqual(visiblePrompt.rows[0]?.tags, []);

    const caseScope = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: 'Preview leak production prompt', scope: 'case' }, { pageSize: 60 });
    assert.equal(caseScope.totalCount, 0, 'Preview Case usage must not satisfy scope=case');

    const answerSearch = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: 'preview-production-answer-token' }, { pageSize: 60 });
    assert.equal(answerSearch.totalCount, 0, 'Preview Case answer content must not be searchable in production');

    const topic = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: 'Preview leak production prompt', topicId: 'topic-a' }, { pageSize: 60 });
    assert.equal(topic.totalCount, 0, 'Preview Case usage must not create a production Topic association');

    const tag = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: 'Preview leak production prompt', tagId: 'tag-a' }, { pageSize: 60 });
    assert.equal(tag.totalCount, 0, 'Preview Case usage must not satisfy production Question Tag filtering');
  } finally {
    fixture.sqlite.close();
  }
});

test('inactive stimulus parents and question relationships do not count as current Question usage', async () => {
  const fixture = createLearningDb();
  try {
    seedQuestions(fixture);

    /**
     * @param {string} promptId
     * @param {string} promptSearch
     * @param {string} answerSearch
     * @param {'stimulusGroupUsageCount' | 'stimulusOptionUsageCount'} usageField
     */
    async function assertExcluded(promptId, promptSearch, answerSearch, usageField) {
      const answerPage = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: answerSearch }, { pageSize: 60 });
      assert.equal(answerPage.totalCount, 0, `${answerSearch} must not be searchable while its relationship is inactive`);

      const promptPage = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: promptSearch }, { pageSize: 60 });
      const row = promptPage.rows.find((item) => item.id === promptId);
      assert.ok(row, `expected production Prompt ${promptId} to remain visible`);
      assert.equal(row.usageCount, 0);
      if (usageField === 'stimulusGroupUsageCount') assert.equal(row.stimulusGroupUsageCount, 0);
      else assert.equal(row.stimulusOptionUsageCount, 0);

      const caseScope = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: promptSearch, scope: 'case' }, { pageSize: 60 });
      assert.ok(!caseScope.rows.some((item) => item.id === promptId), `${promptId} must not satisfy scope=case`);
    }

    fixture.sqlite.exec("UPDATE stimulus_groups SET is_active = 0 WHERE id = 'group-a'");
    await assertExcluded('prompt-group', 'Group prompt', 'group-answer-token', 'stimulusGroupUsageCount');
    await assertExcluded('prompt-option', 'Option prompt', 'option-answer-token', 'stimulusOptionUsageCount');

    fixture.sqlite.exec("UPDATE stimulus_groups SET is_active = 1 WHERE id = 'group-a'");
    fixture.sqlite.exec("UPDATE stimulus_group_questions SET is_active = 0 WHERE id = 'groupq-a'");
    await assertExcluded('prompt-group', 'Group prompt', 'group-answer-token', 'stimulusGroupUsageCount');

    fixture.sqlite.exec("UPDATE stimulus_group_questions SET is_active = 1 WHERE id = 'groupq-a'");
    fixture.sqlite.exec("UPDATE stimulus_option_questions SET is_active = 0 WHERE id = 'optionq-a'");
    await assertExcluded('prompt-option', 'Option prompt', 'option-answer-token', 'stimulusOptionUsageCount');
  } finally {
    fixture.sqlite.close();
  }
});

test('Question pagination is bounded/deterministic and relationship queries only receive visible Prompt IDs', async () => {
  const fixture = createLearningDb();
  try {
    seedQuestions(fixture);
    const first = await getQuestionLibraryPage(fixture.db, questionFilters(), { page: 1, pageSize: 8 });
    const second = await getQuestionLibraryPage(fixture.db, questionFilters(), { page: 2, pageSize: 8 });
    assert.equal(first.rows.length, 8);
    assert.equal(first.totalCount, 76);
    assert.equal(new Set([...first.rows, ...second.rows].map((row) => row.id)).size, 16);

    const sameWording = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: 'Same wording' }, { pageSize: 60 });
    assert.deepEqual(sameWording.rows.map((row) => row.id), ['prompt-same-a', 'prompt-same-b']);

    fixture.statements.length = 0;
    const bounded = await getQuestionLibraryPage(fixture.db, questionFilters(), { page: 1, pageSize: 3 });
    const visible = new Set(bounded.rows.map((row) => row.id));
    const relationshipQueries = fixture.statements.filter(
      (statement) => / in \(/.test(statement.sql) && /(concept_questions|case_questions|stimulus_group_questions|stimulus_option_questions|shared_questions|asset_questions|case_question_tags)/.test(statement.sql)
    );
    assert.ok(relationshipQueries.length >= 7);
    for (const statement of relationshipQueries) {
      const promptIds = statement.params.filter((value) => typeof value === 'string' && value.startsWith('prompt-'));
      assert.ok(promptIds.length > 0);
      assert.ok(promptIds.every((id) => visible.has(id)), `off-page Prompt materialised: ${promptIds.join(', ')}`);
    }
  } finally {
    fixture.sqlite.close();
  }
});

test('Question detail retains historical/inactive relationships while the list uses current-only counts', async () => {
  const fixture = createLearningDb();
  try {
    seedQuestions(fixture);
    const list = await getQuestionLibraryPage(fixture.db, { ...questionFilters(), search: 'Inactive case prompt' }, { pageSize: 60 });
    assert.equal(list.rows[0]?.usageCount, 0);

    const detail = await getQuestionPromptDetail(fixture.db, 'prompt-inactive-case');
    assert.ok(detail);
    assert.equal(detail.usageCount, 0);
    assert.equal(detail.totalUsageCount, 1);
    assert.equal(detail.caseUsages.length, 1);
    assert.equal(Boolean(detail.caseUsages[0].caseIsActive), false);
  } finally {
    fixture.sqlite.close();
  }
});

test('library pagination links preserve filters and filter forms naturally reset to page one', () => {
  const casePage = readFileSync(new URL('../src/routes/admin/cases/+page.svelte', import.meta.url), 'utf8');
  assert.match(casePage, /params\.set\('q', data\.caseFilters\.search\)/);
  assert.match(casePage, /params\.set\('tag', data\.caseFilters\.tagId\)/);
  assert.doesNotMatch(casePage, /<input[^>]+name="page"/);

  const questionPage = readFileSync(new URL('../src/routes/admin/questions/+page.svelte', import.meta.url), 'utf8');
  assert.match(questionPage, /params\.set\('q', data\.filters\.search\)/);
  assert.match(questionPage, /params\.set\('topic', data\.filters\.topicId\)/);
  assert.match(questionPage, /params\.set\('scope', data\.filters\.scope\)/);
  assert.match(questionPage, /params\.set\('tag', data\.filters\.tagId\)/);
  assert.doesNotMatch(questionPage, /<input[^>]+name="page"/);
});