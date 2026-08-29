import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { attachAssetToCase, getAdminCaseData } from '../src/lib/server/db/case-assets.js';
import {
  AdminImageWorkflowInputError,
  ADMIN_IMAGE_BULK_LIMIT,
  attachAssetsToCase,
  bulkAddAssetsToStimulusGroup,
  listActiveStimulusGroupTargets,
  listCaseImagePicker,
  updateStimulusOptionCaption,
  validateStimulusGroupTargetForNewAssets
} from '../src/lib/server/db/admin-image-workflow.js';
import { createDb } from '../src/lib/server/db/index.js';
import { createStimulusGroup, removeStimulusOptionFromCase } from '../src/lib/server/db/stimulus-groups.js';
import { applyCurrentSchema } from './current-schema.js';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('$lib/')) {
      return { url: new URL(`../src/lib/${specifier.slice('$lib/'.length)}`, import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});

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
    },
    /** @param {any[]} statements */
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  };
  return { db: createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1))), d1, sqlite };
}

/**
 * @param {DatabaseSync} sqlite
 * @param {{ id: string, name: string, active?: number, source?: string | null }} asset
 */
function insertAsset(sqlite, { id, name, active = 1, source = null }) {
  sqlite.prepare('INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, source_label, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id, 'image', `teaching-images/${id}.png`, 'image/png', name, `${name} detailed alt`, source, active, 9_000, 9_000
  );
}

/** @param {DatabaseSync} sqlite */
function assetCount(sqlite) {
  const row = sqlite.prepare('SELECT count(*) AS count FROM assets').get();
  return Number(row?.count ?? 0);
}

/** @param {DatabaseSync} sqlite */
function insertPreviewIsolationFixture(sqlite) {
  sqlite.prepare("INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview-isolation-session', 'preview-isolation-user', 'active', 9999999999999)").run();
  sqlite.prepare("INSERT INTO cases (id, title, vignette_md, question_selection_mode, is_active, preview_session_id) VALUES ('preview-isolation-case', 'Preview-only Case', 'Preview-only', 'automatic', 1, 'preview-isolation-session')").run();
  sqlite.prepare("INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, source_label, is_active, preview_session_id) VALUES ('preview-isolation-asset', 'image', 'preview/preview-isolation-asset.png', 'image/png', 'Preview-only image', 'Preview-only image', 'Preview', 1, 'preview-isolation-session')").run();
  sqlite.prepare("INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, is_active) VALUES ('preview-isolation-group', 'preview-isolation-case', 'Preview-only set', 0, 1, 'none', 1)").run();
  sqlite.prepare("INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, is_active) VALUES ('preview-isolation-option', 'preview-isolation-group', 'preview-isolation-asset', 0, 1)").run();
  return { caseId: 'preview-isolation-case', assetId: 'preview-isolation-asset', groupId: 'preview-isolation-group', optionId: 'preview-isolation-option' };
}

test('production Case image picker excludes Preview-owned Assets', async () => {
  const fixture = createLearningDb();
  try {
    const preview = insertPreviewIsolationFixture(fixture.sqlite);
    const beforeCaseAssets = fixture.sqlite.prepare("SELECT * FROM case_assets WHERE case_id='seed-anterior-a'").all();
    const beforePreviewAsset = fixture.sqlite.prepare('SELECT * FROM assets WHERE id=?').get(preview.assetId);

    const results = await listCaseImagePicker(fixture.db, 'seed-anterior-a', { search: 'Preview-only', limit: 10 });

    assert.deepEqual(results.assets, []);
    assert.deepEqual(fixture.sqlite.prepare("SELECT * FROM case_assets WHERE case_id='seed-anterior-a'").all(), beforeCaseAssets);
    assert.deepEqual(fixture.sqlite.prepare('SELECT * FROM assets WHERE id=?').get(preview.assetId), beforePreviewAsset);
  } finally {
    fixture.sqlite.close();
  }
});

test('production multi-attach rejects a Preview-owned Asset without changing production rows', async () => {
  const fixture = createLearningDb();
  try {
    const preview = insertPreviewIsolationFixture(fixture.sqlite);
    const beforeCaseAssets = fixture.sqlite.prepare("SELECT * FROM case_assets WHERE case_id='seed-anterior-a'").all();
    const beforeAsset = fixture.sqlite.prepare('SELECT * FROM assets WHERE id=?').get(preview.assetId);

    await assert.rejects(
      () => attachAssetsToCase(fixture.db, 'seed-anterior-a', [preview.assetId]),
      /missing or inactive/
    );

    assert.deepEqual(fixture.sqlite.prepare("SELECT * FROM case_assets WHERE case_id='seed-anterior-a'").all(), beforeCaseAssets);
    assert.deepEqual(fixture.sqlite.prepare('SELECT * FROM assets WHERE id=?').get(preview.assetId), beforeAsset);
  } finally {
    fixture.sqlite.close();
  }
});

test('production bulk target discovery excludes Preview-owned groups', async () => {
  const fixture = createLearningDb();
  try {
    const preview = insertPreviewIsolationFixture(fixture.sqlite);
    const productionGroup = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Production set', specificQuestionMode: 'none' });
    const beforeGroups = fixture.sqlite.prepare('SELECT * FROM stimulus_groups ORDER BY id').all();

    const targets = await listActiveStimulusGroupTargets(fixture.db);

    assert.ok(targets.some((target) => target.id === productionGroup));
    assert.equal(targets.some((target) => target.id === preview.groupId), false);
    assert.deepEqual(fixture.sqlite.prepare('SELECT * FROM stimulus_groups ORDER BY id').all(), beforeGroups);
  } finally {
    fixture.sqlite.close();
  }
});

test('production bulk-add rejects a Preview-owned group submitted directly without changing rows', async () => {
  const fixture = createLearningDb();
  try {
    const preview = insertPreviewIsolationFixture(fixture.sqlite);
    insertAsset(fixture.sqlite, { id: 'production-bulk-input', name: 'Production bulk input' });
    const beforeGroupOptions = fixture.sqlite.prepare('SELECT * FROM stimulus_group_options WHERE stimulus_group_id=?').all(preview.groupId);
    const beforeAsset = fixture.sqlite.prepare("SELECT * FROM assets WHERE id='production-bulk-input'").get();

    await assert.rejects(
      () => bulkAddAssetsToStimulusGroup(fixture.db, preview.groupId, ['production-bulk-input']),
      /missing or inactive/
    );

    assert.deepEqual(fixture.sqlite.prepare('SELECT * FROM stimulus_group_options WHERE stimulus_group_id=?').all(preview.groupId), beforeGroupOptions);
    assert.deepEqual(fixture.sqlite.prepare("SELECT * FROM assets WHERE id='production-bulk-input'").get(), beforeAsset);
  } finally {
    fixture.sqlite.close();
  }
});

test('production option-caption mutation rejects a Preview-owned option without changing it', async () => {
  const fixture = createLearningDb();
  try {
    const preview = insertPreviewIsolationFixture(fixture.sqlite);
    const beforeOption = fixture.sqlite.prepare('SELECT * FROM stimulus_group_options WHERE id=?').get(preview.optionId);

    await assert.rejects(
      () => updateStimulusOptionCaption(fixture.db, preview.caseId, preview.optionId, 'Must not cross the production boundary'),
      /not attached/
    );

    assert.deepEqual(fixture.sqlite.prepare('SELECT * FROM stimulus_group_options WHERE id=?').get(preview.optionId), beforeOption);
  } finally {
    fixture.sqlite.close();
  }
});

test('Case image picker is bounded, searchable, and excludes Assets already used by the Case', async () => {
  const fixture = createLearningDb();
  try {
    insertAsset(fixture.sqlite, { id: 'picker-ecg-a', name: 'Prolonged QTc ECG alpha', source: 'ECG archive' });
    insertAsset(fixture.sqlite, { id: 'picker-ecg-b', name: 'Prolonged QTc ECG beta' });
    await attachAssetToCase(fixture.db, 'seed-anterior-a', 'picker-ecg-a');

    const results = await listCaseImagePicker(fixture.db, 'seed-anterior-a', { search: 'QTc', limit: 10 });
    assert.deepEqual(results.assets.map((asset) => asset.id), ['picker-ecg-b']);
    assert.equal(results.hasMore, false);
    assert.equal(results.assets[0].imageUrl, '/api/assets/picker-ecg-b/image');
  } finally {
    fixture.sqlite.close();
  }
});

test('multi-attach validates every Asset, supports one or many, and treats fixed duplicates idempotently', async () => {
  const fixture = createLearningDb();
  try {
    insertAsset(fixture.sqlite, { id: 'attach-one', name: 'Attach one' });
    insertAsset(fixture.sqlite, { id: 'attach-two', name: 'Attach two' });
    insertAsset(fixture.sqlite, { id: 'attach-inactive', name: 'Inactive', active: 0 });

    const first = await attachAssetsToCase(fixture.db, 'seed-anterior-a', ['attach-one']);
    assert.deepEqual(first, { requestedCount: 1, attachedCount: 1, alreadyAttachedCount: 0 });
    const second = await attachAssetsToCase(fixture.db, 'seed-anterior-a', ['attach-one', 'attach-two', 'attach-two']);
    assert.deepEqual(second, { requestedCount: 2, attachedCount: 1, alreadyAttachedCount: 1 });
    const repeat = await attachAssetsToCase(fixture.db, 'seed-anterior-a', ['attach-one', 'attach-two']);
    assert.deepEqual(repeat, { requestedCount: 2, attachedCount: 0, alreadyAttachedCount: 2 });

    await assert.rejects(() => attachAssetsToCase(fixture.db, 'seed-anterior-a', ['missing-asset']), AdminImageWorkflowInputError);
    await assert.rejects(() => attachAssetsToCase(fixture.db, 'seed-anterior-a', ['attach-inactive']), /missing or inactive/);
    await assert.rejects(
      () => attachAssetsToCase(fixture.db, 'seed-anterior-a', Array.from({ length: ADMIN_IMAGE_BULK_LIMIT + 1 }, (_, index) => `too-many-${index}`)),
      /limited to/
    );

    const manager = await getAdminCaseData(fixture.db, 'seed-anterior-a', { includeAvailable: false });
    assert.ok(manager);
    assert.equal(manager.available.length, 0);
    assert.ok(manager.attached.some((asset) => asset.assetId === 'attach-one'));
    assert.ok(manager.attached.some((asset) => asset.assetId === 'attach-two'));
  } finally {
    fixture.sqlite.close();
  }
});

test('bulk grouping adds only intended Case-scoped option relationships and is idempotent', async () => {
  const fixture = createLearningDb();
  try {
    insertAsset(fixture.sqlite, { id: 'bulk-a', name: 'Bulk A' });
    insertAsset(fixture.sqlite, { id: 'bulk-b', name: 'Bulk B' });
    const groupId = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Bulk ECG set', specificQuestionMode: 'none' });

    fixture.sqlite.prepare('INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, ?, ?, ?)').run('seed-anterior-b', 'bulk-a', 20, 'Other Case relationship', 9_000);
    const beforeOtherCase = fixture.sqlite.prepare('SELECT case_id, asset_id, caption_md FROM case_assets WHERE case_id = ? AND asset_id = ?').get('seed-anterior-b', 'bulk-a');

    const result = await bulkAddAssetsToStimulusGroup(fixture.db, groupId, ['bulk-a', 'bulk-b']);
    assert.equal(result.addedCount, 2);
    const options = fixture.sqlite.prepare('SELECT asset_id FROM stimulus_group_options WHERE stimulus_group_id = ? ORDER BY display_order').all(groupId).map((row) => row.asset_id);
    assert.deepEqual(options, ['bulk-a', 'bulk-b']);
    assert.deepEqual({ ...fixture.sqlite.prepare('SELECT case_id, asset_id, caption_md FROM case_assets WHERE case_id = ? AND asset_id = ?').get('seed-anterior-b', 'bulk-a') }, { ...beforeOtherCase });

    const repeat = await bulkAddAssetsToStimulusGroup(fixture.db, groupId, ['bulk-a', 'bulk-b']);
    assert.equal(repeat.addedCount, 0);
    assert.equal(repeat.alreadyPresentCount, 2);
    const optionCount = fixture.sqlite.prepare('SELECT count(*) AS count FROM stimulus_group_options WHERE stimulus_group_id = ?').get(groupId);
    assert.ok(optionCount);
    assert.equal(optionCount.count, 2);

    await assert.rejects(() => bulkAddAssetsToStimulusGroup(fixture.db, 'missing-group', ['bulk-a']), /missing or inactive/);
    fixture.sqlite.prepare('UPDATE stimulus_groups SET is_active = 0 WHERE id = ?').run(groupId);
    await assert.rejects(() => bulkAddAssetsToStimulusGroup(fixture.db, groupId, ['bulk-a']), /missing or inactive/);
  } finally {
    fixture.sqlite.close();
  }
});

test('alternative image captions remain editable after picker-based grouping', async () => {
  const fixture = createLearningDb();
  try {
    insertAsset(fixture.sqlite, { id: 'caption-option', name: 'Caption option' });
    const groupId = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Caption set', specificQuestionMode: 'none' });
    await bulkAddAssetsToStimulusGroup(fixture.db, groupId, ['caption-option']);
    const option = fixture.sqlite.prepare('SELECT id FROM stimulus_group_options WHERE stimulus_group_id = ? AND asset_id = ?').get(groupId, 'caption-option');
    assert.ok(option?.id);

    await updateStimulusOptionCaption(fixture.db, 'seed-anterior-a', String(option.id), '  Case-specific ECG caption  ');
    const savedCaption = fixture.sqlite.prepare('SELECT caption_md FROM stimulus_group_options WHERE id = ?').get(option.id);
    assert.ok(savedCaption);
    assert.equal(savedCaption.caption_md, 'Case-specific ECG caption');
    await assert.rejects(() => updateStimulusOptionCaption(fixture.db, 'seed-anterior-b', String(option.id), 'Wrong Case'), /not attached/);
    const unchangedCaption = fixture.sqlite.prepare('SELECT caption_md FROM stimulus_group_options WHERE id = ?').get(option.id);
    assert.ok(unchangedCaption);
    assert.equal(unchangedCaption.caption_md, 'Case-specific ECG caption');
  } finally {
    fixture.sqlite.close();
  }
});

test('bulk grouping rejects fixed or cross-set Case conflicts and invalid Assets without partial relationship changes', async () => {
  const fixture = createLearningDb();
  try {
    insertAsset(fixture.sqlite, { id: 'conflict-free', name: 'Conflict free' });
    insertAsset(fixture.sqlite, { id: 'conflict-fixed', name: 'Conflict fixed' });
    insertAsset(fixture.sqlite, { id: 'conflict-inactive', name: 'Conflict inactive', active: 0 });
    await attachAssetToCase(fixture.db, 'seed-anterior-a', 'conflict-fixed');
    const firstGroup = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'First set', specificQuestionMode: 'none' });
    const secondGroup = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Second set', specificQuestionMode: 'none' });

    await assert.rejects(() => bulkAddAssetsToStimulusGroup(fixture.db, firstGroup, ['conflict-free', 'conflict-fixed']), /fixed images/);
    const firstGroupCount = fixture.sqlite.prepare('SELECT count(*) AS count FROM stimulus_group_options WHERE stimulus_group_id = ?').get(firstGroup);
    assert.ok(firstGroupCount);
    assert.equal(firstGroupCount.count, 0);
    await bulkAddAssetsToStimulusGroup(fixture.db, secondGroup, ['conflict-free']);
    await assert.rejects(() => bulkAddAssetsToStimulusGroup(fixture.db, firstGroup, ['conflict-free']), /another alternative set/);
    await assert.rejects(() => bulkAddAssetsToStimulusGroup(fixture.db, firstGroup, ['conflict-inactive']), /missing or inactive/);
    await assert.rejects(() => bulkAddAssetsToStimulusGroup(fixture.db, firstGroup, ['missing']), /missing or inactive/);
  } finally {
    fixture.sqlite.close();
  }
});