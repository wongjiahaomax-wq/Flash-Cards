// Focused regression coverage for the production stimulus-cleanup audit.
// @ts-nocheck

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { listStimulusCleanupIssues } from '../src/lib/server/db/stimulus-audit.js';
import { applyCurrentSchema } from './current-schema.js';

function createD1WithBindLimit(sqlite, maxBoundParams) {
  return {
    prepare(sql) {
      return {
        bind(...params) {
          if (params.length > maxBoundParams) {
            throw new Error(`D1 bind limit exceeded: ${params.length} > ${maxBoundParams}`);
          }
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() {
              const statement = sqlite.prepare(sql);
              statement.setReturnArrays(true);
              return statement.all(...params);
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
    }
  };
}

test('stimulus cleanup audit stays below D1 bind limit with more than 100 production Cases and groups', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    applyCurrentSchema(sqlite);

    const insertCase = sqlite.prepare(`
      INSERT INTO cases (id, title, question_selection_mode, is_active)
      VALUES (?, ?, 'automatic', 1)
    `);
    const insertAsset = sqlite.prepare(`
      INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active)
      VALUES (?, 'image', ?, 'image/png', ?, ?, 1)
    `);
    const insertGroup = sqlite.prepare(`
      INSERT INTO stimulus_groups
        (id, case_id, name, display_order, selection_count, specific_question_mode, is_active)
      VALUES (?, ?, ?, 0, 1, 'none', 1)
    `);
    const insertOption = sqlite.prepare(`
      INSERT INTO stimulus_group_options
        (id, stimulus_group_id, asset_id, display_order, is_active)
      VALUES (?, ?, ?, 0, 1)
    `);

    sqlite.exec('BEGIN');
    for (let index = 0; index < 110; index += 1) {
      const suffix = String(index).padStart(3, '0');
      const caseId = `case-${suffix}`;
      const assetId = `asset-${suffix}`;
      const groupId = `group-${suffix}`;
      const optionId = `option-${suffix}`;
      const filename = `${assetId}.png`;

      insertCase.run(caseId, `Case ${suffix}`);
      insertAsset.run(assetId, filename, filename, `Image ${suffix}`);
      insertGroup.run(groupId, caseId, `Family ${suffix}`);
      insertOption.run(optionId, groupId, assetId);
    }
    sqlite.exec('COMMIT');

    const db = createDb(createD1WithBindLimit(sqlite, 100));
    const issues = await listStimulusCleanupIssues(db);

    assert.equal(issues.length, 110);
    assert.ok(issues.every((issue) => issue.severity === 'needs_cleanup'));
    assert.ok(issues.every((issue) => /one-option family has no valid Original/.test(issue.reason)));
  } finally {
    sqlite.close();
  }
});