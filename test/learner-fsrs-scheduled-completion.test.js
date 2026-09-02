import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  FSRS_LIBRARY_VERSION,
  FSRS_SCHEDULER_REVISION,
  createDefaultFsrsParameters,
  serializeFsrsParameters
} from '../src/lib/server/learning/fsrs-scheduler.js';
import {
  isFsrsInRunRepeatState,
  prepareScheduledReviewCompletion
} from '../src/lib/server/db/scheduled-review-completion.js';

const foundationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const activeSql = readFileSync(
  new URL('../drizzle/0020_learner_fsrs_active_reviews.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const completionSql = readFileSync(
  new URL('../drizzle/0021_learner_fsrs_scheduled_completion.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

const now = Date.UTC(2026, 8, 2, 12, 0, 0);

function completionDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE user (id text PRIMARY KEY NOT NULL);
    CREATE TABLE concepts (
      id text PRIMARY KEY NOT NULL,
      parent_id text,
      kind text NOT NULL,
      is_active integer NOT NULL DEFAULT 1
    );
    CREATE TABLE cases (
      id text PRIMARY KEY NOT NULL,
      preview_session_id text,
      is_active integer NOT NULL DEFAULT 1
    );
    CREATE TABLE case_concepts (case_id text NOT NULL, concept_id text NOT NULL, role text NOT NULL);
    CREATE TABLE tags (id text PRIMARY KEY NOT NULL, is_active integer NOT NULL DEFAULT 1);
    CREATE TABLE case_tags (case_id text NOT NULL, tag_id text NOT NULL);
    CREATE TABLE system_tags (system_concept_id text NOT NULL, tag_id text NOT NULL);
    CREATE TABLE assets (id text PRIMARY KEY NOT NULL);
  `);
  db.exec(foundationSql);
  db.exec(activeSql);
  db.exec(completionSql);
  db.exec(`
    INSERT INTO user (id) VALUES ('learner');
    INSERT INTO concepts (id, parent_id, kind, is_active) VALUES
      ('system', NULL, 'system', 1),
      ('topic', 'system', 'topic', 1);
    INSERT INTO cases (id, preview_session_id, is_active) VALUES ('case-1', NULL, 1);
    INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-1', 'topic', 'primary');
    INSERT INTO learner_fsrs_profiles (
      user_id, generation, review_sequence_epoch, parameter_revision,
      scheduler_revision, scheduler_library_version, parameters_json
    ) VALUES ('learner', 1, 1, 1, 1, '5.4.2', '{}');
  `);
  return db;
}

function profile() {
  return {
    userId: 'learner',
    generation: 1,
    reviewSequenceEpoch: 1,
    parameterRevision: 1,
    schedulerRevision: FSRS_SCHEDULER_REVISION,
    schedulerLibraryVersion: FSRS_LIBRARY_VERSION,
    parametersJson: serializeFsrsParameters(createDefaultFsrsParameters())
  };
}

/** @param {'new'|'due'|'repeat'} queueClass @param {Record<string, unknown>} [overrides] */
function review(queueClass, overrides = {}) {
  return {
    id: 'review-1',
    userId: 'learner',
    caseId: 'case-1',
    systemId: 'system',
    studyMode: 'scheduled',
    contentMode: 'original',
    queueClass,
    runId: 'run-1',
    scopeFingerprint: 'scope-1',
    scopeJson: JSON.stringify({ systemId: 'system', routes: [{ routeType: 'topic', routeId: 'topic' }] }),
    generation: 1,
    reviewSequenceEpoch: 1,
    parameterRevision: 1,
    schedulerRevision: FSRS_SCHEDULER_REVISION,
    schedulerLibraryVersion: FSRS_LIBRARY_VERSION,
    expectedStateRevision: queueClass === 'new' ? null : 4,
    expectedDueAt: queueClass === 'new' ? null : new Date(now - 60_000),
    runStartedAt: new Date(now - 120_000),
    caseTitleSnapshot: 'Case 1',
    revealedAt: new Date(now - 1_000),
    ...overrides
  };
}

function dueState() {
  return {
    userId: 'learner',
    caseId: 'case-1',
    dueAt: new Date(now - 60_000),
    stability: 5,
    difficulty: 5,
    state: 2,
    elapsedDays: 2,
    scheduledDays: 1,
    learningSteps: 0,
    reps: 3,
    lapses: 0,
    lastReviewAt: new Date(now - 86_400_000),
    generation: 1,
    reviewSequenceEpoch: 1,
    parameterRevision: 1,
    schedulerRevision: FSRS_SCHEDULER_REVISION,
    schedulerLibraryVersion: FSRS_LIBRARY_VERSION,
    stateRevision: 4
  };
}

/** @param {DatabaseSync} db @param {Record<string, any>} row */
function insertActive(db, row) {
  db.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      expected_state_revision, expected_due_at, run_started_at,
      case_title_snapshot, vignette_snapshot_md, snapshot_version, revealed_at
    ) VALUES (
      @id, @userId, @caseId, @systemId, @studyMode, @contentMode, @queueClass,
      @runId, @scopeFingerprint, @scopeJson, @generation, @reviewSequenceEpoch,
      @parameterRevision, @schedulerRevision, @schedulerLibraryVersion,
      @expectedStateRevision, @expectedDueAt, @runStartedAt,
      @caseTitleSnapshot, NULL, 1, @revealedAt
    )
  `).run({
    ...row,
    expectedDueAt: row.expectedDueAt?.getTime?.() ?? row.expectedDueAt,
    runStartedAt: row.runStartedAt?.getTime?.() ?? row.runStartedAt,
    revealedAt: row.revealedAt?.getTime?.() ?? row.revealedAt
  });
}

/** @param {DatabaseSync} db @param {Record<string, any>} row */
function insertEvent(db, row) {
  db.prepare(`
    INSERT INTO scheduled_review_events (
      id, user_id, case_id, case_title_snapshot, system_id, completed_at, rating,
      content_mode, generation, review_sequence_epoch, sequence_no, parameter_revision,
      scheduler_revision, scheduler_library_version, resulting_state_revision,
      next_due_at, queue_class, run_id, scope_fingerprint, run_started_at, resulting_state
    ) VALUES (
      @id, 'learner', 'case-1', 'Case 1', 'system', @completedAt, @rating,
      'original', 1, 1, 1, 1, 1, '5.4.2', @resultingStateRevision,
      @nextDueAt, @queueClass, 'run-1', 'scope-1', @runStartedAt, @resultingState
    )
  `).run(row);
}

/** @param {DatabaseSync} db */
function dbNow(db) {
  return Number(db.prepare("SELECT cast((julianday('now') - 2440587.5) * 86400000 as integer) AS n").get()?.n);
}

test('Part D migration adds compact idempotent run/result context to Scheduled events', () => {
  const db = completionDb();
  try {
    const columns = new Set(db.prepare('PRAGMA table_info(scheduled_review_events)').all().map((row) => row.name));
    for (const name of ['queue_class', 'run_id', 'scope_fingerprint', 'run_started_at', 'resulting_state']) {
      assert.equal(columns.has(name), true, `${name} should exist`);
    }
  } finally {
    db.close();
  }
});

test('four ratings use the pinned FSRS transition and only short-term results enter the repeat lane', () => {
  /** @type {Array<'again'|'hard'|'good'|'easy'>} */
  const ratings = ['again', 'hard', 'good', 'easy'];
  for (const rating of ratings) {
    const prepared = prepareScheduledReviewCompletion({
      activeReview: review('new'),
      profile: profile(),
      state: null,
      rating,
      completedAt: now
    });
    assert.equal(prepared.resultingStateRevision, 1);
    assert.ok(Number.isFinite(prepared.nextDueAt));
    assert.ok(prepared.nextDueAt > now);
    assert.ok(prepared.resultingState >= 0 && prepared.resultingState <= 3);
  }

  const again = prepareScheduledReviewCompletion({
    activeReview: review('new'),
    profile: profile(),
    state: null,
    rating: 'again',
    completedAt: now
  });
  const easy = prepareScheduledReviewCompletion({
    activeReview: review('new'),
    profile: profile(),
    state: null,
    rating: 'easy',
    completedAt: now
  });
  assert.equal(isFsrsInRunRepeatState(again.resultingState), true);
  assert.equal(isFsrsInRunRepeatState(easy.resultingState), false);
});

test('Due completion preparation requires the exact captured state revision and boundary', () => {
  const prepared = prepareScheduledReviewCompletion({
    activeReview: review('due'),
    profile: profile(),
    state: dueState(),
    rating: 'good',
    completedAt: now
  });
  assert.equal(prepared.resultingStateRevision, 5);

  assert.throws(
    () => prepareScheduledReviewCompletion({
      activeReview: review('due'),
      profile: profile(),
      state: { ...dueState(), stateRevision: 5 },
      rating: 'good',
      completedAt: now
    }),
    /changed scheduling state/i
  );
});

test('write-time event guard permits completion after ordinary Admin deactivation but requires the frozen active Review', () => {
  const db = completionDb();
  try {
    const current = dbNow(db);
    const active = review('new', { runStartedAt: new Date(current - 1_000), revealedAt: new Date(current - 500) });
    insertActive(db, active);
    db.exec("UPDATE cases SET is_active = 0 WHERE id = 'case-1'");

    insertEvent(db, {
      id: 'review-1',
      completedAt: current,
      rating: 'good',
      resultingStateRevision: 1,
      nextDueAt: current + 60_000,
      queueClass: 'new',
      runStartedAt: current - 1_000,
      resultingState: 1
    });
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM scheduled_review_events WHERE id = 'review-1'").get()?.n), 1);

    db.exec("DELETE FROM scheduled_review_events WHERE id = 'review-1'");
    db.exec("DELETE FROM active_reviews WHERE id = 'review-1'");
    assert.throws(
      () => insertEvent(db, {
        id: 'review-1',
        completedAt: current,
        rating: 'good',
        resultingStateRevision: 1,
        nextDueAt: current + 60_000,
        queueClass: 'new',
        runStartedAt: current - 1_000,
        resultingState: 1
      }),
      /scheduled_completion_active_review_changed/i
    );
  } finally {
    db.close();
  }
});

test('expiry crossing between event guard and active consume aborts the whole transaction', () => {
  const db = completionDb();
  try {
    const current = dbNow(db);
    insertActive(db, review('new', { runStartedAt: new Date(current - 2_000), revealedAt: new Date(current - 1_000) }));
    db.prepare('UPDATE active_reviews SET started_at = ?, expires_at = ? WHERE id = ?')
      .run(current - 10_000, current + 60_000, 'review-1');

    db.exec('BEGIN');
    try {
      insertEvent(db, {
        id: 'review-1',
        completedAt: current,
        rating: 'again',
        resultingStateRevision: 1,
        nextDueAt: current + 60_000,
        queueClass: 'new',
        runStartedAt: current - 2_000,
        resultingState: 1
      });
      db.prepare("UPDATE active_reviews SET expires_at = cast((julianday('now') - 2440587.5) * 86400000 as integer) WHERE id = 'review-1'").run();
      assert.throws(
        () => db.exec("DELETE FROM active_reviews WHERE id = 'review-1'"),
        /scheduled_completion_expired/i
      );
      db.exec('ROLLBACK');
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }

    assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM scheduled_review_events WHERE id = 'review-1'").get()?.n), 0);
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM active_reviews WHERE id = 'review-1'").get()?.n), 1);
  } finally {
    db.close();
  }
});
