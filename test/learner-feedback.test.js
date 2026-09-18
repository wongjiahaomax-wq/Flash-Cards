// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  bulkDeleteFeedback,
  createLearnerFeedback,
  dismissFeedback,
  listFeedbackQueue,
  reopenFeedback,
  resolveFeedback
} from '../src/lib/server/db/learner-feedback.ts';
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

  async first() {
    return this.client.database.prepare(this.sql).get(...this.params) ?? null;
  }

  async all() {
    return { results: this.client.database.prepare(this.sql).all(...this.params) };
  }

  async run() {
    const result = this.client.database.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }, results: [] };
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
        results.push({ success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }, results: [] });
      }
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

const LEARNER_ID = 'feedback-learner';
const OTHER_LEARNER_ID = 'feedback-other';
const ADMIN_ID = 'feedback-admin';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  const userInsert = sqlite.prepare('INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt", "role", "banned") VALUES (?, ?, ?, 1, 1, 1, ?, 0)');
  userInsert.run(LEARNER_ID, 'Feedback Learner', 'learner@example.test', 'user');
  userInsert.run(OTHER_LEARNER_ID, 'Other Learner', 'other@example.test', 'user');
  userInsert.run(ADMIN_ID, 'Feedback Admin', 'admin@example.test', 'admin');
  sqlite.prepare('INSERT INTO cases (id, title, is_active) VALUES (?, ?, 1)').run('case-a', 'Original Case A');
  sqlite.prepare('INSERT INTO cases (id, title, is_active) VALUES (?, ?, 1)').run('case-b', 'Case B');
  sqlite.prepare('INSERT INTO concepts (id, name, slug, kind, is_active) VALUES (?, ?, ?, ?, 1)').run('system-a', 'System A', 'system-a', 'system');
  sqlite.prepare('INSERT INTO concepts (id, name, slug, kind, is_active) VALUES (?, ?, ?, ?, 1)').run('system-b', 'System B', 'system-b', 'system');
  sqlite.prepare('INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES (?, ?, ?, ?, ?, 1)').run('topic-a', 'Topic A', 'topic-a', 'topic', 'system-a');
  sqlite.prepare('INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES (?, ?, ?, ?, ?, 1)').run('topic-b', 'Topic B', 'topic-b', 'topic', 'system-b');
  sqlite.prepare('INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, ?, ?)').run('case-a', 'topic-a', 'primary');
  sqlite.prepare('INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, ?, ?)').run('case-b', 'topic-b', 'primary');
  const reviewInsert = sqlite.prepare(
    'INSERT INTO active_reviews (id, user_id, case_id, system_id, study_mode, content_mode, run_id, scope_fingerprint, scope_json, case_title_snapshot, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  reviewInsert.run('review-a', LEARNER_ID, 'case-a', 'system-a', 'free', 'original', 'run-a', 'scope-a', '{"version":2,"systemId":"system-a","runScope":{"systems":[{"systemId":"system-a","mode":"all"}]}}', 'Original Case A', 9999999999999);
  reviewInsert.run('review-b', OTHER_LEARNER_ID, 'case-b', 'system-b', 'free', 'original', 'run-b', 'scope-b', '{"version":2,"systemId":"system-b","runScope":{"systems":[{"systemId":"system-b","mode":"all"}]}}', 'Case B', 9999999999999);
  return { sqlite, d1: new SqliteD1Client(sqlite), db: null };
}

function insertReport(value, { id, caseId = 'case-a', userId = LEARNER_ID, title = 'Original Case A', body, status = 'open', reportedAt = 1000 }) {
  const reviewedAt = status === 'open' ? null : 2000;
  const reviewedBy = status === 'open' ? null : ADMIN_ID;
  value.sqlite.prepare(
    'INSERT INTO learner_feedback (id, case_id, user_id, reporter_label_snapshot, case_title_snapshot, body, status, reported_at, reviewed_at, reviewed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, caseId, userId, 'Feedback Learner · learner@example.test', title, body, status, reportedAt, reviewedAt, reviewedBy);
}

test('learner feedback derives the active Review owner and Case atomically', async () => {
  const value = fixture();
  value.db = { $client: value.d1 };
  try {
    const created = await createLearnerFeedback({ db: value.db, userId: LEARNER_ID, reviewId: 'review-a', body: '  This answer is unclear.  ' });
    assert.equal(created.caseId, 'case-a');
    assert.equal(created.userId, LEARNER_ID);
    assert.equal(created.body, 'This answer is unclear.');
    assert.equal(created.status, 'open');
    assert.equal(value.sqlite.prepare('SELECT COUNT(*) AS n FROM learner_feedback').get().n, 1);

    const second = await createLearnerFeedback({ db: value.db, userId: LEARNER_ID, reviewId: 'review-a', body: 'A second intentional report.' });
    assert.ok(second);
    assert.equal(value.sqlite.prepare('SELECT COUNT(*) AS n FROM learner_feedback').get().n, 2);

    assert.equal(await createLearnerFeedback({ db: value.db, userId: OTHER_LEARNER_ID, reviewId: 'review-a', body: 'Wrong owner.' }), null);
    assert.equal(await createLearnerFeedback({ db: value.db, userId: LEARNER_ID, reviewId: 'review-b', body: 'Wrong Review.' }), null);
    await assert.rejects(() => createLearnerFeedback({ db: value.db, userId: LEARNER_ID, reviewId: 'review-a', body: '   ' }), /incorrect or unclear/);

    value.sqlite.prepare('UPDATE active_reviews SET started_at = ?, expires_at = ? WHERE id = ?').run(0, 1, 'review-a');
    assert.equal(await createLearnerFeedback({ db: value.db, userId: LEARNER_ID, reviewId: 'review-a', body: 'Expired.' }), null);
  } finally {
    value.sqlite.close();
  }
});

test('queue groups by Case, searches current titles/body, and sorts visible reports deterministically', async () => {
  const value = fixture();
  value.db = { $client: value.d1 };
  try {
    insertReport(value, { id: 'a-old', body: 'Old report', reportedAt: 1000 });
    insertReport(value, { id: 'a-new', body: 'New report', reportedAt: 3000 });
    insertReport(value, { id: 'b-mid', caseId: 'case-b', userId: OTHER_LEARNER_ID, title: 'Case B', body: 'Image is blurry', reportedAt: 2000 });
    insertReport(value, { id: 'a-resolved', body: 'Already fixed', status: 'resolved', reportedAt: 4000 });

    value.sqlite.prepare('UPDATE cases SET title = ? WHERE id = ?').run('Renamed Case A', 'case-a');
    const openNewest = await listFeedbackQueue(value.db, { status: 'open', sort: 'newest' });
    assert.deepEqual(openNewest.groups.map((group) => group.caseId), ['case-a', 'case-b']);
    assert.equal(openNewest.groups[0].caseTitle, 'Renamed Case A');
    assert.deepEqual(openNewest.groups[0].reports.map((report) => report.id), ['a-new', 'a-old']);
    assert.equal((await listFeedbackQueue(value.db, { status: 'open', search: 'blurry', sort: 'newest' })).groups[0].caseId, 'case-b');
    assert.equal((await listFeedbackQueue(value.db, { status: 'open', search: 'Renamed', sort: 'newest' })).groups[0].caseId, 'case-a');
    assert.equal((await listFeedbackQueue(value.db, { status: 'resolved', sort: 'oldest' })).groups[0].reports[0].id, 'a-resolved');
  } finally {
    value.sqlite.close();
  }
});

test('Admin status actions set metadata, reopen clears it, and bulk delete uses explicit ids', async () => {
  const value = fixture();
  value.db = { $client: value.d1 };
  try {
    insertReport(value, { id: 'status-report', body: 'Status me.' });
    const resolved = await resolveFeedback(value.db, { id: 'status-report', adminId: ADMIN_ID });
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.reviewedBy, ADMIN_ID);
    assert.ok(resolved.reviewedAt);
    const reopened = await reopenFeedback(value.db, { id: 'status-report', adminId: ADMIN_ID });
    assert.equal(reopened.status, 'open');
    assert.equal(reopened.reviewedAt, null);
    assert.equal(reopened.reviewedBy, null);
    const dismissed = await dismissFeedback(value.db, { id: 'status-report', adminId: ADMIN_ID });
    assert.equal(dismissed.status, 'dismissed');

    insertReport(value, { id: 'keep', body: 'Keep.' });
    insertReport(value, { id: 'delete-me', body: 'Delete.' });
    assert.equal(await bulkDeleteFeedback(value.db, ['delete-me', 'delete-me']), 1);
    assert.equal(value.sqlite.prepare('SELECT COUNT(*) AS n FROM learner_feedback WHERE id = ?').get('keep').n, 1);
    assert.equal(value.sqlite.prepare('SELECT COUNT(*) AS n FROM learner_feedback WHERE id = ?').get('delete-me').n, 0);
  } finally {
    value.sqlite.close();
  }
});

test('permanent learner deletion drains feedback in the existing profile sweep and blocks direct user deletion', async () => {
  const value = fixture();
  value.db = { $client: value.d1 };
  try {
    insertReport(value, { id: 'delete-feedback', body: 'Remove with account.' });
    value.sqlite.prepare('INSERT INTO learner_fsrs_profiles (user_id, scheduler_library_version, parameters_json) VALUES (?, ?, ?)').run(LEARNER_ID, '5.4.2', '{}');
    await beginLearnerAccountDeletion({ db: value.db, userId: LEARNER_ID });
    assert.throws(
      () => value.sqlite.prepare('INSERT INTO learner_feedback (id, case_id, user_id, reporter_label_snapshot, case_title_snapshot, body) VALUES (?, ?, ?, ?, ?, ?)').run('blocked', 'case-a', LEARNER_ID, 'Feedback Learner', 'Original Case A', 'After deletion began.'),
      /LEARNER_FEEDBACK_ACCOUNT_DELETION_IN_PROGRESS/
    );
    value.sqlite.prepare('DELETE FROM active_reviews WHERE user_id = ?').run(LEARNER_ID);
    assert.throws(
      () => value.sqlite.prepare('DELETE FROM "user" WHERE id = ?').run(LEARNER_ID),
      /LEARNER_FEEDBACK_REQUIRES_STAGED_DELETION/
    );

    value.sqlite.prepare('UPDATE learner_account_deletions SET phase = ? WHERE user_id = ?').run('profile', LEARNER_ID);
    const first = await advanceLearnerAccountDeletion({ db: value.db, userId: LEARNER_ID, batchSize: 1 });
    assert.equal(first.phase, 'profile');
    assert.equal(value.sqlite.prepare('SELECT COUNT(*) AS n FROM learner_feedback WHERE user_id = ?').get(LEARNER_ID).n, 0);

    const second = await advanceLearnerAccountDeletion({ db: value.db, userId: LEARNER_ID, batchSize: 1 });
    assert.equal(second.readyForIdentityDelete, false);
    const third = await advanceLearnerAccountDeletion({ db: value.db, userId: LEARNER_ID, batchSize: 1 });
    assert.equal(third.readyForIdentityDelete, true);
  } finally {
    value.sqlite.close();
  }
});
