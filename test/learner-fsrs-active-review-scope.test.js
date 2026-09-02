import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const foundationSql = readFileSync(
  new URL('../drizzle/0019_learner_fsrs_foundation.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');
const activeSql = readFileSync(
  new URL('../drizzle/0020_learner_fsrs_active_reviews.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE user (id text PRIMARY KEY NOT NULL);
    CREATE TABLE concepts (id text PRIMARY KEY NOT NULL, parent_id text, kind text NOT NULL, is_active integer NOT NULL DEFAULT 1);
    CREATE TABLE cases (id text PRIMARY KEY NOT NULL, preview_session_id text, is_active integer NOT NULL DEFAULT 1);
    CREATE TABLE case_concepts (case_id text NOT NULL, concept_id text NOT NULL, role text NOT NULL);
    CREATE TABLE tags (id text PRIMARY KEY NOT NULL, is_active integer NOT NULL DEFAULT 1);
    CREATE TABLE case_tags (case_id text NOT NULL, tag_id text NOT NULL);
    CREATE TABLE system_tags (system_concept_id text NOT NULL, tag_id text NOT NULL);
    CREATE TABLE assets (id text PRIMARY KEY NOT NULL);
  `);
  db.exec(foundationSql);
  db.exec(activeSql);
  return db;
}

function insertFreeReview(db, scopeJson) {
  db.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, run_id,
      scope_fingerprint, scope_json, case_title_snapshot, snapshot_version
    ) VALUES ('active', 'learner', 'case', 'system-a', 'free', 'original',
      'run', 'scope', ?, 'Cross-system Tag Case', 1)
  `).run(scopeJson);
}

test('active Review scope guard preserves Part B curated Tag routing across primary-Topic Systems', () => {
  const db = database();
  try {
    db.exec(`
      INSERT INTO user (id) VALUES ('learner');
      INSERT INTO concepts (id, parent_id, kind, is_active) VALUES
        ('system-a', NULL, 'system', 1),
        ('system-b', NULL, 'system', 1),
        ('topic-b', 'system-b', 'topic', 1);
      INSERT INTO cases (id, preview_session_id, is_active) VALUES ('case', NULL, 1);
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case', 'topic-b', 'primary');
      INSERT INTO tags (id, is_active) VALUES ('tag-a', 1);
      INSERT INTO case_tags (case_id, tag_id) VALUES ('case', 'tag-a');
      INSERT INTO system_tags (system_concept_id, tag_id) VALUES ('system-a', 'tag-a');
    `);

    assert.doesNotThrow(() => insertFreeReview(
      db,
      JSON.stringify({ systemId: 'system-a', routes: [{ routeType: 'tag', routeId: 'tag-a' }] })
    ));
    db.exec("DELETE FROM active_reviews WHERE id = 'active'");

    assert.throws(
      () => insertFreeReview(
        db,
        JSON.stringify({ systemId: 'system-a', routes: [{ routeType: 'topic', routeId: 'topic-b' }] })
      ),
      /active_review_ineligible_scope/i,
      'the same Case must not become a Topic-route member of the unrelated System'
    );
  } finally {
    db.close();
  }
});