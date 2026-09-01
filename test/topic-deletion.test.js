// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { deleteUnusedTopic, getTopicDeletionEligibility, TaxonomyInputError } from '../src/lib/server/db/taxonomy-admin-write.ts';
import { applyCurrentSchema } from './current-schema.js';

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('system-eye', 'Eye', 'eye', 'system', NULL, 1),
      ('topic-unused', 'Unused Topic', 'unused-topic', 'topic', 'system-eye', 1),
      ('topic-case', 'Case Topic', 'case-topic', 'topic', 'system-eye', 1),
      ('topic-secondary', 'Historical Secondary Topic', 'historical-secondary-topic', 'topic', 'system-eye', 1),
      ('topic-question', 'Question Topic', 'question-topic', 'topic', 'system-eye', 1),
      ('topic-parent', 'Parent Topic', 'parent-topic', 'topic', 'system-eye', 1),
      ('topic-child', 'Child Topic', 'child-topic', 'topic', 'topic-parent', 1),
      ('topic-history', 'Historical Topic', 'historical-topic', 'topic', 'system-eye', 1),
      ('topic-question-history', 'Historical Question Topic', 'historical-question-topic', 'topic', 'system-eye', 1),
      ('topic-selection-history', 'Selection-only Historical Topic', 'selection-only-historical-topic', 'topic', 'system-eye', 1);
    INSERT INTO cases (id, title, is_active) VALUES
      ('case-1', 'Case One', 1),
      ('case-history', 'Historical Case', 1);
    INSERT INTO case_concepts (case_id, concept_id, role) VALUES
      ('case-1', 'topic-case', 'primary'),
      ('case-1', 'topic-secondary', 'secondary'),
      ('case-history', 'topic-history', 'primary');
    INSERT INTO tags (id, name, normalized_name, is_active)
    VALUES ('selection-tag', 'Selection Tag', 'selection tag', 1);
    INSERT INTO system_tags (system_concept_id, tag_id, display_order)
    VALUES ('system-eye', 'selection-tag', 0);
    INSERT INTO case_tags (case_id, tag_id)
    VALUES ('case-1', 'selection-tag');
    INSERT INTO question_prompts (id, prompt_md, is_active) VALUES ('prompt-1', 'What is the diagnosis?', 1);
    INSERT INTO concept_questions (id, concept_id, question_prompt_id, answer_md, inherit_to_descendants, is_active)
    VALUES ('concept-question-1', 'topic-question', 'prompt-1', 'Example answer', 0, 1);
    INSERT INTO reviews (
      id, user_id, case_id, primary_concept_id, study_concept_id, route_type, case_title_snapshot, status
    ) VALUES
      ('review-history', 'user-1', 'case-history', 'topic-history', 'topic-history', 'topic', 'Historical Case', 'completed'),
      ('review-source', 'user-1', 'case-1', 'topic-case', 'topic-case', 'topic', 'Case One', 'completed');
    INSERT INTO review_questions (
      id, review_id, question_prompt_id, source_type, source_concept_id, display_order, prompt_snapshot_md, answer_snapshot_md
    ) VALUES (
      'review-question-source', 'review-source', 'prompt-1', 'concept', 'topic-question-history', 0,
      'What is the diagnosis?', 'Historical answer'
    );
    INSERT INTO study_selections (id, user_id, system_concept_id)
    VALUES ('selection-history', 'user-1', 'system-eye');
    INSERT INTO study_selection_routes (study_selection_id, route_type, route_id) VALUES
      ('selection-history', 'topic', 'topic-selection-history'),
      ('selection-history', 'tag', 'selection-tag');
    INSERT INTO reviews (
      id, user_id, case_id, primary_concept_id, study_concept_id,
      study_system_concept_id, route_type, study_tag_id,
      study_selection_id, case_title_snapshot, status
    ) VALUES (
      'selection-review', 'user-1', 'case-1', 'topic-case', 'topic-case',
      'system-eye', 'tag', 'selection-tag',
      'selection-history', 'Case One', 'completed'
    );
    DELETE FROM case_concepts WHERE case_id = 'case-history' AND concept_id = 'topic-history';
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

test('Topic deletion eligibility includes hidden historical secondary Case relationships', async () => {
  const fixture = createFixture();
  try {
    assert.deepEqual(
      await getTopicDeletionEligibility(fixture.db, { conceptId: 'topic-secondary' }),
      {
        canDelete: false,
        hasCaseAttachments: true,
        hasQuestions: false,
        hasChildren: false,
        hasReviewHistory: false
      }
    );
    await assert.rejects(
      deleteUnusedTopic(fixture.db, { conceptId: 'topic-secondary' }),
      (error) => error instanceof TaxonomyInputError && /Case attachments/i.test(error.message)
    );
    assert.equal(conceptExists(fixture.sqlite, 'topic-secondary'), true);
  } finally {
    fixture.sqlite.close();
  }
});

test('unused Topic deletion preserves Topics referenced only by learner Review history', async () => {
  const fixture = createFixture();
  try {
    for (const conceptId of ['topic-history', 'topic-question-history']) {
      await assert.rejects(
        deleteUnusedTopic(fixture.db, { conceptId }),
        (error) => error instanceof TaxonomyInputError && /learner Review history/i.test(error.message)
      );
      assert.equal(conceptExists(fixture.sqlite, conceptId), true);
    }
  } finally {
    fixture.sqlite.close();
  }
});

test('Topic referenced only by historical multi-select selection provenance is permanently non-deletable', async () => {
  const fixture = createFixture();
  try {
    assert.deepEqual(
      await getTopicDeletionEligibility(fixture.db, { conceptId: 'topic-selection-history' }),
      {
        canDelete: false,
        hasCaseAttachments: false,
        hasQuestions: false,
        hasChildren: false,
        hasReviewHistory: true
      }
    );
    await assert.rejects(
      deleteUnusedTopic(fixture.db, { conceptId: 'topic-selection-history' }),
      (error) => error instanceof TaxonomyInputError && /learner Review history/i.test(error.message)
    );
    assert.equal(conceptExists(fixture.sqlite, 'topic-selection-history'), true);
  } finally {
    fixture.sqlite.close();
  }
});
