import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  createCase,
  createConcept,
  listAdminConcepts,
  updateCaseVignette
} from '../src/lib/server/db/admin-content.js';
import { canManageCaseAssets } from '../src/lib/server/db/case-assets.js';
import { listAdminCases } from '../src/lib/server/db/case-assets.js';
import { buildSeedSql } from '../scripts/seed-content.mjs';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

const migrationSql = readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(buildSeedSql());
  const d1 = {
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
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
    /** @param {any[]} statements */
    async batch(statements) {
      return Promise.all(statements.map((/** @type {any} */ statement) => statement.run()));
    }
  };
  return { db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))), sqlite };
}

test('administrator can create Concepts with unique generated slugs', async () => {
  const fixture = createLearningDb();
  try {
    const first = await createConcept(fixture.db, 'New Topic');
    const second = await createConcept(fixture.db, 'New Topic');
    assert.equal(first.slug, 'new-topic');
    assert.equal(second.slug, 'new-topic-2');
    assert.deepEqual(
      (await listAdminConcepts(fixture.db)).filter((concept) => concept.id === first.id || concept.id === second.id).map((concept) => concept.name),
      ['New Topic', 'New Topic']
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('administrator can create a Case with vignette and primary topic association', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, {
      title: 'Admin-only Case label',
      vignetteMd: 'A short case stem for study.',
      conceptId: 'seed-anterior-stemi'
    });

    const listed = await listAdminCases(fixture.db);
    assert.deepEqual(listed.find((item) => item.id === created.id), {
      id: created.id,
      title: 'Admin-only Case label',
      vignetteMd: 'A short case stem for study.',
      conceptId: 'seed-anterior-stemi',
      conceptName: 'Anterior STEMI'
    });
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT case_id, concept_id, role FROM case_concepts WHERE case_id = ?').all(created.id).map((row) => ({ ...row })),
      [{ case_id: created.id, concept_id: 'seed-anterior-stemi', role: 'primary' }]
    );

    await updateCaseVignette(fixture.db, created.id, 'Updated case stem.');
    const updated = fixture.sqlite.prepare('SELECT vignette_md FROM cases WHERE id = ?').get(created.id);
    assert.ok(updated);
    assert.equal(updated.vignette_md, 'Updated case stem.');
  } finally {
    fixture.sqlite.close();
  }
});

test('content management requires the existing administrator role', () => {
  assert.equal(canManageCaseAssets(/** @type {any} */ ({ role: 'learner' })), false);
  assert.equal(canManageCaseAssets(/** @type {any} */ ({ role: 'admin' })), true);
});
