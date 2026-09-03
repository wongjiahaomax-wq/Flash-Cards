// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  deleteUnusedTopic,
  getTopicDeletionEligibility,
  TaxonomyInputError,
  updateTaxonomyConcept
} from '../src/lib/server/db/taxonomy-admin-write.ts';
import { applyCurrentSchema } from './current-schema.js';

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(`
    INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt)
    VALUES ('learner-1', 'Learner', 'learner@example.com', 1, 1, 1);
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('system-eye', 'Eye', 'eye', 'system', NULL, 1),
      ('system-history', 'Historical System', 'historical-system', 'system', NULL, 1),
      ('topic-unused', 'Unused Topic', 'unused-topic', 'topic', 'system-eye', 1),
      ('topic-case', 'Case Topic', 'case-topic', 'topic', 'system-eye', 1),
      ('topic-secondary', 'Secondary Topic', 'secondary-topic', 'topic', 'system-eye', 1),
      ('topic-question', 'Question Topic', 'question-topic', 'topic', 'system-eye', 1),
      ('topic-parent', 'Parent Topic', 'parent-topic', 'topic', 'system-eye', 1),
      ('topic-child', 'Child Topic', 'child-topic', 'topic', 'topic-parent', 1);
    INSERT INTO cases (id, title, is_active) VALUES ('case-1', 'Case One', 1);
    INSERT INTO case_concepts (case_id, concept_id, role) VALUES
      ('case-1', 'topic-case', 'primary'),
      ('case-1', 'topic-secondary', 'secondary');
    INSERT INTO question_prompts (id, prompt_md, is_active) VALUES ('prompt-1', 'What is the diagnosis?', 1);
    INSERT INTO concept_questions (id, concept_id, question_prompt_id, answer_md, inherit_to_descendants, is_active)
    VALUES ('concept-question-1', 'topic-question', 'prompt-1', 'Example answer', 0, 1);
    INSERT INTO learner_system_aggregates (user_id, system_id, scheduled_completed)
    VALUES ('learner-1', 'system-history', 1);
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

function conceptExists(sqlite, conceptId) {
  return Boolean(sqlite.prepare('SELECT id FROM concepts WHERE id = ?').get(conceptId));
}

test('unused Topic deletion permanently removes an otherwise unreferenced Topic', async () => {
  const fixture = createFixture();
  try {
    await deleteUnusedTopic(fixture.db, { conceptId: 'topic-unused' });
    assert.equal(conceptExists(fixture.sqlite, 'topic-unused'), false);
  } finally {
    fixture.sqlite.close();
  }
});

test('unused Topic deletion rejects Systems and Topics with current taxonomy/content usages', async () => {
  const fixture = createFixture();
  try {
    await assert.rejects(
      deleteUnusedTopic(fixture.db, { conceptId: 'system-eye' }),
      (error) => error instanceof TaxonomyInputError && /Only Topics can be deleted/i.test(error.message)
    );

    for (const conceptId of ['topic-case', 'topic-question', 'topic-parent']) {
      await assert.rejects(
        deleteUnusedTopic(fixture.db, { conceptId }),
        (error) => error instanceof TaxonomyInputError && /cannot be deleted/i.test(error.message)
      );
      assert.equal(conceptExists(fixture.sqlite, conceptId), true);
    }
  } finally {
    fixture.sqlite.close();
  }
});

test('Topic deletion eligibility includes hidden secondary Case relationships', async () => {
  const fixture = createFixture();
  try {
    assert.deepEqual(
      await getTopicDeletionEligibility(fixture.db, { conceptId: 'topic-secondary' }),
      {
        canDelete: false,
        hasCaseAttachments: true,
        hasQuestions: false,
        hasChildren: false
      }
    );
    await assert.rejects(
      deleteUnusedTopic(fixture.db, { conceptId: 'topic-secondary' }),
      (error) => error instanceof TaxonomyInputError && /Case attachments/i.test(error.message)
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('central taxonomy writer blocks System to Topic reclassification after retained FSRS history', async () => {
  const fixture = createFixture();
  try {
    await assert.rejects(
      updateTaxonomyConcept(fixture.db, {
        conceptId: 'system-history',
        name: 'Historical System',
        descriptionMd: null,
        kind: 'topic',
        isActive: true
      }),
      (error) => error instanceof TaxonomyInputError && /retained learner FSRS history/i.test(error.message)
    );
    assert.equal(
      fixture.sqlite.prepare("SELECT kind FROM concepts WHERE id = 'system-history'").get()?.kind,
      'system'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('database guard independently blocks raw reclassification or deletion of an attributed System', () => {
  const fixture = createFixture();
  try {
    assert.throws(
      () => fixture.sqlite.exec("UPDATE concepts SET kind = 'topic' WHERE id = 'system-history'"),
      /durable learner FSRS history.*reclassified/i
    );
    assert.throws(
      () => fixture.sqlite.exec("DELETE FROM concepts WHERE id = 'system-history'"),
      /durable learner FSRS history.*deleted/i
    );
  } finally {
    fixture.sqlite.close();
  }
});
