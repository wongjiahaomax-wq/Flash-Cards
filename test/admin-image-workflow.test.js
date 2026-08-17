import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
import { createStimulusGroup } from '../src/lib/server/db/stimulus-groups.js';

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
  readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');

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

function assetCount(sqlite) {
  const row = sqlite.prepare('SELECT count(*) AS count FROM assets').get();
  return Number(row?.count ?? 0);
}

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

test('active bulk targets expose the existing Case-scoped grouping model only', async () => {
  const fixture = createLearningDb();
  try {
    const active = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Visible set', specificQuestionMode: 'none' });
    const inactive = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Hidden set', specificQuestionMode: 'none' });
    fixture.sqlite.prepare('UPDATE stimulus_groups SET is_active = 0 WHERE id = ?').run(inactive);
    const targets = await listActiveStimulusGroupTargets(fixture.db);
    assert.ok(targets.some((target) => target.id === active && target.caseId === 'seed-anterior-a'));
    assert.equal(targets.some((target) => target.id === inactive), false);
  } finally {
    fixture.sqlite.close();
  }
});

test('new alternative Asset target validation rejects insufficient set-wide coverage before upload', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'Minimum coverage set',
      specificQuestionMode: 'minimum',
      minimumSpecificQuestions: 1
    });
    await assert.rejects(
      () => validateStimulusGroupTargetForNewAssets(fixture.db, groupId, { expectedCaseId: 'seed-anterior-a' }),
      /below this set's minimum of 1/
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Case picker load fails closed for a requested missing or inactive target group', async () => {
  const fixture = createLearningDb();
  try {
    const inactive = await createStimulusGroup(fixture.db, { caseId: 'seed-anterior-a', name: 'Inactive picker set', specificQuestionMode: 'none' });
    fixture.sqlite.prepare('UPDATE stimulus_groups SET is_active = 0 WHERE id = ?').run(inactive);
    const { load } = await import('../src/routes/admin/cases/[caseId]/+page.server.js');

    for (const target of ['missing-target', inactive]) {
      await assert.rejects(
        () => load(/** @type {any} */ ({
          locals: { user: { role: 'admin' } },
          platform: { env: { DB: fixture.d1 } },
          params: { caseId: 'seed-anterior-a' },
          url: new URL(`http://localhost/admin/cases/seed-anterior-a?picker=1&target_group=${encodeURIComponent(target)}`)
        })),
        (error) => Boolean(error && typeof error === 'object' && 'status' in error && error.status === 400)
      );
    }
  } finally {
    fixture.sqlite.close();
  }
});

test('upload-to-alternative-set prevalidation does not create an Asset when target coverage is invalid', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'Upload blocked set',
      specificQuestionMode: 'minimum',
      minimumSpecificQuestions: 1
    });
    const before = assetCount(fixture.sqlite);
    const { actions } = await import('../src/routes/admin/cases/[caseId]/+page.server.js');
    const formData = new FormData();
    formData.set('case_id', 'seed-anterior-a');
    formData.set('target_group_id', groupId);
    formData.set('alt_text', 'Blocked upload alt text');
    formData.set('image', new File([new Uint8Array([137, 80, 78, 71])], 'blocked.png', { type: 'image/png' }));

    const result = await actions.uploadAndAttach(/** @type {any} */ ({
      request: new Request('http://localhost/admin/cases/seed-anterior-a?/uploadAndAttach', { method: 'POST', body: formData }),
      locals: { user: { role: 'admin' } },
      params: { caseId: 'seed-anterior-a' },
      platform: { env: { DB: fixture.d1, MEDIA: {} } }
    }));
    assert.equal('status' in result ? result.status : null, 400);
    assert.equal(assetCount(fixture.sqlite), before);
  } finally {
    fixture.sqlite.close();
  }
});

test('Case image actions require administrator authorization', async () => {
  const { actions } = await import('../src/routes/admin/cases/[caseId]/+page.server.js');
  const formData = new FormData();
  formData.set('case_id', 'seed-anterior-a');
  formData.append('asset_id', 'seed-asset-anterior-b');
  const result = await actions.attachMany(/** @type {any} */ ({
    request: new Request('http://localhost/admin/cases/seed-anterior-a?/attachMany', { method: 'POST', body: formData }),
    locals: { user: { role: 'user' } },
    params: { caseId: 'seed-anterior-a' }
  }));
  assert.equal('status' in result ? result.status : null, 403);
});

test('Images-library bulk grouping action requires administrator authorization', async () => {
  const { actions } = await import('../src/routes/admin/images/+page.server.js');
  const formData = new FormData();
  formData.set('group_id', 'not-trusted');
  formData.append('asset_id', 'seed-asset-anterior-b');
  const result = await actions.bulkAddToStimulusGroup(/** @type {any} */ ({
    request: new Request('http://localhost/admin/images?/bulkAddToStimulusGroup', { method: 'POST', body: formData }),
    locals: { user: { role: 'user' } }
  }));
  assert.equal('status' in result ? result.status : null, 403);
});

test('Case editor keeps Images before Case questions and no longer embeds the unused Asset Library', () => {
  const source = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
  assert.ok(source.indexOf('id="images"') < source.indexOf('id="questions"'));
  assert.match(source, />Images </);
  assert.match(source, /Add images from library/);
  assert.match(source, /image-specific/);
  assert.match(source, /updateStimulusOptionCaption/);
  assert.match(source, /reconcileCasePickerSelection/);
  assert.doesNotMatch(source, /selectedCase\.available/);
  assert.doesNotMatch(source, /<h3>Image library<\/h3>/);
});
