// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  getAdminLearnerTrendSeries,
  getLearnerAnalyticsDetail
} from '../src/lib/server/db/fsrs-admin-analytics.ts';
import {
  advanceLearnerAccountDeletion,
  beginLearnerAccountDeletion
} from '../src/lib/server/db/learner-account-deletion.ts';
import { applyCurrentSchema } from './current-schema.js';

class SqliteD1Statement {
  constructor(client, sql, params = []) {
    this.client = client;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new SqliteD1Statement(this.client, this.sql, params);
  }

  rows() {
    return this.client.database.prepare(this.sql).all(...this.params);
  }

  async all() {
    return { success: true, meta: {}, results: this.rows() };
  }

  async first() {
    return this.rows()[0] ?? null;
  }

  async raw() {
    return this.rows().map((row) => Object.values(row));
  }

  async run() {
    const result = this.client.database.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
      results: []
    };
  }
}

class SqliteD1Client {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new SqliteD1Statement(this, sql);
  }

  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) {
        const result = this.database.prepare(statement.sql).run(...statement.params);
        results.push({
          success: true,
          meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
          results: []
        });
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
  applyCurrentSchema(sqlite);
  const client = new SqliteD1Client(sqlite);
  const db = { $client: client };
  return { sqlite, client, db };
}

function seedLearnerAndSystems(sqlite) {
  const accountCreatedAt = Date.UTC(2025, 11, 12, 10, 0, 0);
  sqlite.prepare(`
    INSERT INTO user (
      id, name, email, emailVerified, createdAt, updatedAt, role, banned
    ) VALUES (?, 'Learner A', 'learner-a@example.test', 1, ?, ?, 'user', 0)
  `).run('learner-a', accountCreatedAt, accountCreatedAt);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('system-a', 'System A', 'system-a', 'system', NULL, 1),
      ('system-b', 'System B', 'system-b', 'system', NULL, 1);
  `);
}

function insertSyntheticScheduledEvent(sqlite, { id, systemId, completedAt, rating = 'good', sequenceNo = 1 }) {
  sqlite.prepare(`
    INSERT INTO scheduled_review_events (
      id, user_id, case_id, case_title_snapshot, system_id, completed_at,
      rating, content_mode, generation, review_sequence_epoch, sequence_no,
      parameter_revision, scheduler_revision, scheduler_library_version,
      resulting_state_revision, next_due_at, queue_class, run_id,
      scope_fingerprint, run_started_at, resulting_state
    ) VALUES (?, 'learner-a', ?, ?, ?, ?, ?, 'original', 1, 1, ?, 1, 1,
      '5.4.2', ?, ?, 'due', 'synthetic-run', 'synthetic-scope', ?, 2)
  `).run(
    id,
    `case-${id}`,
    `Case ${id}`,
    systemId,
    completedAt,
    rating,
    sequenceNo,
    sequenceNo,
    completedAt + 86_400_000,
    completedAt
  );
}

test('monthly System buckets are transactionally populated and survive detailed-history expiry', async () => {
  const { sqlite, db } = fixture();
  try {
    seedLearnerAndSystems(sqlite);
    sqlite.exec('DROP TRIGGER scheduled_review_events_active_guard;');

    const january = Date.UTC(2026, 0, 15, 12, 0, 0);
    const february = Date.UTC(2026, 1, 3, 12, 0, 0);
    insertSyntheticScheduledEvent(sqlite, { id: 'event-jan-good', systemId: 'system-a', completedAt: january, rating: 'good', sequenceNo: 1 });
    insertSyntheticScheduledEvent(sqlite, { id: 'event-jan-again', systemId: 'system-a', completedAt: january + 1_000, rating: 'again', sequenceNo: 2 });
    insertSyntheticScheduledEvent(sqlite, { id: 'event-feb-easy', systemId: 'system-b', completedAt: february, rating: 'easy', sequenceNo: 1 });

    const januaryBucket = sqlite.prepare(`
      SELECT * FROM learner_system_monthly_buckets
      WHERE user_id = 'learner-a' AND system_id = 'system-a'
    `).get();
    assert.equal(januaryBucket.scheduled_completed, 2);
    assert.equal(januaryBucket.scheduled_again, 1);
    assert.equal(januaryBucket.scheduled_good, 1);
    assert.equal(januaryBucket.month_start, Date.UTC(2026, 0, 1));

    sqlite.exec("DELETE FROM scheduled_review_events WHERE user_id = 'learner-a';");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM scheduled_review_events WHERE user_id = 'learner-a'").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM learner_system_monthly_buckets WHERE user_id = 'learner-a'").get().n, 2);

    const detail = await getLearnerAnalyticsDetail(db, 'learner-a');
    assert.equal(detail.recentHistory.length, 0, 'expired detailed history must not be reconstructed');
    assert.deepEqual(detail.monthlySystems.map((row) => [row.month, row.systemId, row.scheduledCompleted]), [
      ['2026-01', 'system-a', 2],
      ['2026-02', 'system-b', 1]
    ]);

    const trends = await getAdminLearnerTrendSeries(db);
    assert.equal(trends.cohortDefinition, 'learner_account_created_utc_month');
    assert.deepEqual(trends.cohortMonthly.map((row) => [row.cohortMonth, row.month, row.scheduledCompleted]), [
      ['2025-12', '2026-01', 2],
      ['2025-12', '2026-02', 1]
    ]);
  } finally {
    sqlite.close();
  }
});

test('monthly bucket attribution independently keeps a historical System identity alive', () => {
  const { sqlite } = fixture();
  try {
    seedLearnerAndSystems(sqlite);
    sqlite.prepare(`
      INSERT INTO learner_system_monthly_buckets (
        user_id, system_id, month_start, scheduled_completed, scheduled_good,
        first_completed_at, last_completed_at
      ) VALUES ('learner-a', 'system-a', ?, 1, 1, ?, ?)
    `).run(Date.UTC(2026, 0, 1), Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 2));

    assert.throws(
      () => sqlite.exec("UPDATE concepts SET kind = 'topic' WHERE id = 'system-a';"),
      /durable learner FSRS monthly history/i
    );
    assert.throws(
      () => sqlite.exec("DELETE FROM concepts WHERE id = 'system-a';"),
      /durable learner FSRS monthly history/i
    );
    assert.equal(sqlite.prepare("SELECT kind FROM concepts WHERE id = 'system-a'").get().kind, 'system');
  } finally {
    sqlite.close();
  }
});

function seedDeletionFixture(sqlite) {
  seedLearnerAndSystems(sqlite);
  sqlite.exec(`
    INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
    VALUES ('account-a', 'learner-a', 'credential', 'learner-a', 'not-a-real-password-hash', 1, 1);
    INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
    VALUES ('session-a', 9999999999999, 'session-token-a', 1, 1, 'learner-a');

    INSERT INTO learner_preferences (user_id) VALUES ('learner-a');
    INSERT INTO learner_fsrs_profiles (
      user_id, scheduler_library_version, parameters_json
    ) VALUES ('learner-a', '5.4.2', '{}');
    INSERT INTO learner_aggregates (user_id, scheduled_completed) VALUES ('learner-a', 4);
    INSERT INTO learner_system_aggregates (user_id, system_id, scheduled_completed)
    VALUES ('learner-a', 'system-a', 4);

    INSERT INTO cases (id, title, is_active) VALUES
      ('case-1', 'Case 1', 1), ('case-2', 'Case 2', 1), ('case-3', 'Case 3', 1);
    INSERT INTO learner_case_fsrs (
      user_id, case_id, due_at, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version
    ) VALUES
      ('learner-a', 'case-1', 1, 1, 1, 1, 1, '5.4.2'),
      ('learner-a', 'case-2', 1, 1, 1, 1, 1, '5.4.2'),
      ('learner-a', 'case-3', 1, 1, 1, 1, 1, '5.4.2');
    INSERT INTO learner_case_encounters (user_id, case_id) VALUES
      ('learner-a', 'case-1'), ('learner-a', 'case-2'), ('learner-a', 'case-3');
  `);

  sqlite.exec('DROP TRIGGER scheduled_review_events_active_guard;');
  for (let index = 0; index < 5; index += 1) {
    const completedAt = Date.UTC(2026, index % 2, 10 + index);
    insertSyntheticScheduledEvent(sqlite, {
      id: `deletion-event-${index}`,
      systemId: 'system-a',
      completedAt,
      rating: index % 2 ? 'again' : 'good',
      sequenceNo: index + 1
    });
    sqlite.prepare(`
      INSERT INTO learner_optimizer_evidence (
        event_id, user_id, case_id, completed_at, rating,
        generation, review_sequence_epoch, sequence_no
      ) VALUES (?, 'learner-a', 'case-1', ?, 'good', 1, 1, ?)
    `).run(`optimizer-${index}`, completedAt, index + 1);
  }

  sqlite.exec(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, run_id,
      scope_fingerprint, scope_json, case_title_snapshot, revealed_at, expires_at
    ) VALUES (
      'active-free', 'learner-a', 'case-1', 'system-a', 'free', 'original', 'free-run',
      'free-scope', '{"systemId":"system-a","routes":[]}', 'Frozen case',
      1000, 9999999999999
    );
    INSERT INTO active_review_questions (
      id, active_review_id, question_prompt_id, source_type, display_order,
      prompt_snapshot_md, answer_snapshot_md
    ) VALUES ('active-question', 'active-free', 'prompt-snapshot', 'case', 0, 'Prompt', 'Answer');
    INSERT INTO assets (id, type, storage_key, mime_type, is_active)
    VALUES ('asset-a', 'image', 'test/asset-a.png', 'image/png', 1);
    INSERT INTO active_review_assets (
      id, active_review_id, asset_id, display_order, storage_key_snapshot
    ) VALUES ('active-asset', 'active-free', 'asset-a', 0, 'test/asset-a.png');
    INSERT INTO free_review_completion_receipts (
      id, user_id, case_id, completed_at, resulting_free_times_studied, expires_at
    ) VALUES ('active-free', 'learner-a', 'case-1', 1000, 1, 9999999999999);
  `);
}

const LEARNER_TABLES = [
  'learner_preferences',
  'learner_fsrs_profiles',
  'learner_case_fsrs',
  'learner_case_encounters',
  'scheduled_review_events',
  'learner_optimizer_evidence',
  'learner_aggregates',
  'learner_system_aggregates',
  'learner_system_monthly_buckets',
  'active_reviews',
  'active_review_questions',
  'active_review_assets',
  'free_review_completion_receipts',
  'learner_account_deletions'
];

test('staged learner deletion revokes access first, bounds every step, is retry-safe, and clears all learner-owned FSRS/runtime rows', async () => {
  const { sqlite, db } = fixture();
  try {
    seedDeletionFixture(sqlite);

    assert.throws(
      () => sqlite.exec("DELETE FROM user WHERE id = 'learner-a';"),
      /requires_staged_deletion/i,
      'a mature learner cannot be removed through the direct cascade path'
    );

    const started = await beginLearnerAccountDeletion({ db, userId: 'learner-a' });
    assert.equal(started.phase, 'free_receipts');
    assert.equal(sqlite.prepare("SELECT banned FROM user WHERE id = 'learner-a'").get().banned, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM session WHERE userId = 'learner-a'").get().n, 0);
    assert.throws(
      () => sqlite.exec(`
        INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
        VALUES ('new-session', 9999999999999, 'new-token', 1, 1, 'learner-a');
      `),
      /deletion_in_progress/i,
      'a staged learner cannot regain a new Better Auth session'
    );

    let ready = false;
    const deletionSteps = [];
    for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
      const result = await advanceLearnerAccountDeletion({ db, userId: 'learner-a', batchSize: 2 });
      deletionSteps.push(result);
      assert.ok(result.rowsDeleted <= 2, `deletion step exceeded the requested bound: ${result.rowsDeleted}`);
      ready = result.readyForIdentityDelete;
    }
    assert.equal(ready, true, 'bounded retries should reach the identity-ready state');
    assert.ok(deletionSteps.filter((step) => step.rowsDeleted === 2).length >= 2, 'fixture should require repeated bounded chunks');

    sqlite.exec("DELETE FROM user WHERE id = 'learner-a';");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM user WHERE id = 'learner-a'").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM account WHERE userId = 'learner-a'").get().n, 0);
    for (const table of LEARNER_TABLES) {
      const column = table.startsWith('active_review_') ? 'active_review_id' : 'user_id';
      if (table === 'active_review_questions' || table === 'active_review_assets') {
        assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
      } else {
        assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = 'learner-a'`).get().n, 0, table);
      }
    }
  } finally {
    sqlite.close();
  }
});
