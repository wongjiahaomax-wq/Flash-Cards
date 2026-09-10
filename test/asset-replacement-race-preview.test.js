// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  AssetReplacementInputError,
  replaceAssetWithHigherResolution
} from '../src/lib/server/db/asset-replacement.js';
import {
  getDuplicateAssetMergePlan,
  mergeDuplicateAssets
} from '../src/lib/server/db/asset-deduplication.js';

const migrationSql = readdirSync(new URL('../drizzle/', import.meta.url))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function d1Fixture(sqlite, {
  releaseAfterBatches = 0,
  beforeFirstBatch = null,
  maxParamsPerStatement = Infinity
} = {}) {
  let pending = [];
  let barrierOpen = releaseAfterBatches <= 1;
  let firstBatchStarted = false;
  const parameterCounts = [];

  function assertParameterCount(params) {
    parameterCounts.push(params.length);
    if (params.length > maxParamsPerStatement) {
      throw new Error(`D1 statement exceeded the parameter limit: ${params.length}`);
    }
  }

  async function executeBatch(statements) {
    if (!firstBatchStarted) {
      firstBatchStarted = true;
      if (beforeFirstBatch) await beforeFirstBatch(sqlite);
    }
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  return {
    prepare(sql) {
      return {
        bind(...params) {
          assertParameterCount(params);
          return {
            async all() {
              return { results: sqlite.prepare(sql).all(...params) };
            },
            async raw() {
              return sqlite.prepare(sql).all(...params).map((row) => Object.values(row));
            },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return {
                success: true,
                results: [],
                meta: {
                  changes: Number(result.changes),
                  last_row_id: Number(result.lastInsertRowid)
                }
              };
            }
          };
        }
      };
    },
    async batch(statements) {
      if (barrierOpen) return executeBatch(statements);
      return new Promise((resolve, reject) => {
        pending.push({ statements, resolve, reject });
        if (pending.length < releaseAfterBatches) return;
        const queued = pending;
        pending = [];
        barrierOpen = true;
        void (async () => {
          for (const entry of queued) {
            try {
              entry.resolve(await executeBatch(entry.statements));
            } catch (error) {
              entry.reject(error);
            }
          }
        })();
      });
    },
    parameterCounts
  };
}

function bucketFixture() {
  const objects = new Map();
  const writes = [];
  const deleted = [];
  const bucket = {
    async head(key) {
      const value = objects.get(key);
      return value ? { key, size: value.bytes.byteLength } : null;
    },
    async list() {
      return {
        objects: [...objects.entries()].map(([key, value]) => ({ key, size: value.bytes.byteLength })),
        truncated: false
      };
    },
    async put(key, body) {
      if (objects.has(key)) return null;
      const blob = body;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      objects.set(key, { bytes, type: blob.type });
      writes.push(key);
      return { key, size: bytes.byteLength };
    },
    async delete(key) {
      deleted.push(key);
      objects.delete(key);
    }
  };
  return { bucket, objects, writes, deleted };
}

function namedBlob(text, name) {
  const file = new Blob([text], { type: 'image/png' });
  Object.defineProperty(file, 'name', { value: name, enumerable: true });
  return file;
}

function fixture(options = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  const d1 = d1Fixture(sqlite, options);
  const storage = bucketFixture();
  const db = createDb(d1);

  sqlite.prepare(
    'INSERT INTO cases (id, title, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 1, 1, 1)'
  ).run('production-case', 'Production case', 'all');
  sqlite.prepare(
    'INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, preview_session_id, superseded_by_asset_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 1, 1, 1)'
  ).run('asset-a', 'image', 'teaching-images/asset-a.png', 'image/png', 'source.png', 'Source image');
  sqlite.prepare(
    'INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, 0, ?, 1)'
  ).run('production-case', 'asset-a', 'Production caption');
  storage.objects.set('teaching-images/asset-a.png', {
    bytes: new TextEncoder().encode('old-image'),
    type: 'image/png'
  });

  if (options.includeDedupeGraph) addDedupeGraph({ sqlite, ...storage });
  if (options.includeHighCardGraph) addHighCardGraph({ sqlite });

  return { sqlite, d1, db, ...storage };
}

function addDedupeGraph({ sqlite, objects }) {
  sqlite.prepare(
    'INSERT INTO cases (id, title, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 1, 1, 1)'
  ).run('dedupe-case-b', 'Duplicate case', 'all');
  sqlite.prepare(
    'INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, preview_session_id, superseded_by_asset_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, 1, 1, 1)'
  ).run('asset-b', 'image', 'teaching-images/asset-b.png', 'image/png', 'duplicate.png', 'Duplicate image');
  sqlite.prepare(
    'INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, 0, ?, 1)'
  ).run('dedupe-case-b', 'asset-b', 'B caption');
  sqlite.prepare(
    'INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, NULL, 1, 1, 1)'
  ).run('group-a', 'production-case', 'A alternatives', 'none');
  sqlite.prepare(
    'INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES (?, ?, ?, 0, ?, 1, 0, 1)'
  ).run('option-a', 'group-a', 'asset-a', 'A option caption');
  sqlite.prepare(
    'INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, NULL, 1, 1, 1)'
  ).run('group-b', 'dedupe-case-b', 'B alternatives', 'none');
  sqlite.prepare(
    'INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES (?, ?, ?, 0, ?, 1, 0, 1)'
  ).run('option-b', 'group-b', 'asset-b', 'B option caption');
  sqlite.prepare(
    'INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, NULL, 1, 1, 1)'
  ).run('prompt-a', 'A prompt');
  sqlite.prepare(
    'INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, NULL, 1, 1, 1)'
  ).run('prompt-b', 'B prompt');
  sqlite.prepare(
    'INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 1)'
  ).run('aq-a', 'asset-a', 'prompt-a', 'A answer');
  sqlite.prepare(
    'INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 1)'
  ).run('aq-b', 'asset-b', 'prompt-b', 'B answer');
  sqlite.prepare(
    'INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES (?, ?, 1)'
  ).run('option-a', 'aq-a');
  sqlite.prepare(
    'INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES (?, ?, 1)'
  ).run('option-b', 'aq-b');
  objects.set('teaching-images/asset-b.png', {
    bytes: new TextEncoder().encode('duplicate-image'),
    type: 'image/png'
  });
}

function addHighCardGraph({ sqlite }) {
  const graphSize = 20;
  for (let index = 0; index < graphSize; index += 1) {
    sqlite.prepare(
      'INSERT INTO cases (id, title, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, 1, 1, 1)'
    ).run(`high-case-${index}`, `High cardinality case ${index}`, 'all');
    sqlite.prepare(
      'INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, 0, ?, 1)'
    ).run(`high-case-${index}`, 'asset-a', `High fixed caption ${index}`);

    sqlite.prepare(
      'INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, NULL, 1, 1, 1)'
    ).run(`high-group-${index}`, 'production-case', `High alternatives ${index}`, 'none');
    sqlite.prepare(
      'INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES (?, ?, ?, 0, ?, 1, 0, 1)'
    ).run(`high-option-${index}`, `high-group-${index}`, 'asset-a', `High option caption ${index}`);

    sqlite.prepare(
      'INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, NULL, 1, 1, 1)'
    ).run(`high-prompt-${index}`, `High prompt ${index}`);
    sqlite.prepare(
      'INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 1)'
    ).run(`high-question-${index}`, 'asset-a', `high-prompt-${index}`, `High answer ${index}`);
    sqlite.prepare(
      'INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES (?, ?, 1)'
    ).run(`high-option-${index}`, `high-question-${index}`);
  }
}

async function dedupeBIntoA(fx) {
  const plan = await getDuplicateAssetMergePlan({
    db: fx.db,
    bucket: fx.bucket,
    survivorAssetId: 'asset-a',
    duplicateAssetId: 'asset-b'
  });
  assert.equal(plan.canMerge, true);
  return mergeDuplicateAssets({
    db: fx.db,
    bucket: fx.bucket,
    survivorAssetId: 'asset-a',
    duplicateAssetId: 'asset-b',
    mergePlanFingerprint: plan.mergePlanFingerprint,
    certificationConfirmed: true
  });
}

function addLivePreviewFixedReference(fx) {
  const expiresAt = Date.now() + 60_000;
  fx.sqlite.prepare(
    'INSERT INTO preview_sessions (id, user_id, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)'
  ).run('preview-live', 'preview-user', 'active', expiresAt);
  fx.sqlite.prepare(
    'INSERT INTO cases (id, title, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 1, 1, 1)'
  ).run('preview-case', 'Preview case', 'all', 'preview-live');
  fx.sqlite.prepare(
    'INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, 0, ?, 1)'
  ).run('preview-case', 'asset-a', 'Preview caption');
}

function addLivePreviewOptionReference(fx) {
  const expiresAt = Date.now() + 60_000;
  fx.sqlite.prepare(
    'INSERT INTO preview_sessions (id, user_id, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)'
  ).run('preview-live', 'preview-user', 'active', expiresAt);
  fx.sqlite.prepare(
    'INSERT INTO cases (id, title, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 1, 1, 1)'
  ).run('preview-case', 'Preview case', 'all', 'preview-live');
  fx.sqlite.prepare(
    'INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, NULL, 1, 1, 1)'
  ).run('preview-group', 'preview-case', 'Preview alternatives', 'none');
  fx.sqlite.prepare(
    'INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, created_at) VALUES (?, ?, ?, 0, ?, 1, 1)'
  ).run('preview-option', 'preview-group', 'asset-a', 'Preview option caption');
}

test('concurrent replacement submissions allow exactly one claim and clean up the losing R2 object', async () => {
  const fx = fixture({ releaseAfterBatches: 2 });
  try {
    const attempts = await Promise.allSettled([
      replaceAssetWithHigherResolution({
        db: fx.db,
        bucket: fx.bucket,
        assetId: 'asset-a',
        file: namedBlob('first replacement', 'first.png'),
        confirmedSameImage: true
      }),
      replaceAssetWithHigherResolution({
        db: fx.db,
        bucket: fx.bucket,
        assetId: 'asset-a',
        file: namedBlob('second replacement', 'second.png'),
        confirmedSameImage: true
      })
    ]);

    const fulfilled = attempts.filter((result) => result.status === 'fulfilled');
    const rejected = attempts.filter((result) => result.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof AssetReplacementInputError);
    assert.match(rejected[0].reason.message, /already replaced by another submission/);

    const winner = fulfilled[0].value;
    const source = fx.sqlite.prepare(
      'SELECT is_active, superseded_by_asset_id FROM assets WHERE id = ?'
    ).get('asset-a');
    assert.equal(source.is_active, 0);
    assert.equal(source.superseded_by_asset_id, winner.newAssetId);

    const productionAssets = fx.sqlite.prepare(
      'SELECT id, is_active FROM assets WHERE preview_session_id IS NULL ORDER BY id'
    ).all();
    assert.equal(productionAssets.length, 2);
    assert.equal(productionAssets.filter((row) => row.is_active === 1).length, 1);
    assert.equal(productionAssets.some((row) => row.id === winner.newAssetId && row.is_active === 1), true);

    assert.equal(fx.writes.length, 2);
    assert.equal(fx.deleted.length, 1);
    assert.notEqual(fx.deleted[0], winner.newStorageKey);
    assert.equal(fx.objects.has('teaching-images/asset-a.png'), true);
    assert.equal(fx.objects.has(winner.newStorageKey), true);
    assert.equal(fx.objects.size, 2);
  } finally {
    fx.sqlite.close();
  }
});

test('replacement aborts without C residue when dedupe B to A commits after its graph snapshot', async () => {
  let fx;
  fx = fixture({
    includeDedupeGraph: true,
    beforeFirstBatch: async () => {
      const result = await dedupeBIntoA(fx);
      assert.equal(result.cleanup.status, 'cleaned');
    }
  });
  try {
    await assert.rejects(
      () => replaceAssetWithHigherResolution({
        db: fx.db,
        bucket: fx.bucket,
        assetId: 'asset-a',
        file: namedBlob('stale replacement', 'stale.png'),
        confirmedSameImage: true
      }),
      (error) => error instanceof AssetReplacementInputError
        && /relationships changed while this replacement was being prepared/.test(error.message)
    );

    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM assets WHERE id NOT IN (?, ?)').get('asset-a', 'asset-b').count, 0);
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM assets WHERE id = ?').get('asset-b').count, 0);
    assert.equal(fx.sqlite.prepare('SELECT is_active, superseded_by_asset_id FROM assets WHERE id = ?').get('asset-a').is_active, 1);
    assert.equal(fx.sqlite.prepare('SELECT superseded_by_asset_id FROM assets WHERE id = ?').get('asset-a').superseded_by_asset_id, null);
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM assets WHERE id <> ?').get('asset-a').count, 0);
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM asset_questions WHERE asset_id = ?').get('asset-a').count, 2);
    assert.deepEqual(
      fx.sqlite.prepare('SELECT id, asset_id FROM stimulus_group_options ORDER BY id').all().map((row) => ({ ...row })),
      [{ id: 'option-a', asset_id: 'asset-a' }, { id: 'option-b', asset_id: 'asset-a' }]
    );
    assert.equal(fx.writes.length, 1);
    assert.deepEqual(fx.deleted.sort(), ['teaching-images/asset-b.png', fx.writes[0]].sort());
    assert.equal(fx.objects.has(fx.writes[0]), false);
    assert.equal(fx.objects.has('teaching-images/asset-a.png'), true);
    assert.equal(fx.objects.has('teaching-images/asset-b.png'), false);
  } finally {
    fx.sqlite.close();
  }
});

test('replacement started after dedupe migrates the complete unioned graph', async () => {
  const fx = fixture({ includeDedupeGraph: true });
  try {
    const dedupe = await dedupeBIntoA(fx);
    assert.equal(dedupe.cleanup.status, 'cleaned');

    const result = await replaceAssetWithHigherResolution({
      db: fx.db,
      bucket: fx.bucket,
      assetId: 'asset-a',
      file: namedBlob('union replacement', 'union.png'),
      confirmedSameImage: true
    });

    assert.equal(result.clonedAssetQuestionCount, 2);
    assert.equal(result.remappedOptInCount, 2);
    assert.equal(fx.sqlite.prepare('SELECT is_active FROM assets WHERE id = ?').get('asset-a').is_active, 0);
    const successor = fx.sqlite.prepare('SELECT is_active, superseded_by_asset_id FROM assets WHERE id = ?').get(result.newAssetId);
    assert.deepEqual({ ...successor }, { is_active: 1, superseded_by_asset_id: null });
    assert.deepEqual(
      fx.sqlite.prepare('SELECT case_id, asset_id FROM case_assets ORDER BY case_id').all().map((row) => ({ ...row })),
      [
        { case_id: 'dedupe-case-b', asset_id: result.newAssetId },
        { case_id: 'production-case', asset_id: result.newAssetId }
      ]
    );
    assert.deepEqual(
      fx.sqlite.prepare('SELECT id, asset_id FROM stimulus_group_options ORDER BY id').all().map((row) => ({ ...row })),
      [{ id: 'option-a', asset_id: result.newAssetId }, { id: 'option-b', asset_id: result.newAssetId }]
    );
    assert.deepEqual(
      fx.sqlite.prepare('SELECT question_prompt_id, answer_md FROM asset_questions WHERE asset_id = ? ORDER BY question_prompt_id').all(result.newAssetId).map((row) => ({ ...row })),
      [
        { question_prompt_id: 'prompt-a', answer_md: 'A answer' },
        { question_prompt_id: 'prompt-b', answer_md: 'B answer' }
      ]
    );
    assert.deepEqual(
      fx.sqlite.prepare(`
        SELECT stimulus_group_option_id, aq.question_prompt_id
        FROM stimulus_option_asset_questions soaq
        JOIN asset_questions aq ON aq.id = soaq.asset_question_id
        JOIN stimulus_group_options sgo ON sgo.id = soaq.stimulus_group_option_id
        WHERE sgo.asset_id = ?
        ORDER BY stimulus_group_option_id
      `).all(result.newAssetId).map((row) => ({ ...row })),
      [
        { stimulus_group_option_id: 'option-a', question_prompt_id: 'prompt-a' },
        { stimulus_group_option_id: 'option-b', question_prompt_id: 'prompt-b' }
      ]
    );
    assert.equal(fx.objects.has(result.newStorageKey), true);
    assert.equal(fx.objects.has('teaching-images/asset-a.png'), true);
    assert.equal(fx.objects.has('teaching-images/asset-b.png'), false);
  } finally {
    fx.sqlite.close();
  }
});

test('high-cardinality replacement keeps every D1 statement within 100 params and migrates the complete graph', async () => {
  const fx = fixture({ includeHighCardGraph: true, maxParamsPerStatement: 100 });
  try {
    const result = await replaceAssetWithHigherResolution({
      db: fx.db,
      bucket: fx.bucket,
      assetId: 'asset-a',
      file: namedBlob('high cardinality replacement', 'high-card.png'),
      confirmedSameImage: true
    });

    assert.ok(fx.d1.parameterCounts.length > 0);
    assert.ok(fx.d1.parameterCounts.every((count) => count <= 100));
    assert.equal(result.fixedRelationshipCount, 21);
    assert.equal(result.stimulusOptionCount, 20);
    assert.equal(result.clonedAssetQuestionCount, 20);
    assert.equal(result.remappedOptInCount, 20);
    assert.equal(
      fx.sqlite.prepare("SELECT COUNT(*) AS count FROM case_assets WHERE asset_id = ? AND case_id LIKE 'high-case-%'").get(result.newAssetId).count,
      20
    );
    assert.equal(
      fx.sqlite.prepare("SELECT COUNT(*) AS count FROM case_assets WHERE asset_id = 'asset-a' AND case_id LIKE 'high-case-%'").get().count,
      0
    );
    assert.equal(
      fx.sqlite.prepare("SELECT COUNT(*) AS count FROM stimulus_group_options WHERE asset_id = ? AND id LIKE 'high-option-%'").get(result.newAssetId).count,
      20
    );
    assert.equal(
      fx.sqlite.prepare("SELECT COUNT(*) AS count FROM stimulus_group_options WHERE asset_id = 'asset-a' AND id LIKE 'high-option-%'").get().count,
      0
    );
    assert.equal(
      fx.sqlite.prepare("SELECT COUNT(*) AS count FROM asset_questions WHERE asset_id = ? AND question_prompt_id LIKE 'high-prompt-%'").get(result.newAssetId).count,
      20
    );
    assert.equal(
      fx.sqlite.prepare(`
        SELECT COUNT(*) AS count
        FROM stimulus_option_asset_questions soaq
        INNER JOIN asset_questions aq ON aq.id = soaq.asset_question_id
        INNER JOIN stimulus_group_options sgo ON sgo.id = soaq.stimulus_group_option_id
        WHERE aq.asset_id = ? AND sgo.asset_id = ? AND sgo.id LIKE 'high-option-%'
      `).get(result.newAssetId, result.newAssetId).count,
      20
    );
    assert.equal(fx.objects.has(result.newStorageKey), true);
  } finally {
    fx.sqlite.close();
  }
});

test('source deactivation after upload but before the D1 claim rolls back B and cleans its R2 object', async () => {
  const fx = fixture({
    beforeFirstBatch(sqlite) {
      sqlite.prepare('UPDATE assets SET is_active = 0 WHERE id = ?').run('asset-a');
    }
  });
  try {
    await assert.rejects(
      () => replaceAssetWithHigherResolution({
        db: fx.db,
        bucket: fx.bucket,
        assetId: 'asset-a',
        file: namedBlob('doomed replacement', 'doomed.png'),
        confirmedSameImage: true
      }),
      (error) => error instanceof AssetReplacementInputError && /already replaced/.test(error.message)
    );

    assert.equal(fx.writes.length, 1);
    assert.equal(fx.deleted.length, 1);
    assert.equal(fx.objects.has(fx.deleted[0]), false);
    assert.equal(fx.objects.has('teaching-images/asset-a.png'), true);
    assert.equal(
      fx.sqlite.prepare('SELECT COUNT(*) AS count FROM assets WHERE id <> ?').get('asset-a').count,
      0
    );
    const source = fx.sqlite.prepare(
      'SELECT is_active, superseded_by_asset_id FROM assets WHERE id = ?'
    ).get('asset-a');
    assert.equal(source.is_active, 0);
    assert.equal(source.superseded_by_asset_id, null);
  } finally {
    fx.sqlite.close();
  }
});

for (const [label, addReference] of [
  ['fixed Case relationship', addLivePreviewFixedReference],
  ['stimulus option relationship', addLivePreviewOptionReference]
]) {
  test(`replacement preflight blocks an Asset referenced by a live Preview ${label}`, async () => {
    const fx = fixture();
    try {
      addReference(fx);
      await assert.rejects(
        () => replaceAssetWithHigherResolution({
          db: fx.db,
          bucket: fx.bucket,
          assetId: 'asset-a',
          file: namedBlob('blocked replacement', 'blocked.png'),
          confirmedSameImage: true
        }),
        (error) => error instanceof AssetReplacementInputError
          && /active Preview workspace/.test(error.message)
      );

      assert.deepEqual(fx.writes, []);
      assert.deepEqual(fx.deleted, []);
      const source = fx.sqlite.prepare(
        'SELECT is_active, superseded_by_asset_id FROM assets WHERE id = ?'
      ).get('asset-a');
      assert.equal(source.is_active, 1);
      assert.equal(source.superseded_by_asset_id, null);
    } finally {
      fx.sqlite.close();
    }
  });
}

test('Preview becoming live after preflight but before the D1 claim rolls back and cleans the new object', async () => {
  const fx = fixture({
    beforeFirstBatch(sqlite) {
      addLivePreviewFixedReference({ sqlite });
    }
  });
  try {
    await assert.rejects(
      () => replaceAssetWithHigherResolution({
        db: fx.db,
        bucket: fx.bucket,
        assetId: 'asset-a',
        file: namedBlob('blocked late', 'blocked-late.png'),
        confirmedSameImage: true
      }),
      (error) => error instanceof AssetReplacementInputError
        && /active Preview workspace/.test(error.message)
    );

    assert.equal(fx.writes.length, 1);
    assert.equal(fx.deleted.length, 1);
    assert.equal(fx.objects.has(fx.deleted[0]), false);
    assert.equal(fx.objects.has('teaching-images/asset-a.png'), true);
    const source = fx.sqlite.prepare(
      'SELECT is_active, superseded_by_asset_id FROM assets WHERE id = ?'
    ).get('asset-a');
    assert.equal(source.is_active, 1);
    assert.equal(source.superseded_by_asset_id, null);
    assert.equal(
      fx.sqlite.prepare('SELECT asset_id FROM case_assets WHERE case_id = ?').get('preview-case').asset_id,
      'asset-a'
    );
    assert.equal(
      fx.sqlite.prepare('SELECT COUNT(*) AS count FROM assets WHERE id <> ?').get('asset-a').count,
      0
    );
  } finally {
    fx.sqlite.close();
  }
});

test('Admin image detail visibly explains live Preview replacement blocking and renders action errors', () => {
  const ui = readFileSync(
    new URL('../src/routes/admin/images/[assetId]/+page.svelte', import.meta.url),
    'utf8'
  );
  assert.match(ui, /form\?\.error/);
  assert.match(ui, /livePreviewUsage\?\.hasUsage/);
  assert.match(ui, /referenced by an active Preview workspace/);
  assert.match(ui, /Reset that Preview workspace or let it expire/);
});
