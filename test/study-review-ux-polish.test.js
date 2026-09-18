// Focused learner Study Review coverage for PR 187.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { createFreeActiveReview } from '../src/lib/server/db/active-reviews.js';
import { activeStudyRunProgress } from '../src/lib/study-run-progress.js';
import { applyCurrentSchema } from './current-schema.js';

const reviewPage = readFileSync(
  new URL('../src/routes/study/[reviewId]/+page.svelte', import.meta.url),
  'utf8'
);
const reviewServer = readFileSync(
  new URL('../src/routes/study/[reviewId]/+page.server.js', import.meta.url),
  'utf8'
);

function createD1(sqlite) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() {
              const statement = sqlite.prepare(sql);
              statement.setReturnArrays(true);
              return statement.all(...params);
            },
            async run() {
              if (/^\s*select\b/i.test(sql)) {
                return { success: true, results: sqlite.prepare(sql).all(...params), meta: { changes: 0, last_row_id: 0 } };
              }
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
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      return results;
    }
  };
}

function activeReviewFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(`
    INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES ('ux-learner', 'UX Learner', 'ux-learner@example.test', 1, 1, 1);
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active, created_at, updated_at)
    VALUES
      ('ux-system', 'UX System', 'ux-system', 'system', NULL, 1, 1, 1),
      ('ux-topic', 'UX Topic', 'ux-topic', 'topic', 'ux-system', 1, 1, 1);
    INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, is_active, created_at, updated_at)
    VALUES ('ux-case', 'Frozen diagnosis title', 'Frozen vignette', 'fixed', 2, 1, 1, 1);
    INSERT INTO case_concepts (case_id, concept_id, role, created_at)
    VALUES ('ux-case', 'ux-topic', 'primary', 1);
    INSERT INTO question_prompts (id, prompt_md, is_active, created_at, updated_at)
    VALUES
      ('ux-prompt-1', 'Question one', 1, 1, 1),
      ('ux-prompt-2', 'Question two', 1, 2, 2),
      ('ux-prompt-3', 'Question three', 1, 3, 3),
      ('ux-prompt-4', 'Question four', 1, 4, 4);
    INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active, created_at, updated_at)
    VALUES
      ('ux-case-question-1', 'ux-case', 'ux-prompt-1', 'Answer one', 1, 1, 1),
      ('ux-case-question-2', 'ux-case', 'ux-prompt-2', 'Answer two', 1, 2, 2),
      ('ux-case-question-3', 'ux-case', 'ux-prompt-3', 'Answer three', 1, 3, 3),
      ('ux-case-question-4', 'ux-case', 'ux-prompt-4', 'Answer four', 1, 4, 4);
  `);
  return { sqlite, db: createDb(createD1(sqlite)) };
}

test('Core Active Review snapshots selected questions in resolved pool order', async () => {
  const fixture = activeReviewFixture();
  try {
    let calls = 0;
    const result = await createFreeActiveReview({
      db: fixture.db,
      userId: 'ux-learner',
      runScope: {
        systems: [{
          systemId: 'ux-system',
          mode: 'routes',
          routes: [{ routeType: 'topic', routeId: 'ux-topic' }]
        }]
      },
      caseId: 'ux-case',
      rng: () => [0, 0.9, 0.9][calls++] ?? 0.9
    });

    assert.equal(result.status, 'created');
    assert.deepEqual(
      result.review.questions.map((question) => [question.promptSnapshotMd, question.displayOrder]),
      [['Question two', 0], ['Question four', 1]]
    );
    assert.equal(result.review.caseTitleSnapshot, 'Frozen diagnosis title');
  } finally {
    fixture.sqlite.close();
  }
});

test('Study Review keeps diagnosis secrecy, frozen-title reveal, media reuse, and position-safe reveal wiring', () => {
  assert.match(reviewServer, /const revealed = Boolean\(review\.revealedAt\)/);
  assert.match(reviewServer, /\.\.\.\(revealed \? \{ caseTitle: review\.caseTitleSnapshot \} : \{\}\)/);
  assert.match(reviewPage, /data\.review\.revealed && data\.review\.caseTitle \? data\.review\.caseTitle : 'Case review'/);
  assert.match(reviewPage, /use:enhance=\{preserveRevealPosition\}/);
  assert.match(reviewPage, /window\.scrollTo\(\{ left: scrollX, top: scrollY, behavior: 'auto' \}\)/);
  assert.match(reviewPage, /src=\{asset\.imageUrl\}/);
  assert.match(reviewPage, /class="asset-dialog"/);
  assert.match(reviewPage, /class="asset-modal-backdrop"/);
  assert.match(reviewPage, /onkeydown=\{handleImageDialogKeydown\}/);
  assert.match(reviewPage, /event\.target === event\.currentTarget/);
  assert.match(reviewPage, /class="run-progress"/);
  assert.doesNotMatch(reviewPage, /getTeachingImageUrl|getReviewImageUrl/);
});

test('Scheduled Study progress shrinks to the attainable target after stale queue skips', () => {
  const progress = activeStudyRunProgress({
    kind: 'scheduled',
    distinctCaseTarget: 10,
    capturedDue: [{ caseId: 'stale-due' }, { caseId: 'current-due' }],
    duePosition: 1,
    capturedNew: Array.from({ length: 8 }, (_, index) => ({ caseId: `new-${index}` })),
    newPosition: 0,
    completedCaseIds: [],
    currentReviewId: 'review-current',
    currentWork: { queueClass: 'due', caseId: 'current-due' }
  });

  assert.deepEqual(progress, { current: 1, total: 9 });
});
