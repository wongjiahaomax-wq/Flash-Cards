// @ts-nocheck
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  beginStudyDataDeletion,
  getStudyDataDeletionStatus,
  isStudyDataDeletionActive
} from '../src/lib/server/db/learner-study-data-deletion.ts';
import { STUDY_DATA_DELETION_PHASES } from '../src/lib/server/db/study-data-deletion-schema.js';
import { applyCurrentSchema } from './current-schema.js';

const migrationSql = readFileSync(
  new URL('../drizzle/0027_self_service_study_data_deletion.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

class SqliteD1Statement {
  constructor(client, sql, params = []) {
    this.client = client;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new SqliteD1Statement(this.client, this.sql, params);
  }

  async first() {
    return this.client.database.prepare(this.sql).get(...this.params) ?? null;
  }

  async run() {
    const result = this.client.database.prepare(this.sql).run(...this.params);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
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
        results.push({ success: true, results: [], meta: { changes: Number(result.changes) } });
      }
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function fixture({ preTranche = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  if (preTranche) {
    const files = readdirSync(new URL('../drizzle/', import.meta.url))
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .filter((name) => name !== '0027_self_service_study_data_deletion.sql')
      .sort();
    sqlite.exec(files.map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8')).join('\n').replaceAll('--> statement-breakpoint', ''));
  } else {
    applyCurrentSchema(sqlite);
  }
  const client = new SqliteD1Client(sqlite);
  return { sqlite, db: { $client: client } };
}

function seedIdentities(sqlite) {
  sqlite.exec(`
    INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
    VALUES
      ('learner-1', 'Learner', 'learner@example.test', 1, 101, 101, 'user', 0),
      ('admin-1', 'Admin', 'admin@example.test', 1, 202, 202, 'admin', 0);
  `);
}

function seedActiveReviewContent(sqlite) {
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)
    VALUES
      ('system-1', 'System 1', 'system-1', 'system', NULL, 1),
      ('topic-1', 'Topic 1', 'topic-1', 'topic', 'system-1', 1);
    INSERT INTO cases (id, title, preview_session_id, is_active)
    VALUES ('case-1', 'Case 1', NULL, 1);
    INSERT INTO case_concepts (case_id, concept_id, role)
    VALUES ('case-1', 'topic-1', 'primary');
  `);
}

function insertActiveReview(sqlite, userId, id = `active-${userId}`) {
  const scope = JSON.stringify({
    version: 2,
    systemId: 'system-1',
    runScope: {
      systems: [{
        systemId: 'system-1',
        mode: 'routes',
        routes: [{ routeType: 'topic', routeId: 'topic-1' }]
      }]
    }
  });
  sqlite.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      expected_state_revision, expected_due_at, run_started_at,
      case_title_snapshot, vignette_snapshot_md, snapshot_version
    ) VALUES (?, ?, 'case-1', 'system-1', 'free', 'original', NULL,
      ?, 'scope', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      'Case 1', NULL, 1)
  `).run(id, userId, `run-${id}`, scope);
}

function marker(sqlite, userId) {
  return sqlite.prepare(`
    SELECT user_id, phase, requested_at, updated_at, batches_completed, completed_at
    FROM learner_study_data_deletions WHERE user_id = ?
  `).get(userId);
}

test('study-data marker exposes the complete staged phase vocabulary and is registered with Drizzle', () => {
  const source = readFileSync(new URL('../drizzle.config.js', import.meta.url), 'utf8');
  assert.match(source, /study-data-deletion-schema\.js/);
  assert.deepEqual(STUDY_DATA_DELETION_PHASES, [
    'active_reviews', 'free_receipts', 'scheduled_events', 'optimizer_evidence',
    'case_state', 'case_encounters', 'monthly_buckets', 'system_aggregates',
    'learner_aggregates', 'legacy_review_questions', 'legacy_review_assets',
    'legacy_reviews', 'profile', 'verify_empty', 'complete'
  ]);
});

test('begin creates a durable fence and retries do not rewind active progress', async () => {
  const { sqlite, db } = fixture();
  try {
    seedIdentities(sqlite);
    const first = await beginStudyDataDeletion({ db, userId: 'learner-1' });
    sqlite.prepare(`
      UPDATE learner_study_data_deletions
      SET batches_completed = 4, updated_at = updated_at + 1
      WHERE user_id = 'learner-1'
    `).run();
    const beforeRetry = marker(sqlite, 'learner-1');
    const second = await beginStudyDataDeletion({ db, userId: 'learner-1' });

    assert.equal(first.phase, 'active_reviews');
    assert.equal(first.inProgress, true);
    assert.equal(second.phase, 'active_reviews');
    assert.equal(second.batchesCompleted, 4);
    assert.equal(second.requestedAt, Number(beforeRetry.requested_at));
    assert.equal(second.updatedAt, Number(beforeRetry.updated_at));
    assert.equal(await isStudyDataDeletionActive(db, 'learner-1'), true);
  } finally {
    sqlite.close();
  }
});

test('the database rejects a new Active Review while fenced and permits deletion-marker ownership for learner and Admin identities', async () => {
  const { sqlite, db } = fixture();
  try {
    seedIdentities(sqlite);
    seedActiveReviewContent(sqlite);
    await beginStudyDataDeletion({ db, userId: 'learner-1' });
    assert.throws(
      () => insertActiveReview(sqlite, 'learner-1'),
      /learner_study_data_deletion_in_progress/
    );

    await beginStudyDataDeletion({ db, userId: 'admin-1' });
    assert.equal(marker(sqlite, 'learner-1').phase, 'active_reviews');
    assert.equal(marker(sqlite, 'admin-1').phase, 'active_reviews');
  } finally {
    sqlite.close();
  }
});

test('complete is non-fencing and a later explicit begin reactivates the marker', async () => {
  const { sqlite, db } = fixture();
  try {
    seedIdentities(sqlite);
    seedActiveReviewContent(sqlite);
    sqlite.exec(`
      INSERT INTO learner_study_data_deletions (user_id, phase, batches_completed, completed_at)
      VALUES ('learner-1', 'complete', 9, 999);
    `);
    assert.equal(await isStudyDataDeletionActive(db, 'learner-1'), false);
    insertActiveReview(sqlite, 'learner-1', 'fresh-study');
    assert.equal((await getStudyDataDeletionStatus(db, 'learner-1')).inProgress, false);

    const restarted = await beginStudyDataDeletion({ db, userId: 'learner-1' });
    assert.equal(restarted.phase, 'active_reviews');
    assert.equal(restarted.batchesCompleted, 0);
    assert.equal(restarted.completedAt, null);
    assert.throws(
      () => insertActiveReview(sqlite, 'learner-1', 'blocked-second-review'),
      /learner_study_data_deletion_in_progress/
    );
  } finally {
    sqlite.close();
  }
});

test('applying the marker migration does not mutate existing learner study data', () => {
  const { sqlite } = fixture({ preTranche: true });
  try {
    seedIdentities(sqlite);
    sqlite.exec(`
      INSERT INTO learner_preferences (user_id, expanded_learning, scheduled_order)
      VALUES ('learner-1', 1, 'new_first');
      INSERT INTO learner_system_monthly_buckets (
        user_id, system_id, month_start, scheduled_completed,
        scheduled_good, first_completed_at, last_completed_at
      ) VALUES ('learner-1', 'system-1', 0, 1, 1, 123, 123);
    `);
    const before = {
      preferences: sqlite.prepare("SELECT * FROM learner_preferences WHERE user_id = 'learner-1'").get(),
      monthly: sqlite.prepare("SELECT * FROM learner_system_monthly_buckets WHERE user_id = 'learner-1'").get()
    };

    sqlite.exec(migrationSql);

    assert.deepEqual(sqlite.prepare("SELECT * FROM learner_preferences WHERE user_id = 'learner-1'").get(), before.preferences);
    assert.deepEqual(sqlite.prepare("SELECT * FROM learner_system_monthly_buckets WHERE user_id = 'learner-1'").get(), before.monthly);
    assert.equal(marker(sqlite, 'learner-1'), undefined);
  } finally {
    sqlite.close();
  }
});
