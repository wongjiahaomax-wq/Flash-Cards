// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { buildAdminStudyPreview } from '../src/lib/server/learning/admin-study-preview.js';
import { applyCurrentSchema } from './current-schema.js';

const LEARNER_STATE_TABLES = [
  'learner_fsrs_profiles',
  'learner_case_fsrs',
  'learner_case_encounters',
  'learner_optimizer_evidence',
  'learner_aggregates',
  'learner_system_aggregates',
  'learner_preferences',
  'active_reviews',
  'active_review_questions',
  'active_review_assets',
  'scheduled_review_events',
  'free_review_completion_receipts',
  'reviews',
  'review_questions',
  'review_assets'
];

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('system-preview', 'Preview System', 'preview-system', 'system', NULL, 1),
      ('topic-preview', 'Preview Topic', 'preview-topic', 'topic', 'system-preview', 1);
    INSERT INTO cases (id, title, vignette_md, question_selection_mode, is_active)
    VALUES ('case-preview', 'Preview Case', 'A learner-facing vignette.', 'all', 1);
    INSERT INTO case_concepts (case_id, concept_id, role)
    VALUES ('case-preview', 'topic-preview', 'primary');
    INSERT INTO question_prompts (id, prompt_md, is_active)
    VALUES ('prompt-preview', 'What is the diagnosis?', 1);
    INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active)
    VALUES ('case-question-preview', 'case-preview', 'prompt-preview', 'Source-supported answer.', 1);
  `);

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
    }
  };
  return { sqlite, db: createDb(d1) };
}

function learnerStateSnapshot(sqlite) {
  return Object.fromEntries(LEARNER_STATE_TABLES.map((table) => [
    table,
    sqlite.prepare(`SELECT * FROM \`${table}\` ORDER BY rowid`).all()
  ]));
}

test('Admin Study Preview resolves active-Review-shaped content without mutating any learner FSRS/Free/legacy state', async () => {
  const fixture = createFixture();
  try {
    const before = learnerStateSnapshot(fixture.sqlite);
    const preview = await buildAdminStudyPreview({
      db: fixture.db,
      systemId: 'system-preview',
      routes: [{ routeType: 'topic', routeId: 'topic-preview' }],
      caseId: 'case-preview',
      contentMode: 'original',
      rng: () => 0
    });
    const after = learnerStateSnapshot(fixture.sqlite);

    assert.equal(preview.snapshot.case.id, 'case-preview');
    assert.equal(preview.snapshot.questions.length, 1);
    assert.equal(preview.snapshot.questions[0].promptSnapshotMd, 'What is the diagnosis?');
    assert.equal(preview.snapshot.questions[0].answerSnapshotMd, 'Source-supported answer.');
    assert.deepEqual(after, before);
  } finally {
    fixture.sqlite.close();
  }
});
