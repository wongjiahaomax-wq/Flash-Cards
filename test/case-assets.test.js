import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  attachAssetToCase,
  canManageCaseAssets,
  CaseAssetInputError,
  detachAssetFromCase,
  getAdminCaseData,
  moveCaseAsset,
  updateCaseAssetCaption
} from '../src/lib/server/db/case-assets.js';
import { buildSeedSql } from '../scripts/seed-content.mjs';
import { applyCurrentSchema } from './current-schema.js';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

function createLearningDb() {
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
    }
  };
  return { db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))), sqlite };
}

/** @param {LearningDb} db @param {string} caseId */
async function caseAssetRows(db, caseId) {
  const data = await getAdminCaseData(db, caseId);
  assert.ok(data);
  return data.attached;
}

test('administrator can attach, caption, reorder, and detach Case Assets without duplicates', async () => {
  const fixture = createLearningDb();
  try {
    await attachAssetToCase(fixture.db, 'seed-anterior-a', 'seed-asset-anterior-b');
    await attachAssetToCase(fixture.db, 'seed-anterior-a', 'seed-asset-anterior-c');
    await assert.rejects(
      () => attachAssetToCase(fixture.db, 'seed-anterior-a', 'seed-asset-anterior-b'),
      (error) => error instanceof CaseAssetInputError && /already attached/.test(error.message)
    );

    await updateCaseAssetCaption(fixture.db, 'seed-anterior-a', 'seed-asset-anterior-b', 'Compare this tracing.');
    assert.deepEqual(
      (await caseAssetRows(fixture.db, 'seed-anterior-a')).map((asset) => [asset.assetId, asset.displayOrder, asset.captionMd]),
      [
        ['seed-asset-anterior-a', 0, 'ECG example A'],
        ['seed-asset-anterior-b', 1, 'Compare this tracing.'],
        ['seed-asset-anterior-c', 2, null]
      ]
    );

    await moveCaseAsset(fixture.db, 'seed-anterior-a', 'seed-asset-anterior-b', 'down');
    assert.deepEqual((await caseAssetRows(fixture.db, 'seed-anterior-a')).map((asset) => [asset.assetId, asset.displayOrder]), [
      ['seed-asset-anterior-a', 0],
      ['seed-asset-anterior-c', 1],
      ['seed-asset-anterior-b', 2]
    ]);
    await moveCaseAsset(fixture.db, 'seed-anterior-a', 'seed-asset-anterior-b', 'up');

    await detachAssetFromCase(fixture.db, 'seed-anterior-a', 'seed-asset-anterior-a');
    assert.deepEqual((await caseAssetRows(fixture.db, 'seed-anterior-a')).map((asset) => [asset.assetId, asset.displayOrder]), [
      ['seed-asset-anterior-b', 0],
      ['seed-asset-anterior-c', 1]
    ]);
  } finally {
    fixture.sqlite.close();
  }
});

test('case asset management authorization rejects learners and accepts admins', () => {
  assert.equal(canManageCaseAssets(/** @type {any} */ ({ role: 'user' })), false);
  assert.equal(canManageCaseAssets(/** @type {any} */ ({ role: 'learner, user' })), false);
  assert.equal(canManageCaseAssets(/** @type {any} */ ({ role: 'admin' })), true);
  assert.equal(canManageCaseAssets(/** @type {any} */ ({ role: 'editor,admin' })), true);
  assert.equal(canManageCaseAssets(/** @type {any} */ (null)), false);
});