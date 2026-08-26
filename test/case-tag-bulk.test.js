import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  bulkAddCaseTag,
  bulkCreateAndAddCaseTag,
  bulkRemoveCaseTag,
  CaseTagBulkError
} from '../src/lib/server/db/case-tag-authoring.ts';
import { createDb } from '../src/lib/server/db/index.js';
import { TagInputError } from '../src/lib/server/db/tag-library.js';

const migrationSql = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0004_resumable_import_jobs.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql',
  '0010_reusable_image_reactivation_guard.sql',
  '0011_asset_supersession.sql',
  '0012_archive_stimulus_options.sql',
  '0013_review_assets_asset_lookup.sql',
  '0014_review_question_pool_mode.sql',
  '0015_contextual_system_topic_tag_navigation.sql'
]
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

/** @param {{ batch?: boolean }} [options] */
function createLearningDb(options = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  const d1 = /** @type {any} */ ({
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
  });
  if (options.batch !== false) {
    /** @param {any[]} queries */
    d1.batch = async (queries) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const query of queries) results.push(await query.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    };
  }
  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite };
}

/** @param {DatabaseSync} sqlite */
function seedCasesAndTags(sqlite) {
  sqlite.exec(`
    INSERT INTO cases (id, title, is_active) VALUES
      ('case-a', 'Case A', 1),
      ('case-b', 'Case B', 1),
      ('case-c', 'Case C', 1),
      ('case-inactive', 'Inactive Case', 0);
    INSERT INTO tags (id, name, normalized_name, is_active) VALUES
      ('tag-target', 'Target Tag', 'target tag', 1),
      ('tag-other', 'Other Tag', 'other tag', 1),
      ('tag-inactive', 'Inactive Tag', 'inactive tag', 0);
    INSERT INTO preview_sessions (id, user_id, status, expires_at)
    VALUES ('preview-session', 'preview-user', 'active', 4102444800000);
    INSERT INTO cases (id, title, preview_session_id, is_active)
    VALUES ('case-preview', 'Preview Case', 'preview-session', 1);
  `);
}

/** @param {DatabaseSync} sqlite @param {string} caseId @param {string} tagId */
function hasCaseTag(sqlite, caseId, tagId) {
  return Boolean(sqlite.prepare('SELECT 1 FROM case_tags WHERE case_id = ? AND tag_id = ?').get(caseId, tagId));
}

/** @param {DatabaseSync} sqlite @param {string} normalizedName */
function tagByNormalizedName(sqlite, normalizedName) {
  return sqlite.prepare('SELECT id, name FROM tags WHERE normalized_name = ?').get(normalizedName);
}

test('bulk Case Tag add/remove is idempotent across mixed membership and preserves unrelated Tags', async () => {
  const fixture = createLearningDb();
  try {
    seedCasesAndTags(fixture.sqlite);
    fixture.sqlite.prepare('INSERT INTO case_tags (case_id, tag_id) VALUES (?, ?)').run('case-a', 'tag-target');
    fixture.sqlite.prepare('INSERT INTO case_tags (case_id, tag_id) VALUES (?, ?)').run('case-a', 'tag-other');

    const added = await bulkAddCaseTag(fixture.db, { caseIds: ['case-a', 'case-b'], tagId: 'tag-target' });
    assert.equal(added.selectedCount, 2);
    assert.equal(added.changedCount, 1);
    assert.equal(hasCaseTag(fixture.sqlite, 'case-a', 'tag-target'), true);
    assert.equal(hasCaseTag(fixture.sqlite, 'case-b', 'tag-target'), true);
    assert.equal(hasCaseTag(fixture.sqlite, 'case-a', 'tag-other'), true);

    const repeatedAdd = await bulkAddCaseTag(fixture.db, { caseIds: ['case-a', 'case-b'], tagId: 'tag-target' });
    assert.equal(repeatedAdd.changedCount, 0);

    const removed = await bulkRemoveCaseTag(fixture.db, { caseIds: ['case-a', 'case-b'], tagId: 'tag-target' });
    assert.equal(removed.selectedCount, 2);
    assert.equal(removed.changedCount, 2);
    assert.equal(hasCaseTag(fixture.sqlite, 'case-a', 'tag-target'), false);
    assert.equal(hasCaseTag(fixture.sqlite, 'case-b', 'tag-target'), false);
    assert.equal(hasCaseTag(fixture.sqlite, 'case-a', 'tag-other'), true);

    const repeatedRemove = await bulkRemoveCaseTag(fixture.db, { caseIds: ['case-a', 'case-b'], tagId: 'tag-target' });
    assert.equal(repeatedRemove.changedCount, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('bulk create normalizes one canonical Tag and attaches it to every selected Case', async () => {
  const fixture = createLearningDb();
  try {
    seedCasesAndTags(fixture.sqlite);
    const result = await bulkCreateAndAddCaseTag(fixture.db, {
      caseIds: ['case-a', 'case-b'],
      name: '  Postural   hypotension  '
    });

    assert.equal(result.tag.name, 'Postural hypotension');
    assert.equal(result.selectedCount, 2);
    assert.equal(result.changedCount, 2);
    const created = tagByNormalizedName(fixture.sqlite, 'postural hypotension');
    assert.ok(created);
    assert.equal(hasCaseTag(fixture.sqlite, 'case-a', String(created.id)), true);
    assert.equal(hasCaseTag(fixture.sqlite, 'case-b', String(created.id)), true);

    await assert.rejects(
      () => bulkCreateAndAddCaseTag(fixture.db, { caseIds: ['case-c'], name: 'postural hypotension' }),
      (error) => error instanceof TagInputError && /already exists/i.test(error.message)
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('bulk Case Tag validation fails the whole selection before writes for inactive, Preview, or inactive-Tag targets', async () => {
  const fixture = createLearningDb();
  try {
    seedCasesAndTags(fixture.sqlite);

    await assert.rejects(
      () => bulkAddCaseTag(fixture.db, { caseIds: ['case-a', 'case-inactive'], tagId: 'tag-target' }),
      (error) => error instanceof CaseTagBulkError && error.code === 'PRODUCTION_CASE_REQUIRED'
    );
    assert.equal(hasCaseTag(fixture.sqlite, 'case-a', 'tag-target'), false);

    await assert.rejects(
      () => bulkAddCaseTag(fixture.db, { caseIds: ['case-a', 'case-preview'], tagId: 'tag-target' }),
      (error) => error instanceof CaseTagBulkError && error.code === 'PRODUCTION_CASE_REQUIRED'
    );
    assert.equal(hasCaseTag(fixture.sqlite, 'case-a', 'tag-target'), false);

    await assert.rejects(
      () => bulkAddCaseTag(fixture.db, { caseIds: ['case-a', 'case-b'], tagId: 'tag-inactive' }),
      (error) => error instanceof TagInputError && /inactive/i.test(error.message)
    );
    assert.equal(hasCaseTag(fixture.sqlite, 'case-a', 'tag-inactive'), false);
    assert.equal(hasCaseTag(fixture.sqlite, 'case-b', 'tag-inactive'), false);
  } finally {
    fixture.sqlite.close();
  }
});

test('bulk Case Tag selection deduplicates IDs and enforces the shared 60-Case ceiling', async () => {
  const fixture = createLearningDb();
  try {
    seedCasesAndTags(fixture.sqlite);
    const result = await bulkAddCaseTag(fixture.db, { caseIds: ['case-a', 'case-a', 'case-b'], tagId: 'tag-target' });
    assert.equal(result.selectedCount, 2);
    assert.equal(result.changedCount, 2);

    await assert.rejects(
      () => bulkAddCaseTag(fixture.db, { caseIds: [], tagId: 'tag-target' }),
      (error) => error instanceof CaseTagBulkError && error.code === 'CASE_REQUIRED'
    );
    await assert.rejects(
      () => bulkAddCaseTag(fixture.db, {
        caseIds: Array.from({ length: 61 }, (_, index) => `case-${index}`),
        tagId: 'tag-target'
      }),
      (error) => error instanceof CaseTagBulkError && error.code === 'CASE_BULK_LIMIT'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('bulk Case Tag updates fail closed without batch support and bulk create cleans up its new Tag', async () => {
  const fixture = createLearningDb({ batch: false });
  try {
    seedCasesAndTags(fixture.sqlite);

    await assert.rejects(
      () => bulkAddCaseTag(fixture.db, { caseIds: ['case-a', 'case-b'], tagId: 'tag-target' }),
      (error) => error instanceof CaseTagBulkError && error.code === 'CASE_TAG_BULK_UNAVAILABLE'
    );
    assert.equal(hasCaseTag(fixture.sqlite, 'case-a', 'tag-target'), false);
    assert.equal(hasCaseTag(fixture.sqlite, 'case-b', 'tag-target'), false);

    await assert.rejects(
      () => bulkCreateAndAddCaseTag(fixture.db, { caseIds: ['case-a', 'case-b'], name: 'No batch orphan' }),
      (error) => error instanceof CaseTagBulkError && error.code === 'CASE_TAG_BULK_UNAVAILABLE'
    );
    assert.equal(tagByNormalizedName(fixture.sqlite, 'no batch orphan'), undefined);
  } finally {
    fixture.sqlite.close();
  }
});
