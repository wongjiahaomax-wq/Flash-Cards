import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { completeReview, getReview, revealReview, startReview } from '../src/lib/server/db/learning.js';
import { buildSeedSql } from '../scripts/seed-content.mjs';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */
/** @typedef {{ prepare: (sql: string) => any, batch: (statements: any[]) => Promise<any[]> }} TestD1 */

const migrationSql = [
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

test('startReview batches and persists ordered questions/assets as snapshots', async () => {
  const fixture = createLearningDb();
  try {
    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', rng: () => 0 });
    assert.ok(reviewId);
    assert.equal(fixture.batches, 1);

    const review = await getReview(fixture.db, reviewId, 'learner-1');
    assert.ok(review);
    assert.equal(review.status, 'started');
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

test('reveal and whole-case rating persist, and history avoids an immediate repeat', async () => {
  const fixture = createLearningDb();
  try {
    const firstId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', rng: () => 0 });
    assert.ok(firstId);
    assert.equal(await revealReview(fixture.db, firstId, 'learner-1'), true);
    assert.equal(await completeReview(fixture.db, firstId, 'learner-1', 'good'), true);
    const first = await getReview(fixture.db, firstId, 'learner-1');
    assert.equal(first?.status, 'completed');
    assert.equal(first?.rating, 'good');
    assert.ok(first?.revealed);

    const secondId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'seed-anterior-stemi', rng: () => 0 });
    assert.ok(secondId);
    const second = await getReview(fixture.db, secondId, 'learner-1');
    assert.ok(second);
    assert.notEqual(second.caseId, first.caseId);
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
