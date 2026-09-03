import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  LearnerRetentionError,
  listLearnerDetailedHistoryRetention,
  parseDetailedHistoryRetention,
  setLearnerDetailedHistoryRetention
} from '../src/lib/server/db/fsrs-retention-admin.js';
import {
  FSRS_LIBRARY_VERSION,
  FSRS_SCHEDULER_REVISION
} from '../src/lib/server/learning/fsrs-scheduler.js';

const foundationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

class SqliteD1Statement {
  /** @param {SqliteD1Client} client @param {string} sql @param {any[]} [params] */
  constructor(client, sql, params = []) {
    this.client = client;
    this.sql = sql;
    this.params = params;
  }

  /** @param {...any} params */
  bind(...params) {
    return new SqliteD1Statement(this.client, this.sql, params);
  }

  rows() {
    return /** @type {Record<string, any>[]} */ (
      this.client.database.prepare(this.sql).all(...this.params)
    );
  }

  async all() {
    return { success: true, meta: {}, results: this.rows() };
  }

  async first() {
    return this.rows()[0] ?? null;
  }

  async run() {
    const result = this.client.database.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
}

class SqliteD1Client {
  /** @param {DatabaseSync} database */
  constructor(database) {
    this.database = database;
  }

  /** @param {string} sql */
  prepare(sql) {
    return new SqliteD1Statement(this, sql);
  }

  /** @param {SqliteD1Statement[]} statements */
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) {
        results.push({ success: true, meta: {}, results: statement.rows() });
      }
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE user (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      email text NOT NULL UNIQUE,
      role text
    );
    CREATE TABLE cases (id text PRIMARY KEY NOT NULL);
  `);
  sqlite.exec(foundationSql);
  sqlite.exec(`
    INSERT INTO user (id, name, email, role) VALUES
      ('learner-a', 'Learner A', 'a@example.test', NULL),
      ('learner-b', 'Learner B', 'b@example.test', 'user'),
      ('admin-a', 'Admin A', 'admin@example.test', 'admin'),
      ('preview-a', 'Preview A', 'preview@example.test', 'preview_admin');
  `);
  return sqlite;
}

/** @param {DatabaseSync} sqlite */
function learningDb(sqlite) {
  return /** @type {import('../src/lib/server/db/index.js').LearningDb} */ (
    /** @type {unknown} */ ({
      $client: /** @type {D1Database} */ (
        /** @type {unknown} */ (new SqliteD1Client(sqlite))
      )
    })
  );
}

test('detailed-history retention accepts only the locked V1 policies', () => {
  for (const value of ['24m', '36m', '60m', 'indefinite']) {
    assert.equal(parseDetailedHistoryRetention(value), value);
  }
  assert.throws(
    () => parseDetailedHistoryRetention('12m'),
    (error) => error instanceof LearnerRetentionError && error.code === 'invalid-input'
  );
});

test('Admin retention listing shows learners only and exposes the 24-month default before FSRS initialization', async () => {
  const sqlite = fixture();
  try {
    const learners = await listLearnerDetailedHistoryRetention(learningDb(sqlite));
    assert.deepEqual(learners.map((row) => row.userId), ['learner-a', 'learner-b']);
    assert.deepEqual(learners.map((row) => row.detailedHistoryRetention), ['24m', '24m']);
    assert.deepEqual(learners.map((row) => row.profileInitialized), [false, false]);
  } finally {
    sqlite.close();
  }
});

test('Admin retention override on a never-initialized learner creates only the canonical initial FSRS profile', async () => {
  const sqlite = fixture();
  try {
    const result = await setLearnerDetailedHistoryRetention({
      db: learningDb(sqlite),
      userId: 'learner-a',
      retention: '60m'
    });

    assert.equal(result.retention, '60m');
    assert.deepEqual(
      [result.profile.generation, result.profile.reviewSequenceEpoch, result.profile.parameterRevision],
      [1, 1, 1]
    );
    assert.equal(result.profile.schedulerRevision, FSRS_SCHEDULER_REVISION);
    assert.equal(result.profile.schedulerLibraryVersion, FSRS_LIBRARY_VERSION);
    assert.equal(JSON.parse(result.profile.parametersJson).request_retention, 0.9);

    const profile = sqlite.prepare(`
      SELECT generation, review_sequence_epoch, parameter_revision,
             detailed_history_retention
      FROM learner_fsrs_profiles
      WHERE user_id = 'learner-a'
    `).get();
    assert.deepEqual(
      [profile?.generation, profile?.review_sequence_epoch, profile?.parameter_revision, profile?.detailed_history_retention],
      [1, 1, 1, '60m']
    );
    assert.equal(
      Number(sqlite.prepare("SELECT COUNT(*) AS n FROM learner_case_fsrs WHERE user_id = 'learner-a'").get()?.n ?? 0),
      0,
      'an Admin retention override must not manufacture per-Case scheduling state'
    );
  } finally {
    sqlite.close();
  }
});

test('shortening retention preserves initialized scheduler boundaries and optimizer evidence while pruning expired display history', async () => {
  const sqlite = fixture();
  try {
    sqlite.prepare(`
      INSERT INTO learner_fsrs_profiles (
        user_id, generation, review_sequence_epoch, parameter_revision,
        scheduler_revision, scheduler_library_version, parameters_json,
        detailed_history_retention
      ) VALUES ('learner-b', 3, 4, 5, ?, ?, ?, 'indefinite')
    `).run(
      FSRS_SCHEDULER_REVISION,
      FSRS_LIBRARY_VERSION,
      JSON.stringify({ request_retention: 0.83, personalized: true })
    );
    sqlite.prepare(`
      INSERT INTO scheduled_review_events (
        id, user_id, case_id, case_title_snapshot, system_id, completed_at,
        rating, content_mode, generation, review_sequence_epoch, sequence_no,
        parameter_revision, scheduler_revision, scheduler_library_version,
        resulting_state_revision, next_due_at
      ) VALUES ('expired-event', 'learner-b', 'historical-case', 'Historical Case',
        'historical-system', 1, 'good', 'original', 3, 4, 1, 5, ?, ?, 1, 2)
    `).run(FSRS_SCHEDULER_REVISION, FSRS_LIBRARY_VERSION);
    sqlite.prepare(`
      INSERT INTO learner_optimizer_evidence (
        event_id, user_id, case_id, completed_at, rating, generation,
        review_sequence_epoch, sequence_no
      ) VALUES ('expired-event', 'learner-b', 'historical-case', 1, 'good', 3, 4, 1)
    `).run();

    const result = await setLearnerDetailedHistoryRetention({
      db: learningDb(sqlite),
      userId: 'learner-b',
      retention: '24m'
    });
    assert.deepEqual(
      [result.profile.generation, result.profile.reviewSequenceEpoch, result.profile.parameterRevision],
      [3, 4, 5]
    );
    assert.equal(JSON.parse(result.profile.parametersJson).request_retention, 0.83);
    assert.equal(
      Number(sqlite.prepare("SELECT COUNT(*) AS n FROM scheduled_review_events WHERE id = 'expired-event'").get()?.n ?? 0),
      0
    );
    assert.equal(
      Number(sqlite.prepare("SELECT COUNT(*) AS n FROM learner_optimizer_evidence WHERE event_id = 'expired-event'").get()?.n ?? 0),
      1,
      'display retention must not erase optimizer sequence evidence'
    );
  } finally {
    sqlite.close();
  }
});

test('retention overrides fail closed for non-learners and invalid policies', async () => {
  const sqlite = fixture();
  try {
    await assert.rejects(
      setLearnerDetailedHistoryRetention({ db: learningDb(sqlite), userId: 'admin-a', retention: '36m' }),
      (error) => error instanceof LearnerRetentionError && error.code === 'learner-not-found'
    );
    await assert.rejects(
      setLearnerDetailedHistoryRetention({ db: learningDb(sqlite), userId: 'learner-a', retention: 'forever' }),
      (error) => error instanceof LearnerRetentionError && error.code === 'invalid-input'
    );
  } finally {
    sqlite.close();
  }
});
