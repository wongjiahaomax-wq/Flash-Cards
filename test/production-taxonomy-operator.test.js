import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  assertPostconditions,
  assertPreconditions,
  cardiologyId,
  hypercalcemiaCaseId,
  hypocalcemiaCaseId,
  mutationSql,
  postconditionSql,
  preconditionSql,
  topicIds
} from '../scripts/apply-agreed-taxonomy.mjs';

function createFixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE concepts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      parent_id TEXT REFERENCES concepts(id) ON DELETE RESTRICT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE cases (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE case_concepts (
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
      concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE RESTRICT,
      role TEXT NOT NULL CHECK(role IN ('primary', 'secondary')),
      PRIMARY KEY (case_id, concept_id)
    );
  `);
  db.prepare('INSERT INTO concepts (id, name, slug, parent_id, is_active) VALUES (?, ?, ?, NULL, 1)')
    .run(cardiologyId, 'Cardiology', 'cardiology');
  db.prepare('INSERT INTO cases (id, title, is_active) VALUES (?, ?, 1)').run(hypercalcemiaCaseId, 'Hypercalcemia');
  db.prepare('INSERT INTO cases (id, title, is_active) VALUES (?, ?, 1)').run(hypocalcemiaCaseId, 'Hypocalcemia');
  db.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, ?, 'primary')").run(hypercalcemiaCaseId, cardiologyId);
  db.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, ?, 'primary')").run(hypocalcemiaCaseId, cardiologyId);
  return db;
}

/** @param {import('node:sqlite').DatabaseSync} db @param {string} sql */
function row(db, sql) {
  return /** @type {Record<string, unknown>} */ (db.prepare(sql).get());
}

test('production taxonomy operator SQL is D1-batch compatible, idempotent, and preserves unrelated secondary routes', () => {
  const db = createFixture();
  try {
    assert.doesNotMatch(mutationSql, /\bBEGIN\b|\bCOMMIT\b/i);
    assertPreconditions(row(db, preconditionSql));

    db.exec(mutationSql);
    assertPostconditions(row(db, postconditionSql));

    db.prepare('INSERT INTO concepts (id, name, slug, parent_id, is_active) VALUES (?, ?, ?, NULL, 1)')
      .run('unrelated-topic', 'Unrelated Topic', 'unrelated-topic');
    db.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, ?, 'secondary')")
      .run(hypercalcemiaCaseId, 'unrelated-topic');

    assertPreconditions(row(db, preconditionSql));
    db.exec(mutationSql);
    assertPostconditions(row(db, postconditionSql));

    assert.equal(
      db.prepare('SELECT role FROM case_concepts WHERE case_id = ? AND concept_id = ?').get(hypercalcemiaCaseId, 'unrelated-topic')?.role,
      'secondary'
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM concepts WHERE id IN (?, ?, ?, ?, ?, ?)').get(
      topicIds.electrolyteDisorders,
      topicIds.hypercalcemia,
      topicIds.hypocalcemia,
      topicIds.ecgFindings,
      topicIds.shortQtc,
      topicIds.prolongedQtc
    )?.count, 6);
  } finally {
    db.close();
  }
});

test('production taxonomy preconditions fail closed when a target Case primary route drifts', () => {
  const db = createFixture();
  try {
    db.prepare('INSERT INTO concepts (id, name, slug, parent_id, is_active) VALUES (?, ?, ?, NULL, 1)')
      .run('unexpected-primary', 'Unexpected Primary', 'unexpected-primary');
    db.prepare("UPDATE case_concepts SET role = 'secondary' WHERE case_id = ? AND concept_id = ?")
      .run(hypercalcemiaCaseId, cardiologyId);
    db.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, ?, 'primary')")
      .run(hypercalcemiaCaseId, 'unexpected-primary');

    assert.throws(
      () => assertPreconditions(row(db, preconditionSql)),
      /Hypercalcemia Case no longer has exactly one allowed primary route/i
    );
  } finally {
    db.close();
  }
});

test('production taxonomy preconditions reject reserved Topic ID collisions before mutation', () => {
  const db = createFixture();
  try {
    db.prepare('INSERT INTO concepts (id, name, slug, parent_id, is_active) VALUES (?, ?, ?, NULL, 1)')
      .run(topicIds.shortQtc, 'Unrelated Existing Topic', 'unrelated-existing-topic');

    assert.throws(
      () => assertPreconditions(row(db, preconditionSql)),
      /reserved Topic IDs are occupied/i
    );
  } finally {
    db.close();
  }
});
