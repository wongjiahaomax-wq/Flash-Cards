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
  startSystemReview
} from '../src/lib/server/db/learning.js';
import { resolveNextSystemStudyRoute } from '../src/lib/server/learning/system-review-navigation.ts';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

const migrationNames = [
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
];

const migrationSql = migrationNames
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function createContextualDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, is_active)
    VALUES ('cardio', 'Cardiovascular', 'cardio', 'system', 1);
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)
    VALUES ('rhythm', 'Rhythm', 'rhythm', 'topic', 'cardio', 1);
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)
    VALUES ('qtc', 'Prolonged QTc', 'qtc', 'topic', 'rhythm', 1);

    INSERT INTO cases (id, title, vignette_md, question_selection_mode, is_active)
    VALUES ('case-a', 'Case A', 'Vignette', 'all', 1);
    INSERT INTO case_concepts (case_id, concept_id, role)
    VALUES ('case-a', 'qtc', 'primary');

    INSERT INTO question_prompts (id, prompt_md, is_active)
    VALUES ('prompt-a', 'What is the finding?', 1);
    INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active)
    VALUES ('question-a', 'case-a', 'prompt-a', 'Prolonged QTc', 1);
  `);

  const d1 = {
    prepare(sql) {
      return {
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
      return Promise.all(statements.map((statement) => statement.run()));
    }
  };

  return {
    sqlite,
    db: /** @type {LearningDb} */ (
      createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))
    )
  };
}

test('System All Review persists selected All route separately from effective Topic provenance', async () => {
  const fixture = createContextualDb();
  try {
    const reviewId = await startSystemReview({
      db: fixture.db,
      userId: 'learner',
      systemId: 'cardio',
      routeType: 'all',
      questionPoolMode: 'core',
      rng: () => 0
    });
    assert.ok(reviewId);

    const review = await getReview(fixture.db, reviewId, 'learner');
    assert.ok(review);
    assert.equal(review.routeType, 'topic');
    assert.equal(review.studyConceptId, 'qtc');
    assert.equal(review.navigationRouteType, 'all');
    assert.equal(review.navigationRouteId, null);
    assert.deepEqual(resolveNextSystemStudyRoute(review, true), {
      systemId: 'cardio',
      routeType: 'all',
      routeId: null
    });
  } finally {
    fixture.sqlite.close();
  }
});

test('parent Topic Review persists selected parent while effective Study Topic stays specific', async () => {
  const fixture = createContextualDb();
  try {
    const reviewId = await startSystemReview({
      db: fixture.db,
      userId: 'learner',
      systemId: 'cardio',
      routeType: 'topic',
      routeId: 'rhythm',
      questionPoolMode: 'core',
      rng: () => 0
    });
    assert.ok(reviewId);

    const review = await getReview(fixture.db, reviewId, 'learner');
    assert.ok(review);
    assert.equal(review.studyConceptId, 'qtc');
    assert.equal(review.navigationRouteType, 'topic');
    assert.equal(review.navigationRouteId, 'rhythm');
    assert.deepEqual(resolveNextSystemStudyRoute(review, true), {
      systemId: 'cardio',
      routeType: 'topic',
      routeId: 'rhythm'
    });
  } finally {
    fixture.sqlite.close();
  }
});

test('Original to Expanded keeps selected and effective System route provenance', async () => {
  const fixture = createContextualDb();
  try {
    const originalId = await startSystemReview({
      db: fixture.db,
      userId: 'learner',
      systemId: 'cardio',
      routeType: 'all',
      questionPoolMode: 'core',
      rng: () => 0
    });
    assert.ok(originalId);
    await revealReview(fixture.db, originalId, 'learner');
    await completeReview(fixture.db, originalId, 'learner', 'good');

    const expandedId = await continueReviewWithExpandedLearning({
      db: fixture.db,
      userId: 'learner',
      reviewId: originalId,
      rng: () => 0
    });
    assert.ok(expandedId);

    const original = await getReview(fixture.db, originalId, 'learner');
    const expanded = await getReview(fixture.db, expandedId, 'learner');
    assert.ok(original);
    assert.ok(expanded);
    assert.equal(expanded.caseId, original.caseId);
    assert.equal(expanded.routeType, original.routeType);
    assert.equal(expanded.studyConceptId, original.studyConceptId);
    assert.equal(expanded.navigationRouteType, 'all');
    assert.equal(expanded.navigationRouteId, null);
  } finally {
    fixture.sqlite.close();
  }
});
