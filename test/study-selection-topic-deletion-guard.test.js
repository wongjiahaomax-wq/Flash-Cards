// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { getTopicDeletionEligibility } from '../src/lib/server/db/taxonomy-admin-write.ts';
import { applyCurrentSchema } from './current-schema.js';

test('database rejects a Topic delete when selection provenance appears after eligibility was checked', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    applyCurrentSchema(sqlite);
    sqlite.exec(`
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
        ('system-a', 'System A', 'system-a', 'system', NULL, 1),
        ('topic-race', 'Topic Race', 'topic-race', 'topic', 'system-a', 1);
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
    const db = createDb(d1);

    assert.deepEqual(await getTopicDeletionEligibility(db, { conceptId: 'topic-race' }), {
      canDelete: true,
      hasCaseAttachments: false,
      hasQuestions: false,
      hasChildren: false,
      hasReviewHistory: false
    });

    sqlite.exec(`
      INSERT INTO study_selections (id, user_id, system_concept_id)
      VALUES ('selection-race', 'learner', 'system-a');
      INSERT INTO study_selection_routes (study_selection_id, route_type, route_id)
      VALUES ('selection-race', 'topic', 'topic-race');
    `);

    assert.throws(
      () => sqlite.prepare('DELETE FROM concepts WHERE id = ?').run('topic-race'),
      /learner study selection history/i
    );
    assert.equal(
      sqlite.prepare('SELECT count(*) AS count FROM concepts WHERE id = ?').get('topic-race').count,
      1
    );
  } finally {
    sqlite.close();
  }
});
