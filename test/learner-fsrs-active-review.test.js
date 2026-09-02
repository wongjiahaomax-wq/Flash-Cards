import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  ActiveReviewContentError,
  MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES,
  activeReviewSnapshotBytes,
  assertActiveReviewSnapshotSupported
} from '../src/lib/server/db/active-review-content.js';
import { runActiveReviewBenchmark } from '../scripts/learner-fsrs-active-review-benchmark.mjs';

const foundationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const activeSql = readFileSync(
  new URL('../drizzle/0020_learner_fsrs_active_reviews.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

function activeReviewDb() {
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

function freeReviewInsert(id = 'active-1', overrides = {}) {
  return {
    id,
    userId: 'learner',
    caseId: 'case-1',
    systemId: 'system',
    studyMode: 'free',
    contentMode: 'original',
    queueClass: null,
    runId: 'run-free',
    scopeFingerprint: 'scope',
    scopeJson: JSON.stringify({ systemId: 'system', routes: [{ routeType: 'topic', routeId: 'topic' }] }),
    generation: null,
    reviewSequenceEpoch: null,
    parameterRevision: null,
    schedulerRevision: null,
    schedulerLibraryVersion: null,
    expectedStateRevision: null,
    expectedDueAt: null,
    runStartedAt: null,
    caseTitleSnapshot: 'Case 1',
    vignetteSnapshotMd: 'Frozen vignette',
    snapshotVersion: 1,
    ...overrides
  };
}

function insertReview(db, row) {
  db.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      expected_state_revision, expected_due_at, run_started_at,
      case_title_snapshot, vignette_snapshot_md, snapshot_version
    ) VALUES (
      @id, @userId, @caseId, @systemId, @studyMode, @contentMode, @queueClass,
      @runId, @scopeFingerprint, @scopeJson, @generation, @reviewSequenceEpoch,
      @parameterRevision, @schedulerRevision, @schedulerLibraryVersion,
      @expectedStateRevision, @expectedDueAt, @runStartedAt,
      @caseTitleSnapshot, @vignetteSnapshotMd, @snapshotVersion
    )
  `).run(row);
}

function dbNow(db) {
  return Number(db.prepare("SELECT cast((julianday('now') - 2440587.5) * 86400000 as integer) AS now_ms").get().now_ms);
}

test('Part C migration creates normalized temporary snapshot tables with one-active ownership', () => {
  const db = activeReviewDb();
  try {
    const tables = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
    );
    for (const name of ['active_reviews', 'active_review_questions', 'active_review_assets']) {
      assert.equal(tables.has(name), true, `${name} should exist`);
    }
    insertReview(db, freeReviewInsert());
    assert.throws(() => insertReview(db, freeReviewInsert('active-2')), /UNIQUE constraint/i);
  } finally {
    db.close();
  }
});

test('active snapshot children cascade while live Asset references block permanent Asset deletion', () => {
  const db = activeReviewDb();
  try {
    db.exec("INSERT INTO assets (id) VALUES ('asset-1')");
    insertReview(db, freeReviewInsert());
    db.exec(`
      INSERT INTO active_review_questions (
        id, active_review_id, question_prompt_id, source_type, display_order,
        prompt_snapshot_md, answer_snapshot_md
      ) VALUES ('question-1', 'active-1', 'prompt-1', 'case', 0, 'Prompt', 'Answer');
      INSERT INTO active_review_assets (
        id, active_review_id, asset_id, display_order, storage_key_snapshot
      ) VALUES ('active-asset-1', 'active-1', 'asset-1', 0, 'teaching/asset-1.png');
    `);
    assert.throws(() => db.exec("DELETE FROM assets WHERE id = 'asset-1'"), /FOREIGN KEY constraint/i);
    db.exec("DELETE FROM active_reviews WHERE id = 'active-1'");
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM active_review_questions').get().n), 0);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM active_review_assets').get().n), 0);
    db.exec("DELETE FROM assets WHERE id = 'asset-1'");
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM assets').get().n), 0);
  } finally {
    db.close();
  }
});

test('ordinary Admin Case deactivation does not cancel an already-frozen active Review', () => {
  const db = activeReviewDb();
  try {
    insertReview(db, freeReviewInsert());
    db.exec("UPDATE cases SET is_active = 0 WHERE id = 'case-1'");
    const frozen = db.prepare("SELECT id, vignette_snapshot_md FROM active_reviews WHERE user_id = 'learner'").get();
    assert.equal(frozen.id, 'active-1');
    assert.equal(frozen.vignette_snapshot_md, 'Frozen vignette');
    assert.throws(() => insertReview(db, freeReviewInsert('active-2')), /active_review_ineligible_scope|UNIQUE constraint/i);
  } finally {
    db.close();
  }
});

test('expired replacement consumes only a row expired at database write time and preserves one winner', () => {
  const db = activeReviewDb();
  try {
    const now = dbNow(db);
    insertReview(db, freeReviewInsert('expired', { runId: 'old-run' }));
    db.prepare("UPDATE active_reviews SET started_at = ?, expires_at = ? WHERE id = 'expired'").run(now - 10_000, now - 1);

    db.exec('BEGIN');
    try {
      db.prepare(`
        DELETE FROM active_reviews
        WHERE user_id = 'learner'
          AND expires_at <= cast((julianday('now') - 2440587.5) * 86400000 as integer)
      `).run();
      insertReview(db, freeReviewInsert('winner', { runId: 'winner-run' }));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    db.exec('BEGIN');
    try {
      const secondDelete = db.prepare(`
        DELETE FROM active_reviews
        WHERE user_id = 'learner'
          AND expires_at <= cast((julianday('now') - 2440587.5) * 86400000 as integer)
      `).run();
      assert.equal(Number(secondDelete.changes), 0, 'the replacement must not consume the new unexpired winner');
      assert.throws(
        () => insertReview(db, freeReviewInsert('loser', { runId: 'loser-run' })),
        /UNIQUE constraint/i
      );
      db.exec('ROLLBACK');
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    }
    const winner = db.prepare("SELECT id, run_id FROM active_reviews WHERE user_id = 'learner'").get();
    assert.equal(winner.id, 'winner');
    assert.equal(winner.run_id, 'winner-run');
  } finally {
    db.close();
  }
});

test('scheduled active Review insert fails closed on stale profile or Case state at write time', () => {
  const db = activeReviewDb();
  try {
    const now = dbNow(db);
    db.exec(`
      INSERT INTO learner_fsrs_profiles (
        user_id, generation, review_sequence_epoch, parameter_revision,
        scheduler_revision, scheduler_library_version, parameters_json
      ) VALUES ('learner', 1, 1, 1, 1, '5.4.2', '{}');
      INSERT INTO learner_case_fsrs (
        user_id, case_id, due_at, generation, review_sequence_epoch,
        parameter_revision, scheduler_revision, scheduler_library_version, state_revision
      ) VALUES ('learner', 'case-1', ${now - 1000}, 1, 1, 1, 1, '5.4.2', 3);
    `);
    const due = freeReviewInsert('scheduled', {
      studyMode: 'scheduled',
      queueClass: 'due',
      generation: 1,
      reviewSequenceEpoch: 1,
      parameterRevision: 1,
      schedulerRevision: 1,
      schedulerLibraryVersion: '5.4.2',
      expectedStateRevision: 3,
      expectedDueAt: now - 1000,
      runStartedAt: now,
      runId: 'scheduled-run'
    });
    insertReview(db, due);
    db.exec("DELETE FROM active_reviews WHERE id = 'scheduled'");

    db.exec("UPDATE learner_fsrs_profiles SET generation = 2 WHERE user_id = 'learner'");
    assert.throws(() => insertReview(db, due), /active_review_stale_boundary/i);
    db.exec("UPDATE learner_fsrs_profiles SET generation = 1 WHERE user_id = 'learner'");
    db.exec("UPDATE learner_case_fsrs SET state_revision = 4 WHERE user_id = 'learner' AND case_id = 'case-1'");
    assert.throws(() => insertReview(db, due), /active_review_stale_case_state/i);
  } finally {
    db.close();
  }
});

test('New active Review cannot be created after another device introduced FSRS state', () => {
  const db = activeReviewDb();
  try {
    const now = dbNow(db);
    db.exec(`
      INSERT INTO learner_fsrs_profiles (
        user_id, generation, review_sequence_epoch, parameter_revision,
        scheduler_revision, scheduler_library_version, parameters_json
      ) VALUES ('learner', 1, 1, 1, 1, '5.4.2', '{}');
      INSERT INTO learner_case_fsrs (
        user_id, case_id, due_at, generation, review_sequence_epoch,
        parameter_revision, scheduler_revision, scheduler_library_version, state_revision
      ) VALUES ('learner', 'case-1', ${now + 86400000}, 1, 1, 1, 1, '5.4.2', 1);
    `);
    assert.throws(
      () => insertReview(db, freeReviewInsert('scheduled-new', {
        studyMode: 'scheduled',
        queueClass: 'new',
        generation: 1,
        reviewSequenceEpoch: 1,
        parameterRevision: 1,
        schedulerRevision: 1,
        schedulerLibraryVersion: '5.4.2',
        runStartedAt: now,
        runId: 'scheduled-run'
      })),
      /active_review_stale_case_state/i
    );
  } finally {
    db.close();
  }
});

test('write-boundary content/scope trigger rejects deactivated or no-longer-selected content', () => {
  const db = activeReviewDb();
  try {
    db.exec("UPDATE cases SET is_active = 0 WHERE id = 'case-1'");
    assert.throws(() => insertReview(db, freeReviewInsert()), /active_review_ineligible_scope/i);
    db.exec("UPDATE cases SET is_active = 1 WHERE id = 'case-1'");
    assert.throws(
      () => insertReview(db, freeReviewInsert('wrong-topic', {
        scopeJson: JSON.stringify({ systemId: 'system', routes: [{ routeType: 'topic', routeId: 'another-topic' }] })
      })),
      /active_review_ineligible_scope/i
    );
  } finally {
    db.close();
  }
});

test('snapshot envelope rejects oversized exact content instead of truncating it', () => {
  const text = 'x'.repeat(MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES);
  const oversized = {
    version: 1,
    case: { id: 'case', title: 'Case', vignetteMd: text },
    questions: [{
      questionPromptId: 'prompt',
      sourceType: 'case',
      sourceConceptId: null,
      sourceStimulusGroupId: null,
      sourceStimulusOptionId: null,
      sourceAssetQuestionId: null,
      sourceSharedQuestionId: null,
      displayOrder: 0,
      promptSnapshotMd: 'Prompt',
      answerSnapshotMd: 'Answer'
    }],
    assets: []
  };
  assert.ok(activeReviewSnapshotBytes(oversized) > MAX_ACTIVE_REVIEW_SNAPSHOT_BYTES);
  assert.throws(
    () => assertActiveReviewSnapshotSupported(oversized),
    (error) => error instanceof ActiveReviewContentError && error.code === 'snapshot-too-large'
  );
  assert.equal(oversized.case.vignetteMd.length, text.length, 'source content must remain untruncated');
});

test('Part C benchmark exercises supported normalized snapshot persistence and oversized rejection', () => {
  const result = runActiveReviewBenchmark({ questionCount: 64, assetCount: 8, targetBytes: 128 * 1024 });
  assert.equal(result.representation, 'normalized-active-snapshot');
  assert.equal(result.foreignKeyViolations.length, 0);
  assert.equal(result.fixtures.oversizedRejected, true);
  assert.equal(result.persistence.questionRows, 64);
  assert.equal(result.persistence.assetRows, 8);
  assert.ok(result.persistence.databaseBytesDelta > 0);
  assert.ok(result.persistence.createMs >= 0);
  assert.ok(result.persistence.resumeReadMs >= 0);
});
