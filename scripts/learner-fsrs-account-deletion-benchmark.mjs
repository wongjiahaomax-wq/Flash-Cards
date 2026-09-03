import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import {
  LEARNER_ACCOUNT_DELETION_BATCH_SIZE,
  advanceLearnerAccountDeletion,
  beginLearnerAccountDeletion
} from '../src/lib/server/db/learner-account-deletion.ts';

const drizzleDirectory = new URL('../drizzle/', import.meta.url);
const migrationSql = readdirSync(drizzleDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(new URL(name, drizzleDirectory), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

class SqliteD1Statement {
  constructor(client, sql, params = []) {
    this.client = client;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) { return new SqliteD1Statement(this.client, this.sql, params); }
  async all() { return { success: true, meta: {}, results: this.client.database.prepare(this.sql).all(...this.params) }; }
  async first() { return this.client.database.prepare(this.sql).get(...this.params) ?? null; }
  async run() {
    const result = this.client.database.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
}

class SqliteD1Client {
  constructor(database) { this.database = database; }
  prepare(sql) { return new SqliteD1Statement(this, sql); }
  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const output = [];
      for (const statement of statements) {
        const result = this.database.prepare(statement.sql).run(...statement.params);
        output.push({ success: true, meta: { changes: Number(result.changes) }, results: [] });
      }
      this.database.exec('COMMIT');
      return output;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function measured(fn) {
  const started = performance.now();
  return Promise.resolve(fn()).then((value) => ({
    value,
    durationMs: +(performance.now() - started).toFixed(3)
  }));
}

function createDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = MEMORY; PRAGMA synchronous = OFF;');
  db.exec(migrationSql);
  return db;
}

function seedMatureLearner(db, options) {
  const { caseCount, eventCount, systemCount, freeReceiptCount } = options;
  const now = Date.UTC(2026, 8, 3, 0, 0, 0);
  db.exec('DROP TRIGGER scheduled_review_events_active_guard;');
  db.exec('DROP TRIGGER active_reviews_content_scope_guard;');
  db.exec('DROP TRIGGER free_review_completion_receipts_active_guard;');
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
      VALUES ('benchmark-user', 'Mature Learner', 'mature@example.test', 1, ?, ?, 'user', 0)
    `).run(now - 5 * 365 * 86_400_000, now);
    db.prepare(`
      INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
      VALUES ('benchmark-account', 'benchmark-user', 'credential', 'benchmark-user', 'fixture', ?, ?)
    `).run(now, now);
    db.prepare(`
      INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt)
      VALUES ('benchmark-reset', 'reset-password:benchmark-token', 'benchmark-user', ?, ?, ?)
    `).run(now + 86_400_000, now, now);
    const insertSession = db.prepare(`
      INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
      VALUES (?, ?, ?, ?, ?, 'benchmark-user')
    `);
    for (let index = 0; index < 20; index += 1) {
      insertSession.run(`session-${index}`, now + 86_400_000, `token-${index}`, now, now);
    }

    const insertSystem = db.prepare(`INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES (?, ?, ?, 'system', NULL, 1)`);
    for (let index = 0; index < systemCount; index += 1) {
      insertSystem.run(`system-${index}`, `System ${index}`, `system-${index}`);
    }

    const insertCase = db.prepare(`INSERT INTO cases (id, title, is_active) VALUES (?, ?, 1)`);
    const insertState = db.prepare(`
      INSERT INTO learner_case_fsrs (
        user_id, case_id, due_at, generation, review_sequence_epoch,
        parameter_revision, scheduler_revision, scheduler_library_version, state_revision
      ) VALUES ('benchmark-user', ?, ?, 1, 1, 1, 1, '5.4.2', 1)
    `);
    const insertEncounter = db.prepare(`
      INSERT INTO learner_case_encounters (user_id, case_id, first_scheduled_completed_at)
      VALUES ('benchmark-user', ?, ?)
    `);
    for (let index = 0; index < caseCount; index += 1) {
      const caseId = `case-${String(index).padStart(5, '0')}`;
      insertCase.run(caseId, `Case ${index}`);
      insertState.run(caseId, now + (index % 30) * 86_400_000);
      insertEncounter.run(caseId, now - 365 * 86_400_000);
    }

    db.prepare(`INSERT INTO learner_preferences (user_id) VALUES ('benchmark-user')`).run();
    db.prepare(`
      INSERT INTO learner_fsrs_profiles (user_id, scheduler_library_version, parameters_json)
      VALUES ('benchmark-user', '5.4.2', '{}')
    `).run();
    db.prepare(`
      INSERT INTO learner_aggregates (user_id, scheduled_completed, scheduled_good, first_activity_at, last_activity_at)
      VALUES ('benchmark-user', ?, ?, ?, ?)
    `).run(eventCount, eventCount, now - 5 * 365 * 86_400_000, now);
    const insertSystemAggregate = db.prepare(`
      INSERT INTO learner_system_aggregates (
        user_id, system_id, scheduled_completed, scheduled_good, first_completed_at, last_completed_at
      ) VALUES ('benchmark-user', ?, ?, ?, ?, ?)
    `);
    for (let index = 0; index < systemCount; index += 1) {
      const count = Math.floor((eventCount + systemCount - 1 - index) / systemCount);
      insertSystemAggregate.run(`system-${index}`, count, count, now - 5 * 365 * 86_400_000, now);
    }

    const insertEvent = db.prepare(`
      INSERT INTO scheduled_review_events (
        id, user_id, case_id, case_title_snapshot, system_id, completed_at,
        rating, content_mode, generation, review_sequence_epoch, sequence_no,
        parameter_revision, scheduler_revision, scheduler_library_version,
        resulting_state_revision, next_due_at, queue_class, run_id,
        scope_fingerprint, run_started_at, resulting_state
      ) VALUES (?, 'benchmark-user', ?, ?, ?, ?, 'good', 'original', 1, 1, ?, 1, 1,
        '5.4.2', 1, ?, 'due', 'benchmark-run', 'benchmark-scope', ?, 2)
    `);
    const insertEvidence = db.prepare(`
      INSERT INTO learner_optimizer_evidence (
        event_id, user_id, case_id, completed_at, rating, generation, review_sequence_epoch, sequence_no
      ) VALUES (?, 'benchmark-user', ?, ?, 'good', 1, 1, ?)
    `);
    const sequenceByCase = new Uint32Array(caseCount);
    for (let index = 0; index < eventCount; index += 1) {
      const caseIndex = index % caseCount;
      const caseId = `case-${String(caseIndex).padStart(5, '0')}`;
      const sequenceNo = ++sequenceByCase[caseIndex];
      const systemId = `system-${index % systemCount}`;
      const monthOffset = index % 60;
      const completedAt = Date.UTC(2021 + Math.floor(monthOffset / 12), monthOffset % 12, 15, 12, index % 60, 0);
      const eventId = `event-${String(index).padStart(7, '0')}`;
      insertEvent.run(eventId, caseId, `Case ${caseIndex}`, systemId, completedAt, sequenceNo, completedAt + 86_400_000, completedAt);
      insertEvidence.run(`optimizer-${String(index).padStart(7, '0')}`, caseId, completedAt, sequenceNo);
    }

    const insertReceipt = db.prepare(`
      INSERT INTO free_review_completion_receipts (
        id, user_id, case_id, completed_at, resulting_free_times_studied, expires_at
      ) VALUES (?, 'benchmark-user', 'case-00000', ?, 1, ?)
    `);
    for (let index = 0; index < freeReceiptCount; index += 1) {
      insertReceipt.run(`free-${index}`, now - index * 1000, now + 86_400_000);
    }

    db.prepare(`
      INSERT INTO active_reviews (
        id, user_id, case_id, system_id, study_mode, content_mode, run_id,
        scope_fingerprint, scope_json, case_title_snapshot, revealed_at, expires_at
      ) VALUES (
        'active-review', 'benchmark-user', 'case-00000', 'system-0', 'free', 'original',
        'free-run', 'free-scope', '{"systemId":"system-0","routes":[]}', 'Frozen Case', ?, ?
      )
    `).run(now, now + 86_400_000);
    const insertActiveQuestion = db.prepare(`
      INSERT INTO active_review_questions (
        id, active_review_id, question_prompt_id, source_type, display_order,
        prompt_snapshot_md, answer_snapshot_md
      ) VALUES (?, 'active-review', ?, 'case', ?, 'Prompt', 'Answer')
    `);
    for (let index = 0; index < 256; index += 1) {
      insertActiveQuestion.run(`active-question-${index}`, `prompt-${index}`, index);
    }
    const insertAsset = db.prepare(`
      INSERT INTO assets (id, type, storage_key, mime_type, is_active)
      VALUES (?, 'image', ?, 'image/png', 1)
    `);
    const insertActiveAsset = db.prepare(`
      INSERT INTO active_review_assets (
        id, active_review_id, asset_id, display_order, storage_key_snapshot
      ) VALUES (?, 'active-review', ?, ?, ?)
    `);
    for (let index = 0; index < 64; index += 1) {
      const assetId = `asset-${index}`;
      const storageKey = `benchmark/${index}.png`;
      insertAsset.run(assetId, storageKey);
      insertActiveAsset.run(`active-asset-${index}`, assetId, index, storageKey);
    }

    db.exec('COMMIT');
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

export async function runLearnerAccountDeletionBenchmark(options = {}) {
  const fixture = {
    caseCount: options.caseCount ?? 5_000,
    eventCount: options.eventCount ?? 20_000,
    systemCount: options.systemCount ?? 12,
    freeReceiptCount: options.freeReceiptCount ?? 2_000
  };
  const db = createDatabase();
  const client = new SqliteD1Client(db);
  const learningDb = { $client: client };
  try {
    const seed = await measured(() => seedMatureLearner(db, fixture));
    const monthlyBucketCount = Number(db.prepare(`
      SELECT COUNT(*) AS n FROM learner_system_monthly_buckets WHERE user_id = 'benchmark-user'
    `).get().n);
    const authVerificationCount = Number(db.prepare(`
      SELECT COUNT(*) AS n FROM verification WHERE value = 'benchmark-user'
    `).get().n);
    assert.equal(authVerificationCount, 1);

    let directDeleteBlocked = false;
    const directDelete = await measured(() => {
      try {
        db.exec("DELETE FROM user WHERE id = 'benchmark-user';");
      } catch (error) {
        if (!String(error?.message ?? error).includes('learner_account_requires_staged_deletion')) throw error;
        directDeleteBlocked = true;
      }
    });
    assert.equal(directDeleteBlocked, true);

    const begin = await measured(() => beginLearnerAccountDeletion({ db: learningDb, userId: 'benchmark-user' }));
    const stepDurations = [];
    const stepRows = [];
    let ready = false;
    let phase = begin.value.phase;
    for (let step = 0; step < 10_000 && !ready; step += 1) {
      const result = await measured(() => advanceLearnerAccountDeletion({
        db: learningDb,
        userId: 'benchmark-user',
        batchSize: LEARNER_ACCOUNT_DELETION_BATCH_SIZE
      }));
      stepDurations.push(result.durationMs);
      stepRows.push(result.value.rowsDeleted);
      phase = result.value.phase;
      ready = result.value.readyForIdentityDelete;
    }
    assert.equal(ready, true, `staged deletion did not reach identity_ready; last phase=${phase}`);
    assert.ok(Math.max(...stepRows) <= LEARNER_ACCOUNT_DELETION_BATCH_SIZE);
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM verification WHERE value = 'benchmark-user'").get().n), 0);

    const identityDelete = await measured(() => db.exec("DELETE FROM user WHERE id = 'benchmark-user';"));
    const remainingUser = Number(db.prepare("SELECT COUNT(*) AS n FROM user WHERE id = 'benchmark-user'").get().n);
    const remainingAccount = Number(db.prepare("SELECT COUNT(*) AS n FROM account WHERE userId = 'benchmark-user'").get().n);
    const remainingVerification = Number(db.prepare("SELECT COUNT(*) AS n FROM verification WHERE value = 'benchmark-user'").get().n);
    assert.equal(remainingUser, 0);
    assert.equal(remainingAccount, 0);
    assert.equal(remainingVerification, 0);

    return {
      kind: 'mature learner staged-deletion scale gate',
      decision: 'staged',
      directCascadeEligible: false,
      rationale:
        'Scheduled history and current-generation optimizer evidence are not hard-capped, so no finite one-shot mature-account cascade can be proven bounded. The staged path caps each child delete at 1,000 rows.',
      fixture: {
        ...fixture,
        monthlyBucketCount,
        authVerifications: authVerificationCount,
        activeReviewQuestions: 256,
        activeReviewAssets: 64,
        authSessions: 20
      },
      timingsMs: {
        seed: seed.durationMs,
        blockedDirectDelete: directDelete.durationMs,
        accessSafeBegin: begin.durationMs,
        stagedTotal: +stepDurations.reduce((sum, value) => sum + value, 0).toFixed(3),
        stagedMean: +(stepDurations.reduce((sum, value) => sum + value, 0) / stepDurations.length).toFixed(3),
        stagedMax: +Math.max(...stepDurations).toFixed(3),
        identityDelete: identityDelete.durationMs
      },
      staged: {
        steps: stepDurations.length,
        batchSize: LEARNER_ACCOUNT_DELETION_BATCH_SIZE,
        maximumRowsDeletedInOneStep: Math.max(...stepRows),
        finalPhase: phase
      },
      residual: { remainingUser, remainingAccount, remainingVerification }
    };
  } finally {
    db.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await runLearnerAccountDeletionBenchmark();
  console.log(JSON.stringify(result, null, 2));
}
