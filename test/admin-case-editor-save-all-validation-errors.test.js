import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
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

/** @param {string} name @param {string} value */
function field(name, value) { return { name, type: 'text', value }; }

/** @param {any} draft @param {D1Database} d1 */
async function invokeSaveAll(draft, d1) {
  const { actions } = await import('../src/routes/admin/cases/[caseId]/+page.server.js');
  return actions.saveAll(/** @type {any} */ ({
    request: new Request('http://localhost/admin/cases/seed-anterior-a?/saveAll', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ drafts: [draft] })
    }),
    locals: { user: { role: 'admin' } },
    params: { caseId: 'seed-anterior-a' },
    platform: { env: { DB: d1 } }
  }));
}

/** @param {() => Promise<any>} operation */
async function captureUnexpectedSaveAllLogs(operation) {
  const original = console.error;
  /** @type {any[][]} */
  const calls = [];
  console.error = (...args) => { calls.push(args); };
  try {
    return { result: await operation(), calls };
  } finally {
    console.error = original;
  }
}

test('Save All returns StimulusGroupInputError validation as 400 without internal-error logging', async () => {
  const fixture = createD1Fixture();
  try {
    const draft = {
      kind: 'form',
      action: '?/updateStimulusGroup',
      fields: [
        field('case_id', 'seed-anterior-a'),
        field('group_id', ''),
        field('name', 'Invalid set'),
        field('specific_question_mode', 'none'),
        field('minimum_specific_questions', '')
      ]
    };
    const { result, calls } = await captureUnexpectedSaveAllLogs(() => invokeSaveAll(draft, /** @type {any} */ (fixture.d1)));
    assert.equal(result.status, 400);
    assert.match(result.data.error, /Stimulus Group is required/);
    assert.deepEqual(calls, []);
  } finally {
    fixture.sqlite.close();
  }
});

test('Save All returns CaseAssetInputError caption validation as 400 without internal-error logging', async () => {
  const fixture = createD1Fixture();
  try {
    const draft = {
      kind: 'form',
      action: '?/caption',
      fields: [
        field('case_id', 'seed-anterior-a'),
        field('asset_id', 'missing-save-all-asset'),
        field('caption', 'Invalid caption target')
      ]
    };
    const { result, calls } = await captureUnexpectedSaveAllLogs(() => invokeSaveAll(draft, /** @type {any} */ (fixture.d1)));
    assert.equal(result.status, 400);
    assert.match(result.data.error, /missing or inactive/);
    assert.deepEqual(calls, []);
  } finally {
    fixture.sqlite.close();
  }
});
