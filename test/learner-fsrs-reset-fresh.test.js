import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getLearnerFsrsProgress } from '../src/lib/server/db/fsrs-progress.js';
import {
  freshLearnerFsrsStart,
  resetLearnerFsrsProgress
} from '../src/lib/server/db/fsrs-reset-fresh.js';
import {
  FSRS_LIBRARY_VERSION,
  FSRS_SCHEDULER_REVISION,
  createDefaultFsrsParameters,
  serializeFsrsParameters
} from '../src/lib/server/learning/fsrs-scheduler.js';

const foundationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const activeSql = readFileSync(
  new URL('../drizzle/0020_learner_fsrs_active_reviews.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const resetFreshSql = readFileSync(
  new URL('../drizzle/0024_learner_fsrs_reset_fresh.sql', import.meta.url),
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

  async raw() {
    return this.rows().map((row) => Object.values(row));
  }

  async all() {
    return { success: true, meta: {}, results: this.rows() };
  }

  /** @param {string} [columnName] */
  async first(columnName) {
    const row = this.rows()[0] ?? null;
    if (row == null || columnName == null) return row;
    return row[columnName] ?? null;
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

/** @param {DatabaseSync} sqlite */
function learningDb(sqlite) {
  return /** @type {import('../src/lib/server/db/index.js').LearningDb} */ (
    /** @type {unknown} */ ({ $client: /** @type {D1Database} */ (/** @type {unknown} */ (new SqliteD1Client(sqlite))) })
  );
}

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE user (id text PRIMARY KEY NOT NULL);
    CREATE TABLE concepts (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      parent_id text,
      kind text NOT NULL,
      is_active integer NOT NULL DEFAULT 1
    );
    CREATE TABLE cases (
      id text PRIMARY KEY NOT NULL,
      title text NOT NULL,
      preview_session_id text,
      is_active integer NOT NULL DEFAULT 1
    );
    CREATE TABLE case_concepts (
      case_id text NOT NULL,
      concept_id text NOT NULL,
      role text NOT NULL
    );
    CREATE TABLE tags (
      id text PRIMARY KEY NOT NULL,
      name text NOT NULL,
      is_active integer NOT NULL DEFAULT 1
    );
    CREATE TABLE case_tags (case_id text NOT NULL, tag_id text NOT NULL);
    CREATE TABLE system_tags (system_concept_id text NOT NULL, tag_id text NOT NULL);
    CREATE TABLE assets (id text PRIMARY KEY NOT NULL);
  `);
  sqlite.exec(foundationSql);
  sqlite.exec(activeSql);
  sqlite.exec(resetFreshSql);
  sqlite.exec(`
    INSERT INTO user (id) VALUES ('learner');
    INSERT INTO concepts (id, name, parent_id, kind, is_active) VALUES
      ('system-1', 'Cardiology', NULL, 'system', 1),
      ('system-2', 'Endocrine', NULL, 'system', 1),
      ('topic-1', 'ECG', 'system-1', 'topic', 1);
    INSERT INTO cases (id, title, preview_session_id, is_active) VALUES
      ('case-1', 'Case 1', NULL, 1),
      ('case-2', 'Case 2', NULL, 1);
    INSERT INTO case_concepts (case_id, concept_id, role) VALUES
      ('case-1', 'topic-1', 'primary'),
      ('case-2', 'topic-1', 'primary');
    INSERT INTO tags (id, name, is_active) VALUES ('tag-1', 'Hypocalcaemia', 1);
    INSERT INTO case_tags (case_id, tag_id) VALUES ('case-2', 'tag-1');
    INSERT INTO system_tags (system_concept_id, tag_id) VALUES ('system-2', 'tag-1');
  `);
  return sqlite;
}

/** @param {DatabaseSync} sqlite @param {{retention?:'24m'|'36m'|'60m'|'indefinite',parametersJson?:string}} [options] */
function seedProfile(sqlite, options = {}) {
  const parametersJson = options.parametersJson ?? serializeFsrsParameters(createDefaultFsrsParameters());
  sqlite.prepare(`
    INSERT INTO learner_fsrs_profiles (
      user_id, generation, review_sequence_epoch, parameter_revision,
      scheduler_revision, scheduler_library_version, parameters_json,
      detailed_history_retention, last_optimized_at
    ) VALUES ('learner', 1, 1, 1, ?, ?, ?, ?, 12345)
  `).run(
    FSRS_SCHEDULER_REVISION,
    FSRS_LIBRARY_VERSION,
    parametersJson,
    options.retention ?? '24m'
  );
}

/** @param {DatabaseSync} sqlite @param {string} caseId @param {number} dueAt */
function seedState(sqlite, caseId, dueAt) {
  sqlite.prepare(`
    INSERT INTO learner_case_fsrs (
      user_id, case_id, due_at, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      state_revision
    ) VALUES ('learner', ?, ?, 1, 1, 1, ?, ?, 1)
  `).run(caseId, dueAt, FSRS_SCHEDULER_REVISION, FSRS_LIBRARY_VERSION);
}

/** @param {DatabaseSync} sqlite */
function seedHistoryAndAggregates(sqlite) {
  const recent = Date.now() - 60_000;
  sqlite.prepare(`
    INSERT INTO learner_case_encounters (
      user_id, case_id, free_first_seen_at, free_last_seen_at, free_times_studied,
      first_scheduled_completed_at
    ) VALUES ('learner', 'case-1', 10, 20, 2, 30)
  `).run();
  sqlite.prepare(`
    INSERT INTO learner_case_encounters (
      user_id, case_id, free_first_seen_at, free_last_seen_at, free_times_studied,
      first_scheduled_completed_at
    ) VALUES ('learner', 'case-2', 10, 20, 1, 30)
  `).run();
  sqlite.prepare(`
    INSERT INTO scheduled_review_events (
      id, user_id, case_id, case_title_snapshot, system_id, completed_at,
      rating, content_mode, generation, review_sequence_epoch, sequence_no,
      parameter_revision, scheduler_revision, scheduler_library_version,
      resulting_state_revision, next_due_at
    ) VALUES
      ('old-event', 'learner', 'case-1', 'Case 1 old', 'system-1', 1,
       'again', 'original', 1, 1, 1, 1, ?, ?, 1, 2),
      ('recent-event', 'learner', 'case-2', 'Case 2 recent', 'system-1', ?,
       'good', 'expanded', 1, 1, 2, 1, ?, ?, 1, ?)
  `).run(
    FSRS_SCHEDULER_REVISION,
    FSRS_LIBRARY_VERSION,
    recent,
    FSRS_SCHEDULER_REVISION,
    FSRS_LIBRARY_VERSION,
    recent + 1000
  );
  sqlite.prepare(`
    INSERT INTO learner_optimizer_evidence (
      event_id, user_id, case_id, completed_at, rating, generation,
      review_sequence_epoch, sequence_no
    ) VALUES
      ('old-event', 'learner', 'case-1', 1, 'again', 1, 1, 1),
      ('recent-event', 'learner', 'case-2', ?, 'good', 1, 1, 1)
  `).run(recent);
  sqlite.exec(`
    INSERT INTO learner_aggregates (
      user_id, scheduled_completed, scheduled_again, scheduled_hard,
      scheduled_good, scheduled_easy, free_completed, first_activity_at,
      last_activity_at
    ) VALUES ('learner', 2, 1, 0, 1, 0, 3, 1, ${recent});
    INSERT INTO learner_system_aggregates (
      user_id, system_id, scheduled_completed, scheduled_again,
      scheduled_hard, scheduled_good, scheduled_easy, first_completed_at,
      last_completed_at
    ) VALUES
      ('learner', 'system-1', 2, 1, 0, 1, 0, 1, ${recent}),
      ('learner', 'system-2', 1, 0, 0, 1, 0, ${recent}, ${recent});
  `);
  return recent;
}

/** @param {DatabaseSync} sqlite @param {{id?:string,generation?:number,epoch?:number,parameterRevision?:number}} [boundary] */
function insertScheduledActiveReview(sqlite, boundary = {}) {
  const id = boundary.id ?? 'active-1';
  sqlite.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      expected_state_revision, expected_due_at, run_started_at,
      case_title_snapshot, vignette_snapshot_md, snapshot_version
    ) VALUES (
      ?, 'learner', 'case-1', 'system-1', 'scheduled', 'original', 'due',
      'run-1', 'scope-1', ?, ?, ?, ?, ?, ?, 1, 1, ?,
      'Case 1', 'Frozen vignette', 1
    )
  `).run(
    id,
    JSON.stringify({
      systemId: 'system-1',
      routes: [{ routeType: 'topic', routeId: 'topic-1' }]
    }),
    boundary.generation ?? 1,
    boundary.epoch ?? 1,
    boundary.parameterRevision ?? 1,
    FSRS_SCHEDULER_REVISION,
    FSRS_LIBRARY_VERSION,
    Date.now()
  );
}

/** @param {DatabaseSync} sqlite */
function insertFreeActiveReview(sqlite) {
  sqlite.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      expected_state_revision, expected_due_at, run_started_at,
      case_title_snapshot, vignette_snapshot_md, snapshot_version
    ) VALUES (
      'free-active', 'learner', 'case-1', 'system-1', 'free', 'original', NULL,
      'free-run', 'scope-free', ?, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, 'Case 1', 'Frozen vignette', 1
    )
  `).run(JSON.stringify({
    systemId: 'system-1',
    routes: [{ routeType: 'topic', routeId: 'topic-1' }]
  }));
}

/** @param {DatabaseSync} sqlite @param {string} table */
function count(sqlite, table) {
  return Number(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? 0);
}

test('Reset Progress preserves retained evidence/parameters while atomically invalidating active work', async () => {
  const sqlite = createFixture();
  try {
    const personalized = JSON.stringify({ request_retention: 0.82, personalized: true });
    seedProfile(sqlite, { parametersJson: personalized });
    seedState(sqlite, 'case-1', 1);
    seedHistoryAndAggregates(sqlite);
    insertScheduledActiveReview(sqlite);

    assert.throws(
      () => sqlite.exec("UPDATE learner_fsrs_profiles SET review_sequence_epoch = 2 WHERE user_id = 'learner'"),
      /learner_fsrs_boundary_active_review/,
      'the database must reject a direct boundary move that leaves a Scheduled active Review alive'
    );

    const result = await resetLearnerFsrsProgress({ db: learningDb(sqlite), userId: 'learner' });
    assert.equal(result.initialized, true);
    assert.equal(result.profile?.generation, 1);
    assert.equal(result.profile?.reviewSequenceEpoch, 2);
    assert.equal(result.profile?.parameterRevision, 1);
    assert.equal(result.profile?.parametersJson, personalized);
    assert.equal(count(sqlite, 'active_reviews'), 0);
    assert.equal(count(sqlite, 'learner_case_fsrs'), 0);
    assert.equal(Number(sqlite.prepare("SELECT COUNT(*) AS n FROM scheduled_review_events WHERE id = 'old-event'").get()?.n), 0);
    assert.equal(Number(sqlite.prepare("SELECT COUNT(*) AS n FROM scheduled_review_events WHERE id = 'recent-event'").get()?.n), 1);
    assert.equal(count(sqlite, 'learner_optimizer_evidence'), 2, 'current-generation optimizer sequence evidence survives detailed-history expiry');
    assert.equal(count(sqlite, 'learner_case_encounters'), 2);
    assert.equal(Number(sqlite.prepare("SELECT scheduled_completed FROM learner_aggregates WHERE user_id = 'learner'").get()?.scheduled_completed), 2);

    assert.throws(
      () => insertScheduledActiveReview(sqlite, { id: 'stale-after-reset', generation: 1, epoch: 1, parameterRevision: 1 }),
      /active_review_stale_boundary/,
      'a stale Scheduled creation that loses the race to Reset must fail at the write boundary'
    );
  } finally {
    sqlite.close();
  }
});

test('Fresh FSRS Start advances generation/epoch/revision, restores defaults and prunes pre-Fresh optimizer evidence', async () => {
  const sqlite = createFixture();
  try {
    seedProfile(sqlite, {
      retention: '36m',
      parametersJson: JSON.stringify({ request_retention: 0.81, personalized: true })
    });
    seedState(sqlite, 'case-1', 1);
    seedHistoryAndAggregates(sqlite);
    insertScheduledActiveReview(sqlite);

    const result = await freshLearnerFsrsStart({ db: learningDb(sqlite), userId: 'learner' });
    assert.equal(result.profile.generation, 2);
    assert.equal(result.profile.reviewSequenceEpoch, 2);
    assert.equal(result.profile.parameterRevision, 2);
    assert.equal(result.profile.detailedHistoryRetention, '36m', 'Fresh preserves the learner retention override');
    assert.equal(result.profile.lastOptimizedAt, null);
    assert.equal(JSON.parse(result.profile.parametersJson).request_retention, 0.9);
    assert.equal(count(sqlite, 'active_reviews'), 0);
    assert.equal(count(sqlite, 'learner_case_fsrs'), 0);
    assert.equal(Number(sqlite.prepare("SELECT COUNT(*) AS n FROM scheduled_review_events WHERE id = 'old-event'").get()?.n), 0);
    assert.equal(Number(sqlite.prepare("SELECT COUNT(*) AS n FROM scheduled_review_events WHERE id = 'recent-event'").get()?.n), 1);
    assert.equal(count(sqlite, 'learner_optimizer_evidence'), 0, 'pre-Fresh generations are no longer optimizer eligible');
    assert.equal(count(sqlite, 'learner_case_encounters'), 2);
    assert.equal(Number(sqlite.prepare("SELECT scheduled_completed FROM learner_aggregates WHERE user_id = 'learner'").get()?.scheduled_completed), 2);

    assert.throws(
      () => insertScheduledActiveReview(sqlite, { id: 'stale-after-fresh', generation: 1, epoch: 1, parameterRevision: 1 }),
      /active_review_stale_boundary/,
      'a stale Scheduled creation that loses the race to Fresh must fail at the write boundary'
    );
  } finally {
    sqlite.close();
  }
});

test('uninitialized Reset is a no-op for FSRS profile while Fresh creates the ordinary initial boundary', async () => {
  const sqlite = createFixture();
  try {
    insertFreeActiveReview(sqlite);
    const reset = await resetLearnerFsrsProgress({ db: learningDb(sqlite), userId: 'learner' });
    assert.equal(reset.initialized, false);
    assert.equal(count(sqlite, 'learner_fsrs_profiles'), 0);
    assert.equal(count(sqlite, 'active_reviews'), 0, 'Reset still invalidates a Free active Review');

    const fresh = await freshLearnerFsrsStart({ db: learningDb(sqlite), userId: 'learner' });
    assert.equal(fresh.profile.generation, 1);
    assert.equal(fresh.profile.reviewSequenceEpoch, 1);
    assert.equal(fresh.profile.parameterRevision, 1);
    assert.equal(JSON.parse(fresh.profile.parametersJson).request_retention, 0.9);
  } finally {
    sqlite.close();
  }
});

test('learner Progress separates coverage/memory, uses retained history and reports System-level progress', async () => {
  const sqlite = createFixture();
  try {
    seedProfile(sqlite);
    seedState(sqlite, 'case-1', 1);
    seedState(sqlite, 'case-2', Date.now() + 86_400_000);
    const recent = seedHistoryAndAggregates(sqlite);

    const progress = await getLearnerFsrsProgress({ db: learningDb(sqlite), userId: 'learner' });
    assert.deepEqual(progress.coverage, { enteredSrs: 2, eligibleCases: 2 });
    assert.deepEqual(progress.memory, { due: 1, notDue: 1 });
    assert.equal(progress.activity.scheduledCompleted, 2);
    assert.equal(progress.activity.recentScheduled30d, 1);
    assert.equal(progress.activity.uniqueScheduledCases, 2);
    assert.equal(progress.activity.freeCompleted, 3);
    assert.deepEqual(progress.ratings, { again: 1, hard: 0, good: 1, easy: 0 });
    assert.equal(progress.recentHistory.length, 1, 'expired detailed history must be hidden before physical cleanup is required');
    assert.equal(progress.recentHistory[0].id, 'recent-event');
    assert.equal(progress.recentHistory[0].completedAt, recent);

    const cardiology = progress.systems.find((system) => system.systemId === 'system-1');
    const endocrine = progress.systems.find((system) => system.systemId === 'system-2');
    assert.deepEqual(
      cardiology && {
        eligibleCases: cardiology.eligibleCases,
        enteredSrs: cardiology.enteredSrs,
        due: cardiology.due,
        notDue: cardiology.notDue,
        scheduledCompleted: cardiology.scheduledCompleted
      },
      { eligibleCases: 2, enteredSrs: 2, due: 1, notDue: 1, scheduledCompleted: 2 }
    );
    assert.deepEqual(
      endocrine && {
        eligibleCases: endocrine.eligibleCases,
        enteredSrs: endocrine.enteredSrs,
        due: endocrine.due,
        notDue: endocrine.notDue,
        scheduledCompleted: endocrine.scheduledCompleted
      },
      { eligibleCases: 1, enteredSrs: 1, due: 0, notDue: 1, scheduledCompleted: 1 },
      'curated cross-System Tag exposure contributes to System-level learner progress'
    );
  } finally {
    sqlite.close();
  }
});
