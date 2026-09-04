import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import {
  ASSET_LIBRARY_SELECT_ALL_LIMIT,
  AssetLibraryInputError,
  createImageCollection,
  deleteImageCollection,
  assetLibraryQueryContext,
  getAssetLibraryPage,
  getAssetLibraryDetail,
  listAssetLibraryCollections,
  parseAssetLibraryFilters,
  parseAssetLibraryPage,
  renameImageCollection,
  setAssetCollection
} from '../src/lib/server/db/asset-library.js';
import { moveStimulusOptionWithinCase, StimulusOptionMoveError } from '../src/lib/server/db/image-option-move.js';
import { applyCurrentSchema } from './current-schema.js';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('$lib/')) {
      return { url: new URL(`../src/lib/${specifier.slice('$lib/'.length)}`, import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(buildSeedSql());
  let queryCount = 0;
  const d1 = {
    /** @param {string} sql */
    prepare(sql) {
      queryCount += 1;
      return {
        /** @param {...any} params */
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() {
              const statement = sqlite.prepare(sql);
              statement.setReturnArrays(true);
              return statement.all(...params);
            },
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
  return { sqlite, db: createDb(/** @type {any} */ (d1)), getQueryCount: () => queryCount };
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

test('Image Library derives current, active-Review-retained, historical-only, and unused lifecycle states', async () => {
  const { sqlite, db, getQueryCount } = fixture();
  try {
    for (const id of ['lifecycle-fixed', 'lifecycle-option', 'lifecycle-inactive-option', 'lifecycle-removed-option', 'lifecycle-review', 'lifecycle-unused', 'lifecycle-preview-only']) insertAsset(sqlite, id, 12_000);
    insertCase(sqlite, 'lifecycle-case');
    sqlite.prepare('INSERT INTO case_assets (case_id, asset_id, display_order, created_at) VALUES (?, ?, ?, ?)').run('lifecycle-case', 'lifecycle-fixed', 0, 12_001);
    insertGroup(sqlite, 'lifecycle-group', 'lifecycle-case', 0);
    insertOption(sqlite, 'lifecycle-option-row', 'lifecycle-group', 'lifecycle-option', 0);
    insertOption(sqlite, 'lifecycle-inactive-row', 'lifecycle-group', 'lifecycle-inactive-option', 1, null, false);
    insertOption(sqlite, 'lifecycle-removed-row', 'lifecycle-group', 'lifecycle-removed-option', 2);
    sqlite.prepare('UPDATE stimulus_group_options SET is_active = 0, removed_from_case = 1 WHERE id = ?').run('lifecycle-removed-row');

    sqlite.prepare(`INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES (?, ?, ?, 'system', NULL, 1)`)
      .run('lifecycle-system', 'Lifecycle System', 'lifecycle-system');
    sqlite.prepare(`INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES (?, ?, ?, 'topic', ?, 1)`)
      .run('lifecycle-topic', 'Lifecycle Topic', 'lifecycle-topic', 'lifecycle-system');
    sqlite.prepare(`INSERT INTO case_concepts (case_id, concept_id, role, created_at) VALUES (?, ?, 'primary', ?)`)
      .run('lifecycle-case', 'lifecycle-topic', 12_002);
    sqlite.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)')
      .run('lifecycle-user', 'Lifecycle User', 'lifecycle-user@example.test', 12_002, 12_002);
    sqlite.prepare(`
      INSERT INTO active_reviews (
        id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
        run_id, scope_fingerprint, scope_json, generation, review_sequence_epoch,
        parameter_revision, scheduler_revision, scheduler_library_version,
        expected_state_revision, expected_due_at, run_started_at,
        case_title_snapshot, snapshot_version, revealed_at
      ) VALUES (?, ?, ?, ?, 'free', 'original', NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, 1, ?)
    `).run(
      'lifecycle-active-review',
      'lifecycle-user',
      'lifecycle-case',
      'lifecycle-system',
      'lifecycle-run',
      'lifecycle-scope',
      JSON.stringify({ systems: [{ systemId: 'lifecycle-system', mode: 'routes', routes: [{ routeType: 'topic', routeId: 'lifecycle-topic' }] }] }),
      'Lifecycle Case',
      12_003
    );
    sqlite.prepare(`INSERT INTO active_review_assets (id, active_review_id, asset_id, display_order, storage_key_snapshot) VALUES (?, ?, ?, ?, ?)`)
      .run('lifecycle-active-review-asset', 'lifecycle-active-review', 'lifecycle-review', 0, 'teaching-images/lifecycle-review.png');

    sqlite.prepare(`INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES (?, ?, 'active', ?)`).run('lifecycle-preview', 'lifecycle-preview-user', 4_102_444_800_000);
    insertCase(sqlite, 'lifecycle-preview-case', 'lifecycle-preview');
    sqlite.prepare('INSERT INTO case_assets (case_id, asset_id, display_order, created_at) VALUES (?, ?, ?, ?)').run('lifecycle-preview-case', 'lifecycle-preview-only', 0, 12_001);

    const rows = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=lifecycle-&sort=name-asc')), { pageSize: 20 });
    const states = Object.fromEntries(rows.rows.map((row) => [row.id, row.usageState]));
    assert.equal(states['lifecycle-fixed'], 'current');
    assert.equal(states['lifecycle-option'], 'current');
    assert.equal(states['lifecycle-inactive-option'], 'historical');
    assert.equal(states['lifecycle-removed-option'], 'historical');
    assert.equal(states['lifecycle-review'], 'historical');
    assert.equal(states['lifecycle-unused'], 'unused');
    assert.equal(states['lifecycle-preview-only'], 'unused');
    assert.equal(rows.rows.find((row) => row.id === 'lifecycle-review')?.activeReviewCount, 1);
    assert.ok(rows.rows.find((row) => row.id === 'lifecycle-inactive-option')?.topicNames.length);

    const historicalDetail = await getAssetLibraryDetail(db, 'lifecycle-inactive-option');
    assert.ok(historicalDetail);
    assert.equal(historicalDetail.asset.usageCount, 0);
    assert.equal(historicalDetail.currentUsages.length, 0);
    assert.equal(historicalDetail.usages.length, 1);
    assert.equal(historicalDetail.usages[0].relationshipIsCurrent, false);

    const current = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=lifecycle-&usage=current')));
    const historical = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=lifecycle-&usage=historical')));
    const unused = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=lifecycle-&usage=unused')));
    assert.deepEqual(new Set(current.rows.map((row) => row.id)), new Set(['lifecycle-fixed', 'lifecycle-option']));
    assert.deepEqual(new Set(historical.rows.map((row) => row.id)), new Set(['lifecycle-inactive-option', 'lifecycle-removed-option', 'lifecycle-review']));
    assert.deepEqual(new Set(unused.rows.map((row) => row.id)), new Set(['lifecycle-unused', 'lifecycle-preview-only']));

    const historicalByTopic = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('topic=lifecycle-topic&usage=historical&q=lifecycle-')));
    assert.deepEqual(new Set(historicalByTopic.rows.map((row) => row.id)), new Set(['lifecycle-inactive-option', 'lifecycle-removed-option']));

    const activeReviewPlan = sqlite.prepare(`EXPLAIN QUERY PLAN SELECT COUNT(DISTINCT active_review_id) FROM active_review_assets WHERE asset_id = ?`).all('lifecycle-review');
    assert.match(activeReviewPlan.map((row) => String(row.detail)).join(' '), /active_review_assets_asset_idx/);

    const beforeSmallPage = getQueryCount();
    await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=lifecycle-')), { pageSize: 1 });
    const smallPageQueries = getQueryCount() - beforeSmallPage;
    const beforeLargePage = getQueryCount();
    await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=lifecycle-')), { pageSize: 20 });
    assert.equal(getQueryCount() - beforeLargePage, smallPageQueries, 'query count must remain constant as page size grows');
  } finally { sqlite.close(); }
});

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

test('Collections support creation, one-to-one Asset assignment, Unsorted and safe reset', async () => {
  const { sqlite, db } = fixture();
  try {
    const created = await createImageCollection(db, 'ECG');
    assert.equal(created.name, 'ECG');
    assert.deepEqual((await listAssetLibraryCollections(db)).map((row) => row.name), ['ECG']);
    insertAsset(sqlite, 'collection-asset-a', 55_001);
    insertAsset(sqlite, 'collection-asset-b', 55_002);
    await setAssetCollection(db, ['collection-asset-a'], created.id);
    let assigned = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('collection=' + created.id)), { includeAllMatchingIds: true });
    assert.deepEqual(assigned.allMatchingIds, ['collection-asset-a']);
    const unsorted = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('collection=unsorted&q=collection-asset')), { includeAllMatchingIds: true });
    assert.deepEqual(unsorted.allMatchingIds, ['collection-asset-b']);
    await setAssetCollection(db, ['collection-asset-a'], null);
    assigned = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('collection=unsorted&q=collection-asset')), { includeAllMatchingIds: true });
    assert.deepEqual(assigned.allMatchingIds, ['collection-asset-b', 'collection-asset-a']);
    await assert.rejects(() => createImageCollection(db, 'ECG'), /already exists/);
  } finally { sqlite.close(); }
});

test('Collection sorting is deterministic and keeps Unsorted explicit', async () => {
  const { sqlite, db } = fixture();
  try {
    const dermatology = await createImageCollection(db, 'Dermatology');
    const ecg = await createImageCollection(db, 'ECG');
    insertAsset(sqlite, 'sort-unsorted-a', 56_001);
    insertAsset(sqlite, 'sort-unsorted-b', 56_002);
    insertAsset(sqlite, 'sort-ecg', 56_003);
    insertAsset(sqlite, 'sort-derm', 56_004);
    await setAssetCollection(db, ['sort-ecg'], ecg.id);
    await setAssetCollection(db, ['sort-derm'], dermatology.id);
    const ascRows = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=sort-&sort=collection-asc')), {});
    const descRows = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=sort-&sort=collection-desc')), {});
    const unsortedRows = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('q=sort-&sort=unsorted-first')), {});
    assert.deepEqual(ascRows.rows.map((row) => row.id), ['sort-derm', 'sort-ecg', 'sort-unsorted-a', 'sort-unsorted-b']);
    assert.deepEqual(descRows.rows.map((row) => row.id), ['sort-ecg', 'sort-derm', 'sort-unsorted-b', 'sort-unsorted-a']);
    assert.deepEqual(unsortedRows.rows.slice(0, 2).map((row) => row.id), ['sort-unsorted-a', 'sort-unsorted-b']);
  } finally { sqlite.close(); }
});

test('Collection rename preserves its ID and every Asset assignment', async () => {
  const { sqlite, db } = fixture();
  try {
    const collection = await createImageCollection(db, 'ECG');
    insertAsset(sqlite, 'rename-asset', 56_101);
    await setAssetCollection(db, ['rename-asset'], collection.id);
    const renamed = await renameImageCollection(db, collection.id, 'ECG — Hyperkalaemia');
    assert.deepEqual(renamed, { id: collection.id, previousName: 'ECG', name: 'ECG — Hyperkalaemia' });
    const stored = sqlite.prepare('SELECT id, name FROM image_collections WHERE id = ?').get(collection.id);
    const asset = sqlite.prepare('SELECT id, image_collection_id FROM assets WHERE id = ?').get('rename-asset');
    assert.deepEqual({ ...stored }, { id: collection.id, name: 'ECG — Hyperkalaemia' });
    assert.deepEqual({ ...asset }, { id: 'rename-asset', image_collection_id: collection.id });
  } finally { sqlite.close(); }
});

test('Collection rename rejects empty, overlong, duplicate and missing targets', async () => {
  const { sqlite, db } = fixture();
  try {
    const first = await createImageCollection(db, 'ECG');
    const second = await createImageCollection(db, 'Dermatology');
    await assert.rejects(() => renameImageCollection(db, first.id, ''), (error) => error instanceof AssetLibraryInputError && /required/.test(error.message));
    await assert.rejects(() => renameImageCollection(db, first.id, 'x'.repeat(201)), (error) => error instanceof AssetLibraryInputError && /200/.test(error.message));
    await assert.rejects(() => renameImageCollection(db, first.id, 'Dermatology'), (error) => error instanceof AssetLibraryInputError && /already exists/.test(error.message));
    await assert.rejects(() => renameImageCollection(db, 'missing-collection', 'New name'), (error) => error instanceof AssetLibraryInputError && /no longer exists/.test(error.message));
    assert.equal((await listAssetLibraryCollections(db)).length, 2);
    assert.equal(second.name, 'Dermatology');
  } finally { sqlite.close(); }
});

test('Deleting empty and non-empty Collections moves only Assets to Unsorted', async () => {
  const { sqlite, db } = fixture();
  try {
    const empty = await createImageCollection(db, 'Empty collection');
    const emptyResult = await deleteImageCollection(db, empty.id);
    assert.deepEqual(emptyResult, { id: empty.id, name: 'Empty collection', assetCount: 0 });
    const emptyRow = /** @type {{ count: number }} */ (sqlite.prepare('SELECT count(*) AS count FROM image_collections WHERE id = ?').get(empty.id));
    assert.equal(emptyRow.count, 0);

    const collection = await createImageCollection(db, 'ECG — Hyperkalaemia');
    const assetId = 'seed-asset-pityriasis-herald';
    await setAssetCollection(db, [assetId], collection.id);
    const beforeAsset = sqlite.prepare('SELECT id, storage_key, mime_type FROM assets WHERE id = ?').get(assetId);
    const beforeCaseAssets = sqlite.prepare('SELECT case_id, asset_id, display_order, caption_md FROM case_assets WHERE asset_id = ?').all(assetId);
    const deleted = await deleteImageCollection(db, collection.id);
    assert.deepEqual(deleted, { id: collection.id, name: 'ECG — Hyperkalaemia', assetCount: 1 });
    const afterAsset = sqlite.prepare('SELECT id, storage_key, mime_type, image_collection_id FROM assets WHERE id = ?').get(assetId);
    const afterCaseAssets = sqlite.prepare('SELECT case_id, asset_id, display_order, caption_md FROM case_assets WHERE asset_id = ?').all(assetId);
    assert.deepEqual({ ...afterAsset }, { ...beforeAsset, image_collection_id: null });
    assert.deepEqual(afterCaseAssets, beforeCaseAssets);
    const unsortedPage = await getAssetLibraryPage(db, parseAssetLibraryFilters(new URLSearchParams('collection=unsorted')), { includeAllMatchingIds: true });
    assert.ok(unsortedPage.allMatchingIds?.includes(assetId));
  } finally { sqlite.close(); }
});

test('Collection deletion and assignment reject stale or missing Collections', async () => {
  const { sqlite, db } = fixture();
  try {
    insertAsset(sqlite, 'stale-collection-asset', 56_201);
    await assert.rejects(() => deleteImageCollection(db, 'missing-collection'), (error) => error instanceof AssetLibraryInputError && /no longer exists/.test(error.message));
    await assert.rejects(() => setAssetCollection(db, ['stale-collection-asset'], 'missing-collection'), (error) => error instanceof AssetLibraryInputError && /does not exist/.test(error.message));
    const staleAsset = /** @type {{ image_collection_id: string | null }} */ (sqlite.prepare('SELECT image_collection_id FROM assets WHERE id = ?').get('stale-collection-asset'));
    assert.equal(staleAsset.image_collection_id, null);
  } finally { sqlite.close(); }
});

test('Preview Image Library has no Collection metadata mutation actions', () => {
  const previewRoute = readFileSync(new URL('../src/routes/preview-admin/images/+page.server.js', import.meta.url), 'utf8');
  assert.match(previewRoute, /bulkAddToStimulusGroup/);
  assert.doesNotMatch(previewRoute, /createCollection|renameCollection|deleteCollection|setCollection/);
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
