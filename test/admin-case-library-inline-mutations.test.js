import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import { createTag } from '../src/lib/server/db/tag-library.js';
import { applyCurrentSchema } from './current-schema.js';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('$lib/')) {
      return { url: new URL(`../src/lib/${specifier.slice('$lib/'.length)}`, import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

function createD1Fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(buildSeedSql());
  /** @type {any} */
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
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  };
  return { d1, sqlite };
}

/** @param {any} d1 @param {string} caseId @param {string} conceptId */
async function classificationPost(d1, caseId, conceptId) {
  const { POST } = await import('../src/routes/admin/cases/[caseId]/classification/+server.js');
  const body = new FormData();
  body.set('case_id', caseId);
  body.set('operation', 'select-topic');
  body.set('concept_id', conceptId);
  return POST(/** @type {any} */ ({
    request: new Request(`http://localhost/admin/cases/${caseId}/classification`, { method: 'POST', body }),
    locals: { user: { role: 'admin' } },
    platform: { env: { DB: d1 } },
    params: { caseId }
  }));
}

/** @param {any} d1 @param {string} caseId @param {string} operation @param {string} tagId */
async function tagPost(d1, caseId, operation, tagId) {
  const { POST } = await import('../src/routes/admin/cases/[caseId]/case-tags/+server.js');
  const body = new FormData();
  body.set('case_id', caseId);
  body.set('operation', operation);
  body.set('tag_id', tagId);
  body.set('response', 'json');
  return POST(/** @type {any} */ ({
    request: new Request(`http://localhost/admin/cases/${caseId}/case-tags`, { method: 'POST', body }),
    locals: { user: { role: 'admin' } },
    platform: { env: { DB: d1 } },
    params: { caseId }
  }));
}

test('classification route returns bounded authoritative projection and timestamp outcome', async () => {
  const fixture = createD1Fixture();
  try {
    const response = await classificationPost(fixture.d1, 'seed-anterior-a', 'seed-pityriasis-rosea');
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.mutation.changed, true);
    assert.equal(payload.mutation.topic.id, 'seed-pityriasis-rosea');
    assert.equal(typeof payload.mutation.updatedAt, 'string');
    assert.ok(Array.isArray(payload.mutation.taxonomyPath));
  } finally {
    fixture.sqlite.close();
  }
});

test('classification route reports timestamp-only failure as successful mutation with null updatedAt', async () => {
  const fixture = createD1Fixture();
  try {
    fixture.sqlite.exec(`
      CREATE TRIGGER reject_route_classification_timestamp
      BEFORE UPDATE OF updated_at ON cases
      WHEN OLD.id = 'seed-anterior-a'
      BEGIN SELECT RAISE(ABORT, 'forced route timestamp failure'); END;
    `);
    const response = await classificationPost(fixture.d1, 'seed-anterior-a', 'seed-pityriasis-rosea');
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.mutation.changed, true);
    assert.equal(payload.mutation.updatedAt, null);
    assert.equal(fixture.sqlite.prepare("SELECT concept_id FROM case_concepts WHERE case_id = 'seed-anterior-a' AND role = 'primary'").get()?.concept_id, 'seed-pityriasis-rosea');
  } finally {
    fixture.sqlite.close();
  }
});

test('existing-Tag route returns a no-op result without inventing updatedAt', async () => {
  const fixture = createD1Fixture();
  try {
    const tag = await createTag(createDb(/** @type {any} */ (fixture.d1)), 'Route inline Tag');
    const response = await tagPost(fixture.d1, 'seed-anterior-a', 'remove', tag.id);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.mutation.operation, 'remove');
    assert.equal(payload.mutation.changed, false);
    assert.equal(payload.mutation.updatedAt, null);
  } finally {
    fixture.sqlite.close();
  }
});
