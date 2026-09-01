// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  completeReview,
  continueReviewWithExpandedLearning,
  getReview,
  revealReview,
  startNextSystemStudySelectionReview,
  startSystemStudySelectionReview
} from '../src/lib/server/db/learning.js';
import { applyCurrentSchema } from './current-schema.js';

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('cardio', 'Cardiovascular', 'cardio', 'system', NULL, 1),
      ('rhythm', 'Rhythm', 'rhythm', 'topic', 'cardio', 1);
    INSERT INTO cases (id, title, question_selection_mode, is_active) VALUES
      ('case-a', 'Case A', 'all', 1),
      ('case-b', 'Case B', 'all', 1);
    INSERT INTO case_concepts (case_id, concept_id, role) VALUES
      ('case-a', 'rhythm', 'primary'),
      ('case-b', 'rhythm', 'primary');
    INSERT INTO question_prompts (id, prompt_md, is_active) VALUES
      ('prompt-a', 'Question A', 1),
      ('prompt-b', 'Question B', 1);
    INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES
      ('question-a', 'case-a', 'prompt-a', 'Answer A', 1),
      ('question-b', 'case-b', 'prompt-b', 'Answer B', 1);
  `);

  const d1 = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() { return sqlite.prepare(sql).all(...params).map((row) => Object.values(row)); },
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
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return { sqlite, db: createDb(d1) };
}

async function complete(fixture, reviewId) {
  await revealReview(fixture.db, reviewId, 'learner');
  await completeReview(fixture.db, reviewId, 'learner', 'good');
}

async function startSelection(fixture) {
  const reviewId = await startSystemStudySelectionReview({
    db: fixture.db,
    userId: 'learner',
    systemId: 'cardio',
    routes: [{ routeType: 'topic', routeId: 'rhythm' }],
    questionPoolMode: 'core',
    rng: () => 0
  });
  assert.ok(reviewId);
  return reviewId;
}

test('Expanded continuation reuses the same immutable study selection snapshot', async () => {
  const fixture = createFixture();
  try {
    const originalId = await startSelection(fixture);
    const original = await getReview(fixture.db, originalId, 'learner');
    assert.ok(original?.studySelectionId);
    await complete(fixture, originalId);

    const expandedId = await continueReviewWithExpandedLearning({
      db: fixture.db,
      userId: 'learner',
      reviewId: originalId,
      rng: () => 0
    });
    assert.ok(expandedId);

    const expanded = await getReview(fixture.db, expandedId, 'learner');
    assert.ok(expanded);
    assert.equal(expanded.caseId, original.caseId);
    assert.equal(expanded.studySelectionId, original.studySelectionId);
    assert.equal(expanded.navigationRouteType, null);
    assert.equal(expanded.navigationRouteId, null);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM study_selections').get().count, 1);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM study_selection_routes').get().count, 1);
  } finally {
    fixture.sqlite.close();
  }
});

test('Next case reuses the same selection snapshot and keeps the narrowed candidate pool', async () => {
  const fixture = createFixture();
  try {
    const originalId = await startSelection(fixture);
    const original = await getReview(fixture.db, originalId, 'learner');
    assert.ok(original?.studySelectionId);
    assert.equal(original.caseId, 'case-a');
    await complete(fixture, originalId);

    const nextId = await startNextSystemStudySelectionReview({
      db: fixture.db,
      userId: 'learner',
      studySelectionId: original.studySelectionId,
      questionPoolMode: 'core',
      rng: () => 0
    });
    assert.ok(nextId);

    const next = await getReview(fixture.db, nextId, 'learner');
    assert.ok(next);
    assert.equal(next.caseId, 'case-b');
    assert.equal(next.studySelectionId, original.studySelectionId);
    assert.equal(next.studySystemConceptId, 'cardio');
    assert.equal(next.studyConceptId, 'rhythm');
    assert.equal(next.navigationRouteType, null);
    assert.equal(next.navigationRouteId, null);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM study_selections').get().count, 1);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM study_selection_routes').get().count, 1);
  } finally {
    fixture.sqlite.close();
  }
});

test('invalidated stored selection fails safely for Expanded and Next instead of changing scope', async () => {
  const fixture = createFixture();
  try {
    const originalId = await startSelection(fixture);
    const original = await getReview(fixture.db, originalId, 'learner');
    assert.ok(original?.studySelectionId);
    await complete(fixture, originalId);

    fixture.sqlite.exec(`UPDATE concepts SET is_active = 0 WHERE id = 'rhythm';`);

    await assert.rejects(
      continueReviewWithExpandedLearning({
        db: fixture.db,
        userId: 'learner',
        reviewId: originalId,
        rng: () => 0
      }),
      /choose a fresh selection/i
    );
    await assert.rejects(
      startNextSystemStudySelectionReview({
        db: fixture.db,
        userId: 'learner',
        studySelectionId: original.studySelectionId,
        questionPoolMode: 'core',
        rng: () => 0
      }),
      /choose a fresh selection/i
    );
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM reviews').get().count, 1);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM study_selections').get().count, 1);
  } finally {
    fixture.sqlite.close();
  }
});
