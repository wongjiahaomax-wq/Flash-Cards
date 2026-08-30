import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getCaseLibraryPage } from '../src/lib/server/db/case-library.js';
import { createDb } from '../src/lib/server/db/index.js';
import { applyCurrentSchema } from './current-schema.js';

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  const d1 = /** @type {any} */ ({
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
        bind(...params) {
          return {
            async all() {
              return { results: sqlite.prepare(sql).all(...params) };
            },
            async raw() {
              return sqlite.prepare(sql).all(...params).map((row) => Object.values(row));
            },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return {
                success: true,
                results: [],
                meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
              };
            }
          };
        }
      };
    },
    /** @param {any[]} queries */
    async batch(queries) {
      return Promise.all(queries.map((query) => query.run()));
    }
  });
  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite };
}

test('Case Library preserves prior lowercased non-ASCII search behavior', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec("INSERT INTO cases (id, title, is_active) VALUES ('case-unicode', 'β-blocker toxicity', 1)");

    const result = await getCaseLibraryPage(
      fixture.db,
      { search: 'Β-BLOCKER', tagId: '' },
      { pageSize: 10 }
    );

    assert.equal(result.totalCount, 1);
    assert.deepEqual(result.rows.map((row) => row.id), ['case-unicode']);
  } finally {
    fixture.sqlite.close();
  }
});