// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { startSystemStudySelectionReview } from '../src/lib/server/db/learning.js';
import { readStudySelection } from '../src/lib/server/db/study-selection.ts';
import { applyCurrentSchema } from './current-schema.js';

function createFixture({ failBatchAt = null } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('cardio', 'Cardiovascular', 'cardio', 'system', NULL, 1),
      ('rhythm', 'Rhythm', 'rhythm', 'topic', 'cardio', 1);
    INSERT INTO cases (id, title, question_selection_mode, is_active)
    VALUES ('case-a', 'Case A', 'all', 1);
    INSERT INTO case_concepts (case_id, concept_id, role)
    VALUES ('case-a', 'rhythm', 'primary');
    INSERT INTO question_prompts (id, prompt_md, is_active)
    VALUES ('prompt-a', 'Question A', 1);
    INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active)
    VALUES ('question-a', 'case-a', 'prompt-a', 'Answer A', 1);
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
              return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            }
          };
        }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (let index = 0; index < statements.length; index += 1) {
          if (failBatchAt === index) throw new Error('Injected batch failure');
          results.push(await statements[index].run());
        }
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

test('first selection-based Review atomically persists immutable selection provenance and snapshots', async () => {
  const fixture = createFixture();
  try {
    const reviewId = await startSystemStudySelectionReview({
      db: fixture.db,
      userId: 'learner',
      systemId: 'cardio',
      routes: [{ routeType: 'topic', routeId: 'rhythm' }],
      questionPoolMode: 'expanded',
      rng: () => 0
    });
    assert.ok(reviewId);

    const review = fixture.sqlite.prepare(`
      SELECT study_selection_id, navigation_route_type, navigation_route_id,
             study_system_concept_id, route_type, study_tag_id
      FROM reviews WHERE id = ?
    `).get(reviewId);
    assert.ok(review.study_selection_id);
    assert.equal(review.navigation_route_type, null);
    assert.equal(review.navigation_route_id, null);
    assert.equal(review.study_system_concept_id, 'cardio');
    assert.equal(review.route_type, 'topic');
    assert.equal(review.study_tag_id, null);
    assert.equal(
      fixture.sqlite.prepare('SELECT count(*) AS count FROM review_questions WHERE review_id = ?').get(reviewId).count,
      1
    );

    const selection = await readStudySelection(fixture.db, {
      selectionId: review.study_selection_id,
      userId: 'learner'
    });
    assert.deepEqual(selection, {
      id: review.study_selection_id,
      userId: 'learner',
      systemId: 'cardio',
      routes: [{ routeType: 'topic', routeId: 'rhythm' }]
    });

    assert.throws(
      () => fixture.sqlite.exec(`UPDATE study_selection_routes SET route_id = 'other' WHERE study_selection_id = '${review.study_selection_id}';`),
      /immutable/i
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('failed first Review batch leaves no orphan selection snapshot or routes', async () => {
  const fixture = createFixture({ failBatchAt: 2 });
  try {
    await assert.rejects(
      startSystemStudySelectionReview({
        db: fixture.db,
        userId: 'learner',
        systemId: 'cardio',
        routes: [{ routeType: 'topic', routeId: 'rhythm' }],
        questionPoolMode: 'expanded',
        rng: () => 0
      }),
      /Injected batch failure/
    );
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM study_selections').get().count, 0);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM study_selection_routes').get().count, 0);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM reviews').get().count, 0);
  } finally {
    fixture.sqlite.close();
  }
});
