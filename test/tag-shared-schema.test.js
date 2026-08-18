import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { resolveQuestionPool } from '../src/lib/server/learning/questions.js';

const migrationUrls = [
  '../drizzle/0000_dashing_centennial.sql',
  '../drizzle/0001_better_auth.sql',
  '../drizzle/0002_optional_stimulus_groups.sql',
  '../drizzle/0003_multi_topic_study_routing.sql',
  '../drizzle/0004_resumable_import_jobs.sql',
  '../drizzle/0005_tag_foundation.sql',
  '../drizzle/0006_preview_admin_workspace.sql',
  '../drizzle/0007_image_collections.sql',
  '../drizzle/0008_tag_shared_questions.sql'
];

const migrations = migrationUrls.map((path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '')
);

function newDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  return sqlite;
}

/**
 * @param {DatabaseSync} sqlite
 * @param {number} [through]
 */
function applyMigrations(sqlite, through = migrations.length - 1) {
  for (let index = 0; index <= through; index += 1) sqlite.exec(migrations[index]);
  assert.equal(sqlite.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
  assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
}

/**
 * @param {DatabaseSync} sqlite
 * @param {string[]} promptIds
 */
function seedReviewParents(sqlite, promptIds) {
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, is_active)
    VALUES ('topic', 'Topic', 'topic', 1);
    INSERT INTO cases (id, title, question_selection_mode, is_active)
    VALUES ('case', 'Case', 'automatic', 1);
    INSERT INTO case_concepts (case_id, concept_id, role)
    VALUES ('case', 'topic', 'primary');
    INSERT INTO assets (id, type, storage_key, mime_type, is_active)
    VALUES ('asset', 'image', 'schema/asset.png', 'image/png', 1);
    INSERT INTO stimulus_groups (
      id, case_id, name, display_order, selection_count,
      specific_question_mode, is_active
    ) VALUES ('group', 'case', 'Group', 0, 1, 'none', 1);
    INSERT INTO stimulus_group_options (
      id, stimulus_group_id, asset_id, display_order, is_active
    ) VALUES ('option', 'group', 'asset', 0, 1);
    INSERT INTO reviews (
      id, user_id, case_id, primary_concept_id, study_concept_id,
      case_title_snapshot, vignette_snapshot_md, status
    ) VALUES (
      'review', 'learner', 'case', 'topic', 'topic',
      'Case snapshot', 'Vignette snapshot', 'started'
    );
  `);

  const statement = sqlite.prepare(`
    INSERT INTO question_prompts (id, prompt_md, is_active)
    VALUES (?, ?, 1)
  `);
  for (const promptId of promptIds) statement.run(promptId, `Prompt ${promptId}`);
}

/**
 * @param {DatabaseSync} sqlite
 * @param {string} id
 * @param {string} [name]
 */
function insertTag(sqlite, id, name = id) {
  sqlite.prepare(`
    INSERT INTO tags (id, name, normalized_name, is_active)
    VALUES (?, ?, ?, 1)
  `).run(id, name, name.toLocaleLowerCase());
}

/**
 * @param {DatabaseSync} sqlite
 * @param {{ id: string, promptId: string, scopeTagId: string, answer?: string, active?: number }} input
 */
function insertSharedQuestion(sqlite, input) {
  const {
    id,
    promptId,
    scopeTagId,
    answer = `Answer ${input.id}`,
    active = 1
  } = input;
  sqlite.prepare(`
    INSERT INTO shared_questions (
      id, question_prompt_id, answer_md, reuse_scope_tag_id, is_active
    ) VALUES (?, ?, ?, ?, ?)
  `).run(id, promptId, answer, scopeTagId, active);
}

test('fresh database migrates through 0008 with the Stage B schema foundation', () => {
  const sqlite = newDatabase();
  try {
    applyMigrations(sqlite);

    const tables = new Set(
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
    );
    assert.equal(tables.has('shared_questions'), true);
    assert.equal(tables.has('shared_question_tags'), true);

    const sharedColumns = sqlite.prepare("PRAGMA table_info('shared_questions')").all().map((row) => row.name);
    assert.deepEqual(sharedColumns, [
      'id',
      'question_prompt_id',
      'answer_md',
      'reuse_scope_tag_id',
      'is_active',
      'created_at',
      'updated_at'
    ]);
    assert.equal(sharedColumns.includes('preview_session_id'), false);

    const reviewColumns = sqlite.prepare("PRAGMA table_info('review_questions')").all().map((row) => row.name);
    assert.equal(reviewColumns.includes('source_shared_question_id'), true);

    const reviewIndexes = new Set(
      sqlite.prepare("PRAGMA index_list('review_questions')").all().map((row) => row.name)
    );
    assert.equal(reviewIndexes.has('review_questions_review_order_unique'), true);
    assert.equal(reviewIndexes.has('review_questions_review_prompt_unique'), true);
    assert.equal(reviewIndexes.has('review_questions_prompt_idx'), true);
    assert.equal(reviewIndexes.has('review_questions_shared_question_idx'), true);
  } finally {
    sqlite.close();
  }
});

test('0008 upgrades current Reviews without changing existing Review Question semantics', () => {
  const sqlite = newDatabase();
  try {
    applyMigrations(sqlite, 7);
    seedReviewParents(sqlite, ['p-case', 'p-concept', 'p-ancestor', 'p-group', 'p-option']);

    sqlite.exec(`
      INSERT INTO review_questions (
        id, review_id, question_prompt_id, source_type, source_concept_id,
        source_stimulus_group_id, source_stimulus_option_id, display_order,
        prompt_snapshot_md, answer_snapshot_md
      ) VALUES
        ('rq-case', 'review', 'p-case', 'case', NULL, NULL, NULL, 0,
          'Case prompt\nexact', 'Case answer — exact'),
        ('rq-concept', 'review', 'p-concept', 'concept', 'topic', NULL, NULL, 1,
          'Concept prompt', 'Concept answer'),
        ('rq-ancestor', 'review', 'p-ancestor', 'ancestor_concept', 'topic', NULL, NULL, 2,
          'Ancestor prompt', 'Ancestor answer'),
        ('rq-group', 'review', 'p-group', 'stimulus_group', NULL, 'group', NULL, 3,
          'Group prompt', 'Group answer'),
        ('rq-option', 'review', 'p-option', 'stimulus_option', NULL, 'group', 'option', 4,
          'Option prompt', 'Option answer');
    `);

    const semanticColumns = `
      id, review_id, question_prompt_id, source_type, source_concept_id,
      source_stimulus_group_id, source_stimulus_option_id, display_order,
      prompt_snapshot_md, answer_snapshot_md
    `;
    const before = sqlite.prepare(`
      SELECT ${semanticColumns}
      FROM review_questions
      ORDER BY display_order
    `).all().map((row) => ({ ...row }));

    sqlite.exec(migrations[8]);

    const after = sqlite.prepare(`
      SELECT ${semanticColumns}
      FROM review_questions
      ORDER BY display_order
    `).all().map((row) => ({ ...row }));
    assert.deepEqual(after, before);

    const sharedProvenance = sqlite.prepare(`
      SELECT source_shared_question_id
      FROM review_questions
      ORDER BY display_order
    `).all();
    assert.deepEqual(sharedProvenance.map((row) => row.source_shared_question_id), [null, null, null, null, null]);

    assert.deepEqual(
      after.map((row) => row.source_type),
      ['case', 'concept', 'ancestor_concept', 'stimulus_group', 'stimulus_option']
    );
    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    sqlite.close();
  }
});

test('tag_shared Review provenance accepts a valid Shared Question and rejects invalid foreign keys', () => {
  const sqlite = newDatabase();
  try {
    applyMigrations(sqlite);
    seedReviewParents(sqlite, ['shared-prompt', 'review-prompt']);
    insertTag(sqlite, 'scope', 'Scope');
    insertSharedQuestion(sqlite, {
      id: 'shared',
      promptId: 'shared-prompt',
      scopeTagId: 'scope'
    });

    sqlite.prepare(`
      INSERT INTO review_questions (
        id, review_id, question_prompt_id, source_type,
        source_shared_question_id, display_order,
        prompt_snapshot_md, answer_snapshot_md
      ) VALUES (?, 'review', ?, 'tag_shared', ?, 0, ?, ?)
    `).run('rq-shared', 'shared-prompt', 'shared', 'Shared prompt snapshot', 'Shared answer snapshot');

    assert.deepEqual(
      { ...sqlite.prepare(`
        SELECT source_type, source_shared_question_id
        FROM review_questions WHERE id = 'rq-shared'
      `).get() },
      { source_type: 'tag_shared', source_shared_question_id: 'shared' }
    );

    assert.throws(
      () => insertSharedQuestion(sqlite, {
        id: 'bad-scope',
        promptId: 'review-prompt',
        scopeTagId: 'missing-tag'
      }),
      /FOREIGN KEY constraint failed/
    );

    assert.throws(
      () => sqlite.prepare(`
        INSERT INTO shared_question_tags (shared_question_id, tag_id)
        VALUES ('shared', 'missing-tag')
      `).run(),
      /FOREIGN KEY constraint failed/
    );

    assert.throws(
      () => sqlite.prepare(`
        INSERT INTO review_questions (
          id, review_id, question_prompt_id, source_type,
          source_shared_question_id, display_order,
          prompt_snapshot_md, answer_snapshot_md
        ) VALUES (
          'rq-bad-fk', 'review', 'review-prompt', 'tag_shared',
          'missing-shared', 1, 'Bad', 'Bad'
        )
      `).run(),
      /FOREIGN KEY constraint failed/
    );
  } finally {
    sqlite.close();
  }
});

test('only one active Shared Question may use a prompt while archived history may coexist', () => {
  const sqlite = newDatabase();
  try {
    applyMigrations(sqlite);
    sqlite.exec(`
      INSERT INTO question_prompts (id, prompt_md, is_active)
      VALUES ('prompt', 'Reusable wording', 1);
    `);
    insertTag(sqlite, 'scope', 'Scope');

    insertSharedQuestion(sqlite, {
      id: 'archived-1',
      promptId: 'prompt',
      scopeTagId: 'scope',
      active: 0
    });
    insertSharedQuestion(sqlite, {
      id: 'active',
      promptId: 'prompt',
      scopeTagId: 'scope',
      active: 1
    });
    insertSharedQuestion(sqlite, {
      id: 'archived-2',
      promptId: 'prompt',
      scopeTagId: 'scope',
      active: 0
    });

    assert.throws(
      () => insertSharedQuestion(sqlite, {
        id: 'second-active',
        promptId: 'prompt',
        scopeTagId: 'scope',
        active: 1
      }),
      /UNIQUE constraint failed/
    );

    const rows = sqlite.prepare(`
      SELECT id, is_active FROM shared_questions
      WHERE question_prompt_id = 'prompt'
      ORDER BY id
    `).all();
    assert.equal(rows.length, 3);
    assert.equal(rows.filter((row) => row.is_active === 1).length, 1);
    assert.equal(rows.filter((row) => row.is_active === 0).length, 2);
  } finally {
    sqlite.close();
  }
});

test('descriptive Shared Question Tags are many-to-many and independent from the single reuse scope', () => {
  const sqlite = newDatabase();
  try {
    applyMigrations(sqlite);
    sqlite.exec(`
      INSERT INTO question_prompts (id, prompt_md, is_active)
      VALUES ('prompt', 'What does this teach?', 1);
    `);
    insertTag(sqlite, 'scope', 'Hypocalcaemia');
    insertTag(sqlite, 'teaches-a', 'Prolonged QTc');
    insertTag(sqlite, 'teaches-b', 'Electrolytes');
    insertSharedQuestion(sqlite, {
      id: 'shared',
      promptId: 'prompt',
      scopeTagId: 'scope'
    });

    sqlite.exec(`
      INSERT INTO shared_question_tags (shared_question_id, tag_id)
      VALUES ('shared', 'teaches-a'), ('shared', 'teaches-b');
    `);

    const shared = sqlite.prepare(`
      SELECT reuse_scope_tag_id FROM shared_questions WHERE id = 'shared'
    `).get();
    assert.equal(shared?.reuse_scope_tag_id, 'scope');

    const descriptiveTags = sqlite.prepare(`
      SELECT tag_id FROM shared_question_tags
      WHERE shared_question_id = 'shared'
      ORDER BY tag_id
    `).all().map((row) => row.tag_id);
    assert.deepEqual(descriptiveTags, ['teaches-a', 'teaches-b']);
    assert.equal(descriptiveTags.includes('scope'), false);

    assert.throws(
      () => sqlite.prepare(`
        INSERT INTO shared_questions (
          id, question_prompt_id, answer_md, reuse_scope_tag_id, is_active
        ) VALUES ('missing-scope', 'prompt', 'Answer', NULL, 0)
      `).run(),
      /NOT NULL constraint failed/
    );
  } finally {
    sqlite.close();
  }
});

test('schema foundation does not change current learner Question resolution', () => {
  const prompt = 'same-prompt';
  const pool = resolveQuestionPool({
    ancestorConceptQuestions: [{
      questionPromptId: prompt,
      promptMd: 'Prompt',
      answerMd: 'Ancestor',
      inheritToDescendants: true,
      distance: 1,
      sourceConceptId: 'ancestor'
    }],
    studyConceptQuestions: [{
      questionPromptId: prompt,
      promptMd: 'Prompt',
      answerMd: 'Study Topic',
      sourceConceptId: 'study'
    }],
    caseQuestions: [{
      questionPromptId: prompt,
      promptMd: 'Prompt',
      answerMd: 'Case'
    }],
    stimulusGroupQuestions: [{
      questionPromptId: prompt,
      promptMd: 'Prompt',
      answerMd: 'Group',
      stimulusGroupId: 'group'
    }],
    stimulusOptionQuestions: [{
      questionPromptId: prompt,
      promptMd: 'Prompt',
      answerMd: 'Option',
      stimulusGroupId: 'group',
      stimulusOptionId: 'option'
    }]
  });

  assert.deepEqual(pool, [{
    questionPromptId: prompt,
    promptMd: 'Prompt',
    answerMd: 'Option',
    sourceType: 'stimulus_option',
    sourceConceptId: null,
    sourceStimulusGroupId: 'group',
    sourceStimulusOptionId: 'option',
    stimulusGroupId: 'group',
    stimulusOptionId: 'option'
  }]);
});
