// @ts-nocheck
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  advanceStudyDataDeletion,
  beginStudyDataDeletion,
  getStudyDataDeletionStatus,
  isStudyDataDeletionActive,
  STUDY_DATA_DELETION_BATCH_SIZE,
  STUDY_DATA_DELETION_DESCRIPTORS
} from '../src/lib/server/db/learner-study-data-deletion.ts';
import {
  advanceLearnerAccountDeletion,
  beginLearnerAccountDeletion
} from '../src/lib/server/db/learner-account-deletion.ts';
import { STUDY_DATA_DELETION_PHASES } from '../src/lib/server/db/study-data-deletion-schema.js';
import {
  freshLearnerFsrsStart,
  resetLearnerFsrsProgress
} from '../src/lib/server/db/fsrs-reset-fresh.js';
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
      .filter((name) => ![
        '0027_self_service_study_data_deletion.sql',
        '0028_self_service_study_data_writer_fence.sql'
      ].includes(name))
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

function seedStudyData(sqlite, userId, { scheduledEvents = 1 } = {}) {
  // The engine is tested against current-schema rows, including legacy records.
  // These deliberately constructed historical rows do not exercise writer
  // triggers, which are covered by their own runtime tests.
  sqlite.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TRIGGER IF EXISTS scheduled_review_events_active_guard;
    DROP TRIGGER IF EXISTS free_review_completion_receipts_active_guard;
    DROP TRIGGER IF EXISTS scheduled_review_events_monthly_bucket_insert;
    INSERT INTO learner_preferences (user_id, expanded_learning, scheduled_order)
    VALUES ('${userId}', 1, 'new_first');
    INSERT INTO learner_fsrs_profiles (
      user_id, scheduler_library_version, parameters_json
    ) VALUES ('${userId}', 'test', '[]');
    INSERT INTO learner_case_fsrs (
      user_id, case_id, due_at, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version
    ) VALUES ('${userId}', 'case-1', 10, 1, 1, 1, 1, 'test');
    INSERT INTO learner_case_encounters (user_id, case_id, free_times_studied)
    VALUES ('${userId}', 'case-1', 1);
    INSERT INTO learner_optimizer_evidence (
      event_id, user_id, case_id, completed_at, rating, generation,
      review_sequence_epoch, sequence_no
    ) VALUES ('optimizer-${userId}', '${userId}', 'case-1', 10, 'good', 1, 1, 1);
    INSERT INTO learner_aggregates (user_id, scheduled_completed, scheduled_good, free_completed)
    VALUES ('${userId}', 1, 1, 1);
    INSERT INTO learner_system_aggregates (user_id, system_id, scheduled_completed, scheduled_good)
    VALUES ('${userId}', 'system-1', 1, 1);
    INSERT INTO learner_system_monthly_buckets (
      user_id, system_id, month_start, scheduled_completed, scheduled_good,
      first_completed_at, last_completed_at
    ) VALUES ('${userId}', 'system-1', 0, 1, 1, 10, 10);
    INSERT INTO reviews (id, user_id, case_id, primary_concept_id, study_concept_id, case_title_snapshot)
    VALUES ('legacy-${userId}', '${userId}', 'case-1', 'topic-1', 'topic-1', 'Case 1');
    INSERT INTO review_questions (
      id, review_id, question_prompt_id, source_type, display_order, prompt_snapshot_md, answer_snapshot_md
    ) VALUES ('legacy-question-${userId}', 'legacy-${userId}', 'question-1', 'case', 0, 'Prompt', 'Answer');
    INSERT INTO review_assets (id, review_id, asset_id, display_order, storage_key_snapshot)
    VALUES ('legacy-asset-${userId}', 'legacy-${userId}', 'asset-1', 0, 'asset.png');
  `);
  insertActiveReview(sqlite, userId);
  for (let index = 0; index < scheduledEvents; index += 1) {
    sqlite.prepare(`
      INSERT INTO scheduled_review_events (
        id, user_id, case_id, case_title_snapshot, system_id, completed_at, rating,
        content_mode, generation, review_sequence_epoch, sequence_no,
        parameter_revision, scheduler_revision, scheduler_library_version,
        resulting_state_revision, next_due_at
      ) VALUES (?, ?, 'case-1', 'Case 1', 'system-1', 10, 'good', 'original', 1, 1, ?, 1, 1, 'test', 1, 10)
    `).run(`event-${userId}-${index}`, userId, index + 1);
  }
  sqlite.prepare(`
    INSERT INTO free_review_completion_receipts (
      id, user_id, case_id, completed_at, resulting_free_times_studied, expires_at
    ) VALUES (?, ?, 'case-1', 10, 1, 20)
  `).run(`free-${userId}`, userId);
  sqlite.exec('PRAGMA foreign_keys = ON;');
}

async function advanceToCompletion(db, userId, batchSize = 1) {
  let result;
  for (let index = 0; index < 100; index += 1) {
    result = await advanceStudyDataDeletion({ db, userId, batchSize });
    if (result.complete) return result;
  }
  throw new Error(`Study-data deletion did not complete; last phase=${result?.phase}`);
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

test('the database rejects every current study-state mutation for the fenced user while leaving another user writable', async () => {
  const { sqlite, db } = fixture();
  try {
    seedIdentities(sqlite);
    seedActiveReviewContent(sqlite);
    seedStudyData(sqlite, 'learner-1');
    seedStudyData(sqlite, 'admin-1');
    await beginStudyDataDeletion({ db, userId: 'learner-1' });

    const blockedUpdates = [
      ['active review', "UPDATE active_reviews SET revealed_at = 10 WHERE user_id = 'learner-1'"],
      ['free receipt', "UPDATE free_review_completion_receipts SET resulting_free_times_studied = 2 WHERE user_id = 'learner-1'"],
      ['scheduled event', "UPDATE scheduled_review_events SET completed_at = 11 WHERE user_id = 'learner-1'"],
      ['FSRS profile', "UPDATE learner_fsrs_profiles SET detailed_history_retention = '24m' WHERE user_id = 'learner-1'"],
      ['FSRS case state', "UPDATE learner_case_fsrs SET due_at = due_at + 1 WHERE user_id = 'learner-1'"],
      ['encounter', "UPDATE learner_case_encounters SET free_times_studied = free_times_studied + 1 WHERE user_id = 'learner-1'"],
      ['optimizer evidence', "UPDATE learner_optimizer_evidence SET rating = 'good' WHERE user_id = 'learner-1'"],
      ['learner aggregate', "UPDATE learner_aggregates SET free_completed = free_completed + 1 WHERE user_id = 'learner-1'"],
      ['system aggregate', "UPDATE learner_system_aggregates SET scheduled_good = scheduled_good + 1 WHERE user_id = 'learner-1'"],
      ['monthly bucket', "UPDATE learner_system_monthly_buckets SET scheduled_good = scheduled_good + 1 WHERE user_id = 'learner-1'"]
    ];
    for (const [label, statement] of blockedUpdates) {
      assert.throws(
        () => sqlite.exec(statement),
        /learner_study_data_deletion_in_progress/,
        `${label} must remain fenced`
      );
    }

    assert.throws(
      () => sqlite.exec(`
        INSERT INTO active_review_questions (
          id, active_review_id, question_prompt_id, source_type, display_order,
          prompt_snapshot_md, answer_snapshot_md
        ) VALUES ('blocked-question', 'active-learner-1', 'question-1', 'case', 1, 'Prompt', 'Answer')
      `),
      /learner_study_data_deletion_in_progress/,
      'active Review child creation must remain fenced'
    );

    sqlite.exec("UPDATE learner_aggregates SET free_completed = free_completed + 1 WHERE user_id = 'admin-1'");
    assert.equal(
      sqlite.prepare("SELECT free_completed FROM learner_aggregates WHERE user_id = 'admin-1'").get().free_completed,
      2
    );
  } finally {
    sqlite.close();
  }
});

test('Reset Progress and Fresh FSRS Start fail closed without partially mutating a fenced learner', async () => {
  const { sqlite, db } = fixture();
  try {
    seedIdentities(sqlite);
    seedActiveReviewContent(sqlite);
    seedStudyData(sqlite, 'learner-1');
    const beforeProfile = sqlite.prepare(
      "SELECT generation, review_sequence_epoch, parameter_revision FROM learner_fsrs_profiles WHERE user_id = 'learner-1'"
    ).get();
    await beginStudyDataDeletion({ db, userId: 'learner-1' });

    await assert.rejects(
      resetLearnerFsrsProgress({ db, userId: 'learner-1' }),
      /Study data deletion is in progress/
    );
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM active_reviews WHERE user_id = 'learner-1'").get().n, 1);
    assert.deepEqual(
      sqlite.prepare("SELECT generation, review_sequence_epoch, parameter_revision FROM learner_fsrs_profiles WHERE user_id = 'learner-1'").get(),
      beforeProfile
    );

    await assert.rejects(
      freshLearnerFsrsStart({ db, userId: 'learner-1' }),
      /Study data deletion is in progress/
    );
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM active_reviews WHERE user_id = 'learner-1'").get().n, 1);
    assert.deepEqual(
      sqlite.prepare("SELECT generation, review_sequence_epoch, parameter_revision FROM learner_fsrs_profiles WHERE user_id = 'learner-1'").get(),
      beforeProfile
    );
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

test('bounded backend cleanup removes every study-owned row while preserving identity, preferences, shared content, and another learner', async () => {
  const { sqlite, db } = fixture();
  try {
    seedIdentities(sqlite);
    seedActiveReviewContent(sqlite);
    seedStudyData(sqlite, 'learner-1', { scheduledEvents: 3 });
    seedStudyData(sqlite, 'admin-1');
    const beforePreference = sqlite.prepare("SELECT * FROM learner_preferences WHERE user_id = 'learner-1'").get();

    await beginStudyDataDeletion({ db, userId: 'learner-1' });
    const completed = await advanceToCompletion(db, 'learner-1', 1);
    assert.equal(completed.phase, 'complete');
    assert.equal(completed.complete, true);
    assert.equal(await isStudyDataDeletionActive(db, 'learner-1'), false);
    assert.equal((await getStudyDataDeletionStatus(db, 'learner-1')).completedAt != null, true);

    for (const descriptor of STUDY_DATA_DELETION_DESCRIPTORS) {
      const predicate = descriptor.predicate.replaceAll('?', "'learner-1'");
      assert.equal(Number(sqlite.prepare(`SELECT count(*) AS n FROM ${descriptor.table} WHERE ${predicate}`).get().n), 0, descriptor.phase);
    }
    assert.deepEqual(sqlite.prepare("SELECT * FROM learner_preferences WHERE user_id = 'learner-1'").get(), beforePreference);
    assert.equal(sqlite.prepare("SELECT role FROM user WHERE id = 'learner-1'").get().role, 'user');
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM cases WHERE id = 'case-1'").get().n, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM learner_fsrs_profiles WHERE user_id = 'admin-1'").get().n, 1);
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM reviews WHERE user_id = 'admin-1'").get().n, 1);
  } finally {
    sqlite.close();
  }
});

test('advance is retry-safe, bounded, and a complete marker rescans before releasing a recreated residual', async () => {
  const { sqlite, db } = fixture();
  try {
    seedIdentities(sqlite);
    seedActiveReviewContent(sqlite);
    seedStudyData(sqlite, 'learner-1', { scheduledEvents: STUDY_DATA_DELETION_BATCH_SIZE + 1 });
    await beginStudyDataDeletion({ db, userId: 'learner-1' });

    const first = await advanceStudyDataDeletion({ db, userId: 'learner-1' });
    assert.equal(first.phase, 'free_receipts');
    assert.equal(first.rowsDeleted, 1);
    let scheduled;
    do {
      scheduled = await advanceStudyDataDeletion({ db, userId: 'learner-1' });
    } while (scheduled.phase !== 'scheduled_events');
    const chunk = await advanceStudyDataDeletion({ db, userId: 'learner-1' });
    assert.equal(chunk.rowsDeleted, STUDY_DATA_DELETION_BATCH_SIZE);
    assert.equal(chunk.phase, 'scheduled_events');
    await advanceToCompletion(db, 'learner-1');

    sqlite.exec("INSERT INTO learner_aggregates (user_id) VALUES ('learner-1');");
    const repaired = await advanceStudyDataDeletion({ db, userId: 'learner-1' });
    assert.equal(repaired.phase, 'learner_aggregates');
    assert.equal(await isStudyDataDeletionActive(db, 'learner-1'), true);
    await advanceToCompletion(db, 'learner-1');
    assert.equal(Number(sqlite.prepare("SELECT count(*) AS n FROM learner_aggregates WHERE user_id = 'learner-1'").get().n), 0);
  } finally {
    sqlite.close();
  }
});

test('permanent learner deletion supersedes self-wipe, reuses its fence, and clears legacy Review rows', async () => {
  const { sqlite, db } = fixture();
  try {
    seedIdentities(sqlite);
    seedActiveReviewContent(sqlite);
    seedStudyData(sqlite, 'learner-1');

    await beginStudyDataDeletion({ db, userId: 'learner-1' });
    await beginLearnerAccountDeletion({ db, userId: 'learner-1' });

    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS n FROM learner_account_deletions WHERE user_id = 'learner-1'").get().n,
      1
    );
    assert.equal(marker(sqlite, 'learner-1').phase, 'active_reviews');
    await assert.rejects(
      beginStudyDataDeletion({ db, userId: 'learner-1' }),
      (cause) => cause?.code === 'account-deletion-in-progress'
    );
    await assert.rejects(
      advanceStudyDataDeletion({ db, userId: 'learner-1' }),
      (cause) => cause?.code === 'account-deletion-in-progress'
    );

    let progress;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      progress = await advanceLearnerAccountDeletion({ db, userId: 'learner-1', batchSize: 1 });
      if (progress.readyForIdentityDelete) break;
    }
    assert.equal(progress.readyForIdentityDelete, true);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM reviews WHERE user_id = 'learner-1'").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM review_questions").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM review_assets").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM learner_fsrs_profiles WHERE user_id = 'learner-1'").get().n, 0);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM user WHERE id = 'learner-1'").get().n, 1);
  } finally {
    sqlite.close();
  }
});

test('self-wipe completion is reactivated and absorbed when permanent account deletion begins', async () => {
  const { sqlite, db } = fixture();
  try {
    seedIdentities(sqlite);
    await beginStudyDataDeletion({ db, userId: 'learner-1' });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await advanceStudyDataDeletion({ db, userId: 'learner-1', batchSize: 1 });
      if (result.complete) break;
    }
    assert.equal(marker(sqlite, 'learner-1').phase, 'complete');

    await beginLearnerAccountDeletion({ db, userId: 'learner-1' });
    assert.equal(marker(sqlite, 'learner-1').phase, 'active_reviews');
    assert.equal(
      sqlite.prepare("SELECT banned FROM user WHERE id = 'learner-1'").get().banned,
      1
    );
    await assert.rejects(
      beginStudyDataDeletion({ db, userId: 'learner-1' }),
      (cause) => cause?.code === 'account-deletion-in-progress'
    );
  } finally {
    sqlite.close();
  }
});

test('Tranche 4 exposes only self-scoped learner deletion with typed confirmation and resumable blocked-study UX', () => {
  const chooserServer = readFileSync(new URL('../src/routes/study/+page.server.js', import.meta.url), 'utf8');
  const chooser = readFileSync(new URL('../src/routes/study/+page.svelte', import.meta.url), 'utf8');
  const review = readFileSync(new URL('../src/routes/study/[reviewId]/+page.server.js', import.meta.url), 'utf8');
  const open = readFileSync(new URL('../src/routes/study/api/open/+server.js', import.meta.url), 'utf8');
  const complete = readFileSync(new URL('../src/routes/study/api/complete/[reviewId]/+server.js', import.meta.url), 'utf8');
  const media = readFileSync(new URL('../src/routes/study/media/[reviewId]/[assetId]/+server.js', import.meta.url), 'utf8');

  assert.match(chooserServer, /deleteStudyData:/);
  assert.match(chooserServer, /continueStudyDataDeletion:/);
  assert.match(chooserServer, /DELETE MY STUDY DATA/);
  assert.match(chooserServer, /MAX_DELETION_STEPS_PER_REQUEST = 4/);
  assert.match(chooserServer, /user\.id/);
  assert.doesNotMatch(chooserServer, /formData\.get\(['"]userId['"]\)/);
  assert.match(chooserServer, /studyDataDeleted: true/);
  assert.match(chooserServer, /deletionInProgress: true/);

  assert.match(chooser, /Delete all my study data/);
  assert.match(chooser, /name="confirmation"/);
  assert.match(chooser, /DELETE MY STUDY DATA/);
  assert.match(chooser, /Continue deletion/);
  assert.match(chooser, /Study is temporarily blocked/);
  assert.match(chooser, /!data\.studyDataDeletion\?\.inProgress/);

  for (const source of [review, open, complete, media]) {
    assert.match(source, /isStudyDataDeletionActive/);
    assert.match(source, /Study data deletion is in progress/);
  }
});
