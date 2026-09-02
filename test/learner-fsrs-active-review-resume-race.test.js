import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  discardActiveReview,
  getActiveReview,
  getActiveReviewById
} from '../src/lib/server/db/active-reviews.js';

const foundationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const activeSql = readFileSync(
  new URL('../drizzle/0020_learner_fsrs_active_reviews.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

function configureConnection(db) {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
}

function initializeDatabase(db) {
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
    INSERT INTO assets (id) VALUES ('asset-1');
  `);
}

function seedFrozenReview(db) {
  db.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
      parameter_revision, scheduler_revision, scheduler_library_version,
      expected_state_revision, expected_due_at, run_started_at,
      case_title_snapshot, vignette_snapshot_md, snapshot_version
    ) VALUES (
      'active-1', 'learner', 'case-1', 'system', 'free', 'original', NULL,
      'run-free', 'scope', ?, NULL, NULL,
      NULL, NULL, NULL,
      NULL, NULL, NULL,
      'Case 1', 'Frozen vignette', 1
    )
  `).run(JSON.stringify({
    systemId: 'system',
    routes: [{ routeType: 'topic', routeId: 'topic' }]
  }));
  db.exec(`
    INSERT INTO active_review_questions (
      id, active_review_id, question_prompt_id, source_type, display_order,
      prompt_snapshot_md, answer_snapshot_md
    ) VALUES ('question-1', 'active-1', 'prompt-1', 'case', 0, 'Frozen prompt', 'Frozen answer');
    INSERT INTO active_review_assets (
      id, active_review_id, asset_id, display_order, storage_key_snapshot,
      caption_snapshot_md, alt_text_snapshot
    ) VALUES (
      'active-asset-1', 'active-1', 'asset-1', 0, 'teaching/asset-1.png',
      'Frozen caption', 'Frozen alt text'
    );
  `);
}

function isVisibleParentSelect(sql) {
  return /\bfrom\s+"active_reviews"/i.test(sql)
    && !/\bfrom\s+"active_review_questions"/i.test(sql)
    && !/\bfrom\s+"active_review_assets"/i.test(sql);
}

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

  async raw() {
    const rows = this.rows();
    await this.client.afterStatement(this.sql);
    return rows.map((row) => Object.values(row));
  }

  async all() {
    const rows = this.rows();
    await this.client.afterStatement(this.sql);
    return { success: true, meta: {}, results: rows };
  }

  async first(columnName) {
    const rows = this.rows();
    await this.client.afterStatement(this.sql);
    const row = rows[0] ?? null;
    if (row == null || columnName == null) return row;
    return row[columnName] ?? null;
  }

  async run() {
    const result = this.client.database.prepare(this.sql).run(...this.params);
    await this.client.afterStatement(this.sql);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
}

class SqliteD1Client {
  constructor(database, afterParent = null) {
    this.database = database;
    this.afterParent = afterParent;
    this.parentHookFired = false;
  }

  prepare(sql) {
    return new SqliteD1Statement(this, sql);
  }

  async afterStatement(sql) {
    if (this.parentHookFired || !this.afterParent || !isVisibleParentSelect(sql)) return;
    this.parentHookFired = true;
    await this.afterParent();
  }

  async batch(statements) {
    this.database.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) {
        const rows = statement.rows();
        results.push({ success: true, meta: {}, results: rows });
        await this.afterStatement(statement.sql);
      }
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

async function assertResumeDeletionRace(getter) {
  const directory = mkdtempSync(join(tmpdir(), 'flash-cards-active-review-resume-race-'));
  const databasePath = join(directory, 'race.sqlite');
  const writer = new DatabaseSync(databasePath);
  let reader = null;
  try {
    configureConnection(writer);
    initializeDatabase(writer);
    seedFrozenReview(writer);

    reader = new DatabaseSync(databasePath);
    configureConnection(reader);
    const writerDb = createDb(new SqliteD1Client(writer));
    let discardCount = 0;
    const readerDb = createDb(new SqliteD1Client(reader, async () => {
      discardCount += 1;
      const discarded = await discardActiveReview({
        db: writerDb,
        userId: 'learner',
        reviewId: 'active-1'
      });
      assert.equal(discarded, true, 'the concurrent Discard should delete the persisted owner');
      assert.equal(
        Number(writer.prepare("SELECT COUNT(*) AS n FROM active_reviews WHERE id = 'active-1'").get()?.n ?? 0),
        0,
        'the writer should observe the Review as deleted while Resume is still hydrating'
      );
    }));

    const review = await getter(readerDb);
    assert.ok(review, 'Resume may return the snapshot that won the transactional read boundary');
    assert.equal(review.id, 'active-1');
    assert.equal(review.questions.length, 1, 'Resume must never return a stale parent with missing questions');
    assert.equal(review.questions[0].promptSnapshotMd, 'Frozen prompt');
    assert.equal(review.assets.length, 1, 'Resume must never return a stale parent with missing assets');
    assert.equal(review.assets[0].storageKeySnapshot, 'teaching/asset-1.png');
    assert.equal(discardCount, 1, 'the parent-discovery race should be injected exactly once');

    assert.equal(
      Number(writer.prepare('SELECT COUNT(*) AS n FROM active_review_questions').get()?.n ?? 0),
      0,
      'the committed Discard should still cascade normalized questions after Resume finishes'
    );
    assert.equal(
      Number(writer.prepare('SELECT COUNT(*) AS n FROM active_review_assets').get()?.n ?? 0),
      0,
      'the committed Discard should still cascade normalized assets after Resume finishes'
    );
  } finally {
    reader?.close();
    writer.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

test('getActiveReview returns a coherent snapshot when Discard commits after parent discovery', async () => {
  await assertResumeDeletionRace((db) => getActiveReview(db, 'learner'));
});

test('getActiveReviewById returns a coherent snapshot when Discard commits after parent discovery', async () => {
  await assertResumeDeletionRace((db) => getActiveReviewById(db, 'learner', 'active-1'));
});
