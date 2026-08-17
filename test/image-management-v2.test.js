import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import {
  ASSET_LIBRARY_SELECT_ALL_LIMIT,
  assetLibraryQueryContext,
  getAssetLibraryPage,
  parseAssetLibraryFilters,
  parseAssetLibraryPage
} from '../src/lib/server/db/asset-library.js';
import { moveStimulusOptionWithinCase, StimulusOptionMoveError } from '../src/lib/server/db/image-option-move.js';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('$lib/')) {
      return { url: new URL(`../src/lib/${specifier.slice('$lib/'.length)}`, import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

const migrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');

function fixture() {
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
    }
  };
  return { sqlite, db: createDb(/** @type {any} */ (d1)) };
}

/** @param {DatabaseSync} sqlite @param {string} id @param {number} createdAt @param {string | null} [previewSessionId] */
function insertAsset(sqlite, id, createdAt, previewSessionId = null) {
  sqlite.prepare('INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, 'image', `teaching-images/${id}.png`, 'image/png', `${id}.png`, `${id} alt`, previewSessionId, 1, createdAt, createdAt);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string | null} [previewSessionId] @param {string} [questionMode] @param {number | null} [questionCount] */
function insertCase(sqlite, id, previewSessionId = null, questionMode = 'automatic', questionCount = null) {
  sqlite.prepare('INSERT INTO cases (id, title, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, id, questionMode, questionCount, previewSessionId, 1, 10_000, 10_000);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} caseId @param {number} order @param {{ mode?: string, minimum?: number | null, active?: boolean }} [options] */
function insertGroup(sqlite, id, caseId, order, options = {}) {
  sqlite.prepare('INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, caseId, id, order, 1, options.mode ?? 'none', options.minimum ?? null, options.active === false ? 0 : 1, 10_001 + order, 10_001 + order);
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} groupId @param {string} assetId @param {number} order @param {string | null} [caption] @param {boolean} [active] */
function insertOption(sqlite, id, groupId, assetId, order, caption = null, active = true) {
  sqlite.prepare('INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, groupId, assetId, order, caption, active ? 1 : 0, 11_000 + order);
}

test('Image Library pagination returns deterministic bounded pages and exact counts', async () => {
  const { sqlite, db } = fixture();
  try {
    for (let index = 0; index < 125; index += 1) insertAsset(sqlite, `page-${String(index).padStart(3, '0')}`, 20_000 + index);
    const filters = parseAssetLibraryFilters(new URLSearchParams('q=page-&sort=newest'));
    const first = await getAssetLibraryPage(db, filters, { page: 1, includeAllMatchingIds: true });
    const second = await getAssetLibraryPage(db, filters, { page: 2, includeAllMatchingIds: true });
    const third = await getAssetLibraryPage(db, filters, { page: 3, includeAllMatchingIds: true });
    assert.equal(first.totalCount, 125);
    assert.equal(first.totalPages, 3);
    assert.equal(first.pageSize, 60);
    assert.equal(first.rows.length, 60);
    assert.equal(second.rows.length, 60);
    assert.equal(third.rows.length, 5);
    assert.equal(first.rows[0].id, 'page-124');
    assert.equal(second.rows[0].id, 'page-064');
    assert.equal(third.rows[0].id, 'page-004');
    const allMatchingIds = first.allMatchingIds;
    assert.ok(allMatchingIds);
    assert.equal(allMatchingIds.length, 125);
    assert.deepEqual(new Set(allMatchingIds), new Set([...first.rows, ...second.rows, ...third.rows].map((row) => row.id)));
  } finally { sqlite.close(); }
});

test('Image Library normalizes invalid/out-of-range pages and query context excludes page', async () => {
  const { sqlite, db } = fixture();
  try {
    for (let index = 0; index < 61; index += 1) insertAsset(sqlite, `bounded-${index}`, 30_000 + index);
    assert.equal(parseAssetLibraryPage(new URLSearchParams('page=-8')), 1);
    assert.equal(parseAssetLibraryPage(new URLSearchParams('page=banana')), 1);
    const filters = parseAssetLibraryFilters(new URLSearchParams('q=bounded-&usage=unused&sort=oldest&page=2'));
    const result = await getAssetLibraryPage(db, filters, { page: 999 });
    assert.equal(result.page, 2);
    assert.equal(result.totalPages, 2);
    const contextA = assetLibraryQueryContext(filters);
    const contextB = assetLibraryQueryContext(parseAssetLibraryFilters(new URLSearchParams('q=bounded-&usage=unused&sort=oldest&page=1')));
    assert.equal(contextA, contextB);
    assert.notEqual(contextA, assetLibraryQueryContext(parseAssetLibraryFilters(new URLSearchParams('q=changed&usage=unused&sort=oldest'))));
  } finally { sqlite.close(); }
});

test('Select all matching returns exact IDs up to 300 and refuses silent truncation above the cap', async () => {
  const { sqlite, db } = fixture();
  try {
    for (let index = 0; index < ASSET_LIBRARY_SELECT_ALL_LIMIT + 1; index += 1) insertAsset(sqlite, `cap-${String(index).padStart(3, '0')}`, 40_000 + index);
    const tooMany = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=cap-')), { page: 1, includeAllMatchingIds: true });
    assert.equal(tooMany.totalCount, 301);
    assert.equal(tooMany.allMatchingIds, null);
    sqlite.prepare('UPDATE assets SET is_active = 0 WHERE id = ?').run('cap-300');
    const exact = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=cap-&status=active')), { page: 1, includeAllMatchingIds: true });
    assert.equal(exact.totalCount, 300);
    const exactIds = exact.allMatchingIds;
    assert.ok(exactIds);
    assert.equal(exactIds.length, 300);
    assert.equal(new Set(exactIds).size, 300);
  } finally { sqlite.close(); }
});

test('production paginated Image Library excludes Preview-owned Assets', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.prepare('INSERT INTO preview_sessions (id, user_id, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('preview-session-v2', 'preview-user', 'active', Date.now() + 60_000, 1, 1);
    insertAsset(sqlite, 'production-v2', 50_001);
    insertAsset(sqlite, 'preview-v2', 50_002, 'preview-session-v2');
    const result = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=-v2')), { page: 1, includeAllMatchingIds: true });
    assert.deepEqual(result.rows.map((row) => row.id), ['production-v2']);
    assert.deepEqual(result.allMatchingIds, ['production-v2']);
  } finally { sqlite.close(); }
});

test('same-Case Move preserves option identity, caption, active state and exact-option questions', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'move-case');
    insertAsset(sqlite, 'move-asset', 60_001);
    insertAsset(sqlite, 'target-existing-asset', 60_002);
    insertGroup(sqlite, 'source-group', 'move-case', 0);
    insertGroup(sqlite, 'target-group', 'move-case', 1);
    insertOption(sqlite, 'moving-option', 'source-group', 'move-asset', 0, 'Case-specific ECG caption');
    insertOption(sqlite, 'target-existing-option', 'target-group', 'target-existing-asset', 4, 'Existing target');
    sqlite.prepare('INSERT INTO question_prompts (id, prompt_md, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('move-prompt', 'Describe this exact ECG.', 1, 61_000, 61_000);
    sqlite.prepare('INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('move-question', 'moving-option', 'move-prompt', 'Exact answer', 1, 61_001, 61_001);

    const result = await moveStimulusOptionWithinCase(db, { caseId: 'move-case', optionId: 'moving-option', targetGroupId: 'target-group', previewSessionId: null });
    assert.equal(result.optionId, 'moving-option');
    const moved = sqlite.prepare('SELECT id, stimulus_group_id, display_order, caption_md, is_active FROM stimulus_group_options WHERE id = ?').get('moving-option');
    assert.deepEqual({ ...moved }, { id: 'moving-option', stimulus_group_id: 'target-group', display_order: 5, caption_md: 'Case-specific ECG caption', is_active: 1 });
    const question = sqlite.prepare('SELECT stimulus_group_option_id, answer_md FROM stimulus_option_questions WHERE id = ?').get('move-question');
    assert.deepEqual({ ...question }, { stimulus_group_option_id: 'moving-option', answer_md: 'Exact answer' });
  } finally { sqlite.close(); }
});

test('Move rejects cross-Case, inactive and duplicate target conflicts', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'case-a');
    insertCase(sqlite, 'case-b');
    insertAsset(sqlite, 'asset-a-v2', 70_001);
    insertAsset(sqlite, 'asset-b-v2', 70_002);
    insertGroup(sqlite, 'group-a', 'case-a', 0);
    insertGroup(sqlite, 'group-a-2', 'case-a', 1);
    insertGroup(sqlite, 'group-b', 'case-b', 0);
    insertOption(sqlite, 'option-a', 'group-a', 'asset-a-v2', 0);
    await assert.rejects(
      () => moveStimulusOptionWithinCase(db, { caseId: 'case-a', optionId: 'option-a', targetGroupId: 'group-b', previewSessionId: null }),
      (error) => error instanceof StimulusOptionMoveError && /same Case/.test(error.message)
    );
    sqlite.prepare('UPDATE stimulus_groups SET is_active = 0 WHERE id = ?').run('group-a-2');
    await assert.rejects(
      () => moveStimulusOptionWithinCase(db, { caseId: 'case-a', optionId: 'option-a', targetGroupId: 'group-a-2', previewSessionId: null }),
      (error) => error instanceof StimulusOptionMoveError && /inactive/.test(error.message)
    );
    sqlite.prepare('UPDATE stimulus_groups SET is_active = 1 WHERE id = ?').run('group-a-2');
    insertOption(sqlite, 'duplicate-option', 'group-a-2', 'asset-a-v2', 0);
    await assert.rejects(
      () => moveStimulusOptionWithinCase(db, { caseId: 'case-a', optionId: 'option-a', targetGroupId: 'group-a-2', previewSessionId: null }),
      (error) => error instanceof StimulusOptionMoveError && /already has/.test(error.message)
    );
  } finally { sqlite.close(); }
});

test('Move validates target minimum coverage and keeps group-level questions with their groups', async () => {
  const { sqlite, db } = fixture();
  try {
    insertCase(sqlite, 'coverage-case', null, 'fixed', 4);
    insertAsset(sqlite, 'coverage-asset', 80_001);
    insertGroup(sqlite, 'coverage-source', 'coverage-case', 0);
    insertGroup(sqlite, 'coverage-target', 'coverage-case', 1, { mode: 'minimum', minimum: 1 });
    insertOption(sqlite, 'coverage-option', 'coverage-source', 'coverage-asset', 0);
    await assert.rejects(
      () => moveStimulusOptionWithinCase(db, { caseId: 'coverage-case', optionId: 'coverage-option', targetGroupId: 'coverage-target', previewSessionId: null }),
      (error) => error instanceof StimulusOptionMoveError && /below the set minimum/.test(error.message)
    );
    sqlite.prepare('INSERT INTO question_prompts (id, prompt_md, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('coverage-prompt', 'Set-wide question', 1, 80_010, 80_010);
    sqlite.prepare('INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('coverage-question', 'coverage-target', 'coverage-prompt', 'Target answer', 1, 80_011, 80_011);
    await moveStimulusOptionWithinCase(db, { caseId: 'coverage-case', optionId: 'coverage-option', targetGroupId: 'coverage-target', previewSessionId: null });
    const coverageQuestion = /** @type {{ stimulus_group_id?: unknown } | undefined} */ (sqlite.prepare('SELECT stimulus_group_id FROM stimulus_group_questions WHERE id = ?').get('coverage-question'));
    assert.equal(coverageQuestion?.stimulus_group_id, 'coverage-target');
  } finally { sqlite.close(); }
});

test('production and Preview Move enforce workspace ownership', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.prepare('INSERT INTO preview_sessions (id, user_id, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('session-a', 'user-a', 'active', Date.now() + 60_000, 1, 1);
    sqlite.prepare('INSERT INTO preview_sessions (id, user_id, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('session-b', 'user-b', 'active', Date.now() + 60_000, 2, 2);
    insertCase(sqlite, 'preview-case-a', 'session-a');
    insertAsset(sqlite, 'preview-move-asset', 90_001);
    insertGroup(sqlite, 'preview-source', 'preview-case-a', 0);
    insertGroup(sqlite, 'preview-target', 'preview-case-a', 1);
    insertOption(sqlite, 'preview-option', 'preview-source', 'preview-move-asset', 0, 'Preview caption');

    await assert.rejects(
      () => moveStimulusOptionWithinCase(db, { caseId: 'preview-case-a', optionId: 'preview-option', targetGroupId: 'preview-target', previewSessionId: null }),
      (error) => error instanceof StimulusOptionMoveError && error.code === 'NOT_OWNED'
    );
    await assert.rejects(
      () => moveStimulusOptionWithinCase(db, { caseId: 'preview-case-a', optionId: 'preview-option', targetGroupId: 'preview-target', previewSessionId: 'session-b' }),
      (error) => error instanceof StimulusOptionMoveError && error.code === 'NOT_OWNED'
    );
    const moved = await moveStimulusOptionWithinCase(db, { caseId: 'preview-case-a', optionId: 'preview-option', targetGroupId: 'preview-target', previewSessionId: 'session-a' });
    assert.equal(moved.optionId, 'preview-option');
  } finally { sqlite.close(); }
});
