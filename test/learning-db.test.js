import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  completeReview,
  continueReviewWithExpandedLearning,
  getReview,
  revealReview,
  startReview
} from '../src/lib/server/db/learning.js';
import { QuestionPoolUnavailableError } from '../src/lib/server/learning/question-pool-mode.ts';
import { buildSeedSql } from '../scripts/seed-content.mjs';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */
/** @typedef {{ prepare: (sql: string) => any, batch: (statements: any[]) => Promise<any[]> }} TestD1 */

const migrationBeforeQuestionPoolModeSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0005_tag_foundation.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0007_image_collections.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0008_tag_shared_questions.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0009_reusable_image_questions.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0012_archive_stimulus_options.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');

const questionPoolModeMigrationSql = readFileSync(
  new URL('../drizzle/0014_review_question_pool_mode.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

const migrationSql = `${migrationBeforeQuestionPoolModeSql}\n${questionPoolModeMigrationSql}`;

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(buildSeedSql());
  let batches = 0;
  /** @type {TestD1} */
  const d1 = {
    prepare(sql) {
      return {
        /** @param {...any} params */
        bind(...params) {
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
    async batch(statements) {
      batches += 1;
      return Promise.all(statements.map((statement) => statement.run()));
    }
  };
  const learningDb = /** @type {LearningDb} */ (
    createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))
  );
  return { db: learningDb, sqlite, get batches() { return batches; } };
}

test('explicit Expanded start batches and persists ordered questions/assets plus mode', async () => {
  const fixture = createLearningDb();
  try {
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', questionPoolMode: 'expanded', rng: () => 0 });
    assert.ok(reviewId);
    assert.equal(fixture.batches, 1);

    const review = await getReview(fixture.db, reviewId, 'learner-1');
    assert.ok(review);
    assert.equal(review.status, 'started');
    assert.equal(review.questionPoolMode, 'expanded');
    assert.equal(review.primaryConceptId, 'seed-anterior-stemi');
    assert.equal(review.studyConceptId, 'seed-anterior-stemi');
    assert.equal(review.assets.length, 1);
    assert.equal(review.assets[0].storageKey, 'seed/anterior-stemi-a.png');
    assert.equal(review.questions.length, 3);
    assert.deepEqual(review.questions.map((question) => question.displayOrder), [0, 1, 2]);
    assert.ok(review.questions.some((question) => question.answer.includes('reciprocal inferior')));
  } finally {
    fixture.sqlite.close();
  }
});

test('explicit Original start persists core mode and excludes reusable Topic questions', async () => {
  const fixture = createLearningDb();
  try {
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', questionPoolMode: 'core', rng: () => 0 });
    assert.ok(reviewId);

    const review = await getReview(fixture.db, reviewId, 'learner-1');
    assert.ok(review);
    assert.equal(review.questionPoolMode, 'core');
    assert.equal(review.questions.length, 1);
    assert.deepEqual(review.questions.map((question) => question.sourceType), ['case']);
    assert.equal(review.questions[0].prompt, 'Describe this ECG.');
  } finally {
    fixture.sqlite.close();
  }
});

test('completion history changes Case selection but never silently changes the requested mode', async () => {
  const fixture = createLearningDb();
  try {
    const firstId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', questionPoolMode: 'core', rng: () => 0 });
    assert.ok(firstId);
    assert.equal(await revealReview(fixture.db, firstId, 'learner-1'), true);
    assert.equal(await completeReview(fixture.db, firstId, 'learner-1', 'good'), true);
    const first = await getReview(fixture.db, firstId, 'learner-1');
    assert.equal(first?.status, 'completed');
    assert.equal(first?.questionPoolMode, 'core');

    const secondId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', questionPoolMode: 'core', rng: () => 0 });
    assert.ok(secondId);
    const second = await getReview(fixture.db, secondId, 'learner-1');
    assert.ok(second);
    assert.notEqual(second.caseId, first.caseId);
    assert.equal(second.questionPoolMode, 'core');

    const expandedId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', questionPoolMode: 'expanded', rng: () => 0 });
    assert.ok(expandedId);
    const expanded = await getReview(fixture.db, expandedId, 'learner-1');
    assert.equal(expanded?.questionPoolMode, 'expanded');
  } finally {
    fixture.sqlite.close();
  }
});

test('Original start with no Core questions fails without creating or silently expanding a Review', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec(`
      INSERT INTO concepts (id, name, slug, description_md, parent_id, is_active, created_at, updated_at)
      VALUES ('only-reusable-topic', 'Only reusable', 'only-reusable', NULL, NULL, 1, 1, 1);
      INSERT INTO cases (id, title, vignette_md, is_active, created_at, updated_at)
      VALUES ('only-reusable-case', 'Only reusable case', NULL, 1, 1, 1);
      INSERT INTO case_concepts (case_id, concept_id, role, created_at)
      VALUES ('only-reusable-case', 'only-reusable-topic', 'primary', 1);
      INSERT INTO question_prompts (id, prompt_md, is_active, created_at, updated_at)
      VALUES ('only-reusable-prompt', 'Reusable only?', 1, 1, 1);
      INSERT INTO concept_questions (id, concept_id, question_prompt_id, answer_md, inherit_to_descendants, is_active, created_at, updated_at)
      VALUES ('only-reusable-question', 'only-reusable-topic', 'only-reusable-prompt', 'Reusable answer', 0, 1, 1, 1);
    `);

    await assert.rejects(
      startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'only-reusable-topic', questionPoolMode: 'core', rng: () => 0 }),
      (error) => error instanceof QuestionPoolUnavailableError && /no Original questions/.test(error.message)
    );
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM reviews WHERE case_id = 'only-reusable-case'").get().count, 0);

    const expandedId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'only-reusable-topic', questionPoolMode: 'expanded', rng: () => 0 });
    assert.ok(expandedId);
    const expanded = await getReview(fixture.db, expandedId, 'learner-1');
    assert.equal(expanded?.questionPoolMode, 'expanded');
    assert.equal(expanded?.questions.length, 1);
    assert.equal(expanded?.questions[0].sourceType, 'concept');
  } finally {
    fixture.sqlite.close();
  }
});

test('Continue with Expanded Learning creates a new Review for the same Case and Study Topic', async () => {
  const fixture = createLearningDb();
  try {
    const originalId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', questionPoolMode: 'core', rng: () => 0 });
    assert.ok(originalId);
    await revealReview(fixture.db, originalId, 'learner-1');
    await completeReview(fixture.db, originalId, 'learner-1', 'good');
    const original = await getReview(fixture.db, originalId, 'learner-1');
    assert.ok(original);

    const expandedId = await continueReviewWithExpandedLearning({ db: fixture.db, userId: 'learner-1', reviewId: originalId, rng: () => 0 });
    assert.ok(expandedId);
    assert.notEqual(expandedId, originalId);
    const expanded = await getReview(fixture.db, expandedId, 'learner-1');
    assert.ok(expanded);
    assert.equal(expanded.caseId, original.caseId);
    assert.equal(expanded.studyConceptId, original.studyConceptId);
    assert.equal(expanded.questionPoolMode, 'expanded');
    assert.ok(expanded.questions.length > original.questions.length);
  } finally {
    fixture.sqlite.close();
  }
});

test('Expanded continuation enforces Review ownership', async () => {
  const fixture = createLearningDb();
  try {
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', questionPoolMode: 'core', rng: () => 0 });
    assert.ok(reviewId);
    await revealReview(fixture.db, reviewId, 'learner-1');
    await completeReview(fixture.db, reviewId, 'learner-1', 'good');

    await assert.rejects(
      continueReviewWithExpandedLearning({ db: fixture.db, userId: 'learner-2', reviewId, rng: () => 0 }),
      /Review not found/
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Review question and media snapshots remain immutable after source edits', async () => {
  const fixture = createLearningDb();
  try {
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', questionPoolMode: 'core', rng: () => 0 });
    assert.ok(reviewId);
    const before = await getReview(fixture.db, reviewId, 'learner-1');
    assert.ok(before);

    fixture.sqlite.exec(`
      UPDATE case_questions SET answer_md = 'Edited canonical answer' WHERE id = 'seed-caseq-anterior-a-describe';
      UPDATE assets SET storage_key = 'seed/replaced.png' WHERE id = 'seed-asset-anterior-a';
    `);

    const after = await getReview(fixture.db, reviewId, 'learner-1');
    assert.equal(after?.questions[0].answer, before.questions[0].answer);
    assert.equal(after?.assets[0].storageKey, before.assets[0].storageKey);
  } finally {
    fixture.sqlite.close();
  }
});

test('Review snapshot contains every attached Asset in configured order', async () => {
  const fixture = createLearningDb();
  try {
    const reviewId = await startReview({
      db: fixture.db,
      userId: 'learner-1',
      conceptId: 'seed-pityriasis-rosea',
      questionPoolMode: 'expanded',
      rng: () => 0
    });
    assert.ok(reviewId);
    const review = await getReview(fixture.db, reviewId, 'learner-1');
    assert.ok(review);
    assert.deepEqual(
      review.assets.map((asset) => ({ assetId: asset.assetId, displayOrder: asset.displayOrder, caption: asset.caption })),
      [
        { assetId: 'seed-asset-pityriasis-herald', displayOrder: 0, caption: 'Herald patch' },
        { assetId: 'seed-asset-pityriasis-trunk', displayOrder: 1, caption: 'Later truncal eruption' }
      ]
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('0014 backfills historical Reviews to expanded without rewriting Review children', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(migrationBeforeQuestionPoolModeSql);
    sqlite.exec(buildSeedSql());
    sqlite.exec(`
      INSERT INTO reviews (
        id, user_id, case_id, primary_concept_id, study_concept_id,
        case_title_snapshot, vignette_snapshot_md, status, rating,
        started_at, revealed_at, completed_at
      ) VALUES (
        'historical-review', 'learner-1', 'seed-anterior-a', 'seed-anterior-stemi', 'seed-anterior-stemi',
        'Historical title', 'Historical vignette', 'started', NULL,
        1, NULL, NULL
      );
      INSERT INTO review_questions (
        id, review_id, question_prompt_id, source_type, source_concept_id,
        source_stimulus_group_id, source_stimulus_option_id, source_asset_question_id,
        source_shared_question_id, display_order, prompt_snapshot_md, answer_snapshot_md
      ) VALUES (
        'historical-question', 'historical-review', 'seed-prompt-describe-ecg', 'case', NULL,
        NULL, NULL, NULL, NULL, 0, 'Historical prompt', 'Historical answer'
      );
    `);

    const before = sqlite.prepare("SELECT prompt_snapshot_md, answer_snapshot_md FROM review_questions WHERE id = 'historical-question'").get();
    sqlite.exec(questionPoolModeMigrationSql);
    const review = sqlite.prepare("SELECT question_pool_mode FROM reviews WHERE id = 'historical-review'").get();
    const after = sqlite.prepare("SELECT prompt_snapshot_md, answer_snapshot_md FROM review_questions WHERE id = 'historical-question'").get();

    assert.equal(review.question_pool_mode, 'expanded');
    assert.deepEqual(after, before);
  } finally {
    sqlite.close();
  }
});
