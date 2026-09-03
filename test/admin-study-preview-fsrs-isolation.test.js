// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import { buildAdminStudyPreview } from '../src/lib/server/learning/admin-study-preview.js';
import { applyCurrentSchema } from './current-schema.js';

const LEARNER_RUNTIME_TABLES = Object.freeze([
  'learner_preferences',
  'learner_fsrs_profiles',
  'learner_case_fsrs',
  'learner_case_encounters',
  'scheduled_review_events',
  'learner_optimizer_evidence',
  'learner_aggregates',
  'learner_system_aggregates',
  'active_reviews',
  'active_review_questions',
  'active_review_assets',
  'free_review_completion_receipts'
]);

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(buildSeedSql());
  // Reclassify the seed root into a real System so the preview exercises the
  // accepted Systems-first selector against current Production content.
  sqlite.exec("UPDATE concepts SET kind = 'system' WHERE id = 'seed-stemi'");

  const d1 = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() { return sqlite.prepare(sql).all(...params).map((row) => Object.values(row)); },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            }
          };
        }
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  };
  return { sqlite, db: createDb(d1) };
}

function learnerCounts(sqlite) {
  return Object.fromEntries(LEARNER_RUNTIME_TABLES.map((table) => [
    table,
    Number(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? -1)
  ]));
}

function totalChanges(sqlite) {
  return Number(sqlite.prepare('SELECT total_changes() AS n').get()?.n ?? -1);
}

test('Admin Study Preview resolves current learner content without mutating any learner FSRS/Free state', async () => {
  const { sqlite, db } = fixture();
  try {
    const beforeCounts = learnerCounts(sqlite);
    const beforeChanges = totalChanges(sqlite);

    const preview = await buildAdminStudyPreview({
      db,
      systemId: 'seed-stemi',
      routes: [{ routeType: 'topic', routeId: 'seed-anterior-stemi' }],
      caseId: 'seed-anterior-a',
      contentMode: 'expanded',
      rng: () => 0
    });

    assert.equal(preview.systemId, 'seed-stemi');
    assert.equal(preview.candidate.id, 'seed-anterior-a');
    assert.equal(preview.snapshot.case.id, 'seed-anterior-a');
    assert.ok(preview.snapshot.questions.length > 0);
    assert.ok(preview.snapshot.assets.length > 0);

    assert.equal(totalChanges(sqlite), beforeChanges, 'preview resolution must execute no database writes');
    assert.deepEqual(learnerCounts(sqlite), beforeCounts);
  } finally {
    sqlite.close();
  }
});
