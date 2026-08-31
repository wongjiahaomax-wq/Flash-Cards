// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { startSystemStudyFromForm } from '../src/lib/server/learning/start-system-study.ts';
import { applyCurrentSchema } from './current-schema.js';

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('cardio', 'Cardiovascular', 'cardio', 'system', NULL, 1),
      ('rhythm', 'Rhythm', 'rhythm', 'topic', 'cardio', 1),
      ('metabolic', 'Metabolic', 'metabolic', 'system', NULL, 1),
      ('electrolytes', 'Electrolytes', 'electrolytes', 'topic', 'metabolic', 1);
    INSERT INTO cases (id, title, question_selection_mode, is_active)
    VALUES ('case-a', 'Case A', 'all', 1);
    INSERT INTO case_concepts (case_id, concept_id, role)
    VALUES ('case-a', 'rhythm', 'primary');
    INSERT INTO question_prompts (id, prompt_md, is_active)
    VALUES ('prompt-a', 'Question A', 1);
    INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active)
    VALUES ('question-a', 'case-a', 'prompt-a', 'Answer A', 1);
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
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return { sqlite, db: createDb(d1) };
}

function form({ systemId = 'cardio', routes = [], questionPoolMode = 'core' } = {}) {
  const data = new FormData();
  if (systemId !== null) data.set('systemId', systemId);
  for (const route of routes) data.append('route', route);
  if (questionPoolMode !== null) data.set('questionPoolMode', questionPoolMode);
  return data;
}

test('shared System-start workflow uses repeated routes and canonical duplicate normalization', async () => {
  const fixture = createFixture();
  try {
    const result = await startSystemStudyFromForm({
      db: fixture.db,
      userId: 'learner',
      formData: form({ routes: ['topic:rhythm', 'topic:rhythm', ' topic:rhythm '] }),
      rng: () => 0
    });
    assert.equal(result.ok, true);
    const selectionId = fixture.sqlite.prepare('SELECT study_selection_id FROM reviews WHERE id = ?').get(result.reviewId).study_selection_id;
    assert.equal(
      fixture.sqlite.prepare('SELECT count(*) AS count FROM study_selection_routes WHERE study_selection_id = ?').get(selectionId).count,
      1
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('shared System-start workflow rejects empty and malformed routes while preserving exact failed form state', async () => {
  const fixture = createFixture();
  try {
    const empty = await startSystemStudyFromForm({
      db: fixture.db,
      userId: 'learner',
      formData: form({ routes: [], questionPoolMode: 'expanded' })
    });
    assert.deepEqual(empty, {
      ok: false,
      status: 400,
      form: {
        message: 'Select at least one Topic or curated Tag.',
        systemId: 'cardio',
        selectedRoutes: [],
        questionPoolMode: 'expanded'
      }
    });

    const malformed = await startSystemStudyFromForm({
      db: fixture.db,
      userId: 'learner',
      formData: form({ routes: ['all', 'topic:rhythm'], questionPoolMode: 'core' })
    });
    assert.equal(malformed.ok, false);
    assert.deepEqual(malformed.form.selectedRoutes, ['all', 'topic:rhythm']);
    assert.equal(malformed.form.systemId, 'cardio');
    assert.equal(malformed.form.questionPoolMode, 'core');
    assert.match(malformed.form.message, /Topic or curated Tag values/);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM study_selections').get().count, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('shared System-start workflow rejects cross-System routes and preserves submitted selection state', async () => {
  const fixture = createFixture();
  try {
    const result = await startSystemStudyFromForm({
      db: fixture.db,
      userId: 'learner',
      formData: form({ routes: ['topic:electrolytes'], questionPoolMode: 'expanded' })
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.form.selectedRoutes, ['topic:electrolytes']);
    assert.equal(result.form.systemId, 'cardio');
    assert.equal(result.form.questionPoolMode, 'expanded');
    assert.match(result.form.message, /not available in this System/);
    assert.equal(fixture.sqlite.prepare('SELECT count(*) AS count FROM study_selections').get().count, 0);
  } finally {
    fixture.sqlite.close();
  }
});
