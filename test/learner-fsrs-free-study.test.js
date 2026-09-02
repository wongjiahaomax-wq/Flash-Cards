import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { FREE_COMPLETION_RECEIPT_TTL_MS } from '../src/lib/server/db/free-review-completion.js';
import { initialLearnerPreferences } from '../src/lib/server/db/fsrs-bootstrap.js';
import { buildFreeStudyRunDescriptor } from '../src/lib/server/learning/study-run-planner.js';

const drizzleConfigSource = readFileSync(
  new URL('../drizzle.config.js', import.meta.url),
  'utf8'
);
const foundationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const activeSql = readFileSync(
  new URL('../drizzle/0020_learner_fsrs_active_reviews.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const freeSql = readFileSync(
  new URL('../drizzle/0022_learner_fsrs_free_study.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

function freeDb() {
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
  db.exec(freeSql);
  db.exec(`
    INSERT INTO user (id) VALUES ('learner');
    INSERT INTO concepts (id, parent_id, kind, is_active) VALUES
      ('system', NULL, 'system', 1),
      ('topic', 'system', 'topic', 1);
    INSERT INTO cases (id, preview_session_id, is_active) VALUES ('case-1', NULL, 1);
    INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-1', 'topic', 'primary');
  `);
  return db;
}

/** @param {DatabaseSync} db */
function dbNow(db) {
  return Number(
    db.prepare("SELECT cast((julianday('now') - 2440587.5) * 86400000 as integer) AS n").get()?.n
  );
}

/**
 * @param {DatabaseSync} db
 * @param {{id?:string,revealed?:boolean,expiresAt?:number,contentMode?:'original'|'expanded'}} [options]
 */
function insertFreeActive(db, options = {}) {
  const id = options.id ?? 'review-1';
  const current = dbNow(db);
  db.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      expected_state_revision, expected_due_at, run_started_at,
      case_title_snapshot, snapshot_version, revealed_at, expires_at
    ) VALUES (
      ?, 'learner', 'case-1', 'system', 'free', ?, NULL,
      'run-1', 'scope-1', ?, NULL, NULL,
      NULL, NULL, NULL,
      NULL, NULL, NULL,
      'Case 1', 1, ?, ?
    )
  `).run(
    id,
    options.contentMode ?? 'original',
    JSON.stringify({ systemId: 'system', routes: [{ routeType: 'topic', routeId: 'topic' }] }),
    options.revealed === false ? null : current - 100,
    options.expiresAt ?? current + 60_000
  );
  return id;
}

/** @param {DatabaseSync} db @param {string} reviewId @param {number} completedAt */
function insertReceipt(db, reviewId, completedAt) {
  db.prepare(`
    INSERT INTO free_review_completion_receipts (
      id, user_id, case_id, completed_at, resulting_free_times_studied
    ) VALUES (?, 'learner', 'case-1', ?, 1)
  `).run(reviewId, completedAt);
}

test('Part E registers its receipt schema with Drizzle Kit authority', () => {
  assert.match(
    drizzleConfigSource,
    /\.\/src\/lib\/server\/db\/free-study-schema\.js/,
    'drizzle.config.js must include the Part E receipt schema'
  );
});

test('Part E keeps Expanded Learning globally OFF by default and Free descriptors carry no scheduler boundary', () => {
  assert.deepEqual(initialLearnerPreferences('learner'), {
    userId: 'learner',
    expandedLearning: false,
    scheduledOrder: 'due_first'
  });

  const descriptor = buildFreeStudyRunDescriptor({
    userId: 'learner',
    systemId: 'system',
    routes: [{ routeType: 'topic', routeId: 'topic' }],
    candidates: [{ id: 'case-1' }, { id: 'case-2' }],
    preferences: { expandedLearning: true },
    now: Date.UTC(2026, 8, 2, 12),
    rng: () => 0.5,
    runId: 'run-1'
  });

  assert.equal(descriptor.expandedLearning, true);
  assert.deepEqual([...descriptor.bag].sort(), ['case-1', 'case-2']);
  assert.equal('schedulerBoundary' in descriptor, false);
  assert.equal('runBoundaryToken' in descriptor, false);
});

test('Part E migration creates a seven-day short-lived receipt with account cascade ownership', () => {
  const db = freeDb();
  try {
    const current = dbNow(db);
    const reviewId = insertFreeActive(db);
    insertReceipt(db, reviewId, current);
    const receipt = db.prepare(`
      SELECT completed_at, expires_at, resulting_free_times_studied
      FROM free_review_completion_receipts
      WHERE id = ?
    `).get(reviewId);

    assert.equal(Number(receipt?.resulting_free_times_studied), 1);
    const ttl = Number(receipt?.expires_at) - current;
    assert.ok(
      Math.abs(ttl - FREE_COMPLETION_RECEIPT_TTL_MS) < 5_000,
      `expected receipt TTL near ${FREE_COMPLETION_RECEIPT_TTL_MS}ms, got ${ttl}ms`
    );

    db.exec("DELETE FROM user WHERE id = 'learner'");
    assert.equal(
      Number(db.prepare('SELECT count(*) AS n FROM free_review_completion_receipts').get()?.n),
      0
    );
  } finally {
    db.close();
  }
});

test('Free completion receipt guard uses the frozen Review, so ordinary Admin Case deactivation does not cancel completion', () => {
  const db = freeDb();
  try {
    const reviewId = insertFreeActive(db, { contentMode: 'expanded' });
    db.exec("UPDATE cases SET is_active = 0 WHERE id = 'case-1'");
    assert.doesNotThrow(() => insertReceipt(db, reviewId, dbNow(db)));
  } finally {
    db.close();
  }
});

test('Free completion receipt guard requires reveal, exact active ownership, and database-time freshness', () => {
  const db = freeDb();
  try {
    insertFreeActive(db, { id: 'unrevealed', revealed: false });
    assert.throws(
      () => insertReceipt(db, 'unrevealed', dbNow(db)),
      /free_completion_unrevealed/
    );

    db.exec("DELETE FROM active_reviews WHERE id = 'unrevealed'");
    assert.throws(
      () => insertReceipt(db, 'missing', dbNow(db)),
      /free_completion_active_review_changed/
    );

    const expired = insertFreeActive(db, { id: 'expired' });
    const current = dbNow(db);
    db.prepare('UPDATE active_reviews SET started_at = ?, expires_at = ? WHERE id = ?')
      .run(current - 10_000, current - 1, expired);
    assert.throws(
      () => insertReceipt(db, expired, current),
      /free_completion_expired/
    );
  } finally {
    db.close();
  }
});

test('expiry crossing at final Free active consume rolls back receipt, encounter, and aggregate writes', () => {
  const db = freeDb();
  try {
    const reviewId = insertFreeActive(db);
    const completedAt = dbNow(db);

    assert.throws(() => {
      db.exec('BEGIN');
      try {
        insertReceipt(db, reviewId, completedAt);
        db.prepare(`
          INSERT INTO learner_case_encounters (
            user_id, case_id, free_first_seen_at, free_last_seen_at, free_times_studied
          ) VALUES ('learner', 'case-1', ?, ?, 1)
        `).run(completedAt, completedAt);
        db.prepare(`
          INSERT INTO learner_aggregates (
            user_id, free_completed, first_activity_at, last_activity_at
          ) VALUES ('learner', 1, ?, ?)
        `).run(completedAt, completedAt);
        const crossedAt = dbNow(db);
        db.prepare('UPDATE active_reviews SET started_at = ?, expires_at = ? WHERE id = ?')
          .run(crossedAt - 10_000, crossedAt - 1, reviewId);
        db.prepare("DELETE FROM active_reviews WHERE id = ? AND study_mode = 'free'").run(reviewId);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }, /free_completion_expired/);

    assert.equal(Number(db.prepare('SELECT count(*) AS n FROM free_review_completion_receipts').get()?.n), 0);
    assert.equal(Number(db.prepare('SELECT count(*) AS n FROM learner_case_encounters').get()?.n), 0);
    assert.equal(Number(db.prepare('SELECT count(*) AS n FROM learner_aggregates').get()?.n), 0);
    assert.equal(Number(db.prepare('SELECT count(*) AS n FROM active_reviews').get()?.n), 1);
  } finally {
    db.close();
  }
});
