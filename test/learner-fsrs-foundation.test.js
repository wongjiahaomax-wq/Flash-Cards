import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  FSRS_LIBRARY_VERSION,
  FSRS_SCHEDULER_REVISION,
  createDefaultFsrsParameters,
  createInitialFsrsCard,
  deserializeFsrsCard,
  deserializeFsrsParameters,
  getFsrsRetrievability,
  scheduleFsrsReview,
  serializeFsrsCard,
  serializeFsrsParameters
} from '../src/lib/server/learning/fsrs-scheduler.js';
import {
  groupOptimizerEvidence,
  validateCompleteOptimizerSequences
} from '../src/lib/server/learning/fsrs-optimizer-evidence.js';
import {
  assertZeroLegacyReviewData,
  extractLegacyReviewCounts
} from '../scripts/learner-fsrs-preflight.mjs';
import { runLearnerFsrsBenchmark } from '../scripts/learner-fsrs-benchmark.mjs';
import { runFsrsWorkerBundleSmoke } from '../scripts/learner-fsrs-worker-smoke.mjs';

const foundationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

function foundationDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE user (id text PRIMARY KEY NOT NULL);
    CREATE TABLE cases (id text PRIMARY KEY NOT NULL);
  `);
  db.exec(foundationSql);
  return db;
}

test('FSRS migration creates additive learner foundation and cascades learner-owned data', () => {
  const db = foundationDb();
  try {
    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name)
    );
    for (const table of [
      'learner_preferences',
      'learner_fsrs_profiles',
      'learner_case_fsrs',
      'learner_case_encounters',
      'scheduled_review_events',
      'learner_optimizer_evidence',
      'learner_aggregates',
      'learner_system_aggregates'
    ]) {
      assert.equal(tables.has(table), true, `${table} should exist`);
    }

    db.exec(`
      INSERT INTO user (id) VALUES ('learner');
      INSERT INTO cases (id) VALUES ('case-1');
      INSERT INTO learner_preferences (user_id) VALUES ('learner');
      INSERT INTO learner_fsrs_profiles (
        user_id, scheduler_library_version, parameters_json
      ) VALUES ('learner', '5.4.2', '{}');
      INSERT INTO learner_case_fsrs (
        user_id, case_id, due_at, generation, review_sequence_epoch,
        parameter_revision, scheduler_revision, scheduler_library_version
      ) VALUES ('learner', 'case-1', 1, 1, 1, 1, 1, '5.4.2');
      INSERT INTO learner_case_encounters (user_id, case_id)
      VALUES ('learner', 'case-1');
      INSERT INTO scheduled_review_events (
        id, user_id, case_id, case_title_snapshot, system_id, completed_at,
        rating, content_mode, generation, review_sequence_epoch, sequence_no,
        parameter_revision, scheduler_revision, scheduler_library_version,
        resulting_state_revision, next_due_at
      ) VALUES (
        'review-1', 'learner', 'case-1', 'Case 1', 'system-1', 1,
        'good', 'original', 1, 1, 1, 1, 1, '5.4.2', 2, 2
      );
      INSERT INTO learner_optimizer_evidence (
        event_id, user_id, case_id, completed_at, rating,
        generation, review_sequence_epoch, sequence_no
      ) VALUES ('review-1', 'learner', 'case-1', 1, 'good', 1, 1, 1);
      INSERT INTO learner_aggregates (user_id) VALUES ('learner');
      INSERT INTO learner_system_aggregates (user_id, system_id)
      VALUES ('learner', 'system-1');
    `);

    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    db.exec("DELETE FROM user WHERE id = 'learner'");
    for (const table of [
      'learner_preferences',
      'learner_fsrs_profiles',
      'learner_case_fsrs',
      'learner_case_encounters',
      'scheduled_review_events',
      'learner_optimizer_evidence',
      'learner_aggregates',
      'learner_system_aggregates'
    ]) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0);
    }
  } finally {
    db.close();
  }
});

test('learner Case scheduling state enforces one row and monotonic boundary values', () => {
  const db = foundationDb();
  try {
    db.exec("INSERT INTO user (id) VALUES ('learner'); INSERT INTO cases (id) VALUES ('case-1');");
    db.prepare(`
      INSERT INTO learner_case_fsrs (
        user_id, case_id, due_at, generation, review_sequence_epoch,
        parameter_revision, scheduler_revision, scheduler_library_version, state_revision
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('learner', 'case-1', 1, 1, 1, 1, 1, '5.4.2', 1);
    assert.throws(
      () =>
        db.prepare(`
          INSERT INTO learner_case_fsrs (
            user_id, case_id, due_at, generation, review_sequence_epoch,
            parameter_revision, scheduler_revision, scheduler_library_version, state_revision
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('learner', 'case-1', 2, 1, 1, 1, 1, '5.4.2', 2),
      /UNIQUE|PRIMARY KEY/i
    );
    assert.throws(
      () =>
        db.prepare(`
          UPDATE learner_case_fsrs SET state_revision = 0
          WHERE user_id = 'learner' AND case_id = 'case-1'
        `).run(),
      /CHECK constraint/i
    );
  } finally {
    db.close();
  }
});

test('FSRS adapter pins the reviewed scheduler and serializes a deterministic short-term transition', () => {
  assert.equal(FSRS_LIBRARY_VERSION, '5.4.2');
  assert.equal(FSRS_SCHEDULER_REVISION, 1);
  const parameters = createDefaultFsrsParameters();
  assert.equal(parameters.request_retention, 0.9);
  assert.equal(parameters.enable_short_term, true);
  assert.equal(parameters.enable_fuzz, false);

  const serializedParameters = serializeFsrsParameters(parameters);
  assert.deepEqual(deserializeFsrsParameters(serializedParameters), parameters);

  const now = Date.UTC(2026, 8, 2, 0, 0, 0);
  const initial = createInitialFsrsCard(now);
  assert.deepEqual(serializeFsrsCard(deserializeFsrsCard(initial)), initial);

  const first = scheduleFsrsReview({ card: initial, rating: 'good', now, parameters });
  const repeated = scheduleFsrsReview({
    card: first.card,
    rating: 'good',
    now: first.nextDueAt,
    parameters
  });
  assert.ok(first.nextDueAt > now);
  assert.ok(repeated.nextDueAt > first.nextDueAt);
  assert.equal(first.schedulerLibraryVersion, '5.4.2');
  assert.equal(first.schedulerRevision, 1);
  assert.ok([1, 2, 3].includes(first.card.state));
  assert.equal(typeof getFsrsRetrievability(first.card, first.nextDueAt, parameters), 'number');
  assert.throws(
    () => scheduleFsrsReview({ card: initial, rating: 'manual', now, parameters }),
    /Unsupported FSRS rating/
  );
});

test('all four learner ratings are accepted by the adapter', () => {
  const now = Date.UTC(2026, 8, 2, 0, 0, 0);
  const card = createInitialFsrsCard(now);
  const parameters = createDefaultFsrsParameters();
  for (const rating of ['again', 'hard', 'good', 'easy']) {
    const transition = scheduleFsrsReview({ card, rating, now, parameters });
    assert.ok(transition.nextDueAt > now, rating);
  }
});

test('optimizer evidence is grouped by Case, generation and Reset/Fresh epoch with complete sequence checks', () => {
  const rows = [
    { eventId: 'e2', userId: 'u', caseId: 'c', completedAt: 300, rating: 'good', generation: 1, reviewSequenceEpoch: 2, sequenceNo: 1 },
    { eventId: 'e1b', userId: 'u', caseId: 'c', completedAt: 200, rating: 'hard', generation: 1, reviewSequenceEpoch: 1, sequenceNo: 2 },
    { eventId: 'e1a', userId: 'u', caseId: 'c', completedAt: 500, rating: 'again', generation: 1, reviewSequenceEpoch: 1, sequenceNo: 1 },
    { eventId: 'e3', userId: 'u', caseId: 'c', completedAt: 400, rating: 'easy', generation: 2, reviewSequenceEpoch: 3, sequenceNo: 1 }
  ];
  const groups = groupOptimizerEvidence(rows);
  assert.deepEqual(groups.map((group) => group.reviews.map((review) => review.eventId)), [
    ['e1a', 'e1b'],
    ['e2'],
    ['e3']
  ]);
  assert.throws(
    () => validateCompleteOptimizerSequences([{ ...rows[0], sequenceNo: 2 }]),
    /Incomplete optimizer history/
  );
});

test('clean-cutover preflight parses Wrangler output and fails closed on legacy data', () => {
  const counts = extractLegacyReviewCounts([
    { results: [{ reviews_count: 0, review_questions_count: 0, review_assets_count: 0 }] }
  ]);
  assert.deepEqual(assertZeroLegacyReviewData(counts), {
    reviews: 0,
    reviewQuestions: 0,
    reviewAssets: 0
  });
  assert.throws(
    () => assertZeroLegacyReviewData({ reviews: 1, reviewQuestions: 0, reviewAssets: 0 }),
    /No destructive cutover is allowed/
  );
});

test('benchmark harness exercises indexed Due and optimizer paths with representative schema', () => {
  const result = runLearnerFsrsBenchmark({ caseCount: 20, eventCount: 100, writeIterations: 3 });
  assert.equal(result.foreignKeyViolations.length, 0);
  assert.equal(result.rows.optimizerReturned, 100);
  assert.equal(result.rows.scheduledEvents, 103);
  assert.match(result.queryPlans.due.join('\n'), /learner_case_fsrs_due_idx/i);
  assert.match(result.queryPlans.optimizer.join('\n'), /learner_optimizer_evidence_optimizer_idx/i);
});

test('pinned FSRS adapter bundles and executes through the Worker-targeted Vite toolchain', async () => {
  const result = await runFsrsWorkerBundleSmoke();
  assert.ok(result.bundledBytes > 0);
  assert.equal(result.schedulerRevision, 1);
  assert.equal(result.schedulerLibraryVersion, '5.4.2');
  assert.ok(result.nextDueAt > 0);
});