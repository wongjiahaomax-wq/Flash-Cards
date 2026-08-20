import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  AssetReplacementInputError,
  replaceAssetWithHigherResolution
} from '../src/lib/server/db/asset-replacement.js';
import { getReview, startReview } from '../src/lib/server/db/learning.js';
import {
  MAX_IMAGE_BYTES,
  MAX_MEDIA_BYTES,
  MediaStorageLimitError
} from '../src/lib/server/storage/media.js';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('$lib/')) {
      return {
        url: new URL(`../src/lib/${specifier.slice('$lib/'.length)}`, import.meta.url).href,
        shortCircuit: true
      };
    }
    return nextResolve(specifier, context);
  }
});

const migrationSql = readdirSync(new URL('../drizzle/', import.meta.url))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort()
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

/** @param {DatabaseSync} sqlite */
function d1Fixture(sqlite) {
  let failNextBatch = false;
  return {
    failNextBatch() {
      failNextBatch = true;
    },
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
        bind(...params) {
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
    /** @param {any[]} statements */
    async batch(statements) {
      if (failNextBatch) {
        failNextBatch = false;
        throw new Error('simulated D1 replacement failure');
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
  };
}

/** @param {{ extraUsageBytes?: number }} [options] */
function bucketFixture(options = {}) {
  /** @type {Map<string, { bytes: Uint8Array, type: string }>} */
  const objects = new Map();
  /** @type {string[]} */
  const deleted = [];
  /** @type {string[]} */
  const reads = [];
  /** @type {string[]} */
  const writes = [];
  const extraUsageBytes = options.extraUsageBytes ?? 0;

  const bucket = /** @type {R2Bucket} */ ({
    async head(key) {
      const value = objects.get(key);
      return value ? /** @type {any} */ ({ key, size: value.bytes.byteLength }) : null;
    },
    async list() {
      const listed = [...objects.entries()].map(([key, value]) => ({
        key,
        size: value.bytes.byteLength
      }));
      if (extraUsageBytes) {
        listed.push({ key: 'virtual-existing-usage', size: extraUsageBytes });
      }
      return /** @type {any} */ ({ objects: listed, truncated: false });
    },
    async put(key, body) {
      if (objects.has(key)) return null;
      const blob = /** @type {Blob} */ (body);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      objects.set(key, { bytes, type: blob.type });
      writes.push(key);
      return /** @type {any} */ ({ key, size: bytes.byteLength });
    },
    async delete(key) {
      deleted.push(key);
      objects.delete(key);
    },
    async get(key) {
      reads.push(key);
      const value = objects.get(key);
      if (!value) return null;
      return /** @type {any} */ ({
        body: new Blob([value.bytes], { type: value.type }).stream(),
        httpEtag: `\"${key}-etag\"`,
        writeHttpMetadata(headers) {
          if (value.type) headers.set('Content-Type', value.type);
        }
      });
    }
  });

  return { bucket, objects, deleted, reads, writes };
}

/** @param {string} text @param {string} type @param {string} name */
function namedBlob(text, type, name) {
  const file = new Blob([text], { type });
  Object.defineProperty(file, 'name', { value: name, enumerable: true });
  return /** @type {Blob & { name: string }} */ (file);
}

/** @param {{ extraUsageBytes?: number }} [options] */
function fixture(options = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);

  const d1 = d1Fixture(sqlite);
  const storage = bucketFixture(options);
  const db = createDb(/** @type {any} */ (d1));

  sqlite.prepare(
    'INSERT INTO concepts (id, name, slug, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)'
  ).run('topic-fixed', 'Fixed topic', 'fixed-topic');
  sqlite.prepare(
    'INSERT INTO concepts (id, name, slug, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, 1, 1)'
  ).run('topic-stimulus', 'Stimulus topic', 'stimulus-topic');

  sqlite.prepare(
    'INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, 1, 1, 1)'
  ).run('case-fixed', 'Fixed case', 'Fixed vignette', 'all');
  sqlite.prepare(
    'INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, 1, 1, 1)'
  ).run('case-stimulus', 'Stimulus case', 'Stimulus vignette', 'all');
  sqlite.prepare(
    'INSERT INTO case_concepts (case_id, concept_id, role, created_at) VALUES (?, ?, ?, 1)'
  ).run('case-fixed', 'topic-fixed', 'primary');
  sqlite.prepare(
    'INSERT INTO case_concepts (case_id, concept_id, role, created_at) VALUES (?, ?, ?, 1)'
  ).run('case-stimulus', 'topic-stimulus', 'primary');

  sqlite.prepare(
    'INSERT INTO image_collections (id, name, created_at, updated_at) VALUES (?, ?, 1, 1)'
  ).run('collection-a', 'Source collection');
  sqlite.prepare(
    'INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, source_label, source_url, licence, image_collection_id, preview_session_id, superseded_by_asset_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, 1, 1)'
  ).run(
    'asset-a',
    'image',
    'teaching-images/asset-a.png',
    'image/png',
    'old-source.png',
    'Neutral image alt',
    'Source label',
    'https://example.test/source',
    'Permission retained',
    'collection-a'
  );
  storage.objects.set('teaching-images/asset-a.png', {
    bytes: new TextEncoder().encode('old-image-bytes'),
    type: 'image/png'
  });

  sqlite.prepare(
    'INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, ?, ?, 1)'
  ).run('case-fixed', 'asset-a', 2, 'Fixed caption');

  sqlite.prepare(
    'INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, NULL, 1, 1, 1)'
  ).run('group-1', 'case-stimulus', 'ECG set', 'all');
  sqlite.prepare(
    'INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, 1)'
  ).run('option-1', 'group-1', 'asset-a', 3, 'Alternative caption');

  for (const [id, prompt] of [
    ['prompt-reusable', 'What finding is intrinsic to this image?'],
    ['prompt-exact', 'What does this mean in this patient?'],
    ['prompt-archived', 'Archived reusable prompt']
  ]) {
    sqlite.prepare(
      'INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, NULL, 1, 1, 1)'
    ).run(id, prompt);
  }

  sqlite.prepare(
    'INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 1)'
  ).run('aq-old-active', 'asset-a', 'prompt-reusable', 'Canonical reusable answer');
  sqlite.prepare(
    'INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 1, 1)'
  ).run('aq-old-inactive', 'asset-a', 'prompt-archived', 'Archived canonical answer');
  sqlite.prepare(
    'INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES (?, ?, 1)'
  ).run('option-1', 'aq-old-active');
  sqlite.prepare(
    'INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 1)'
  ).run('soq-1', 'option-1', 'prompt-exact', 'Exact Case-specific answer');

  sqlite.prepare(
    'INSERT INTO preview_sessions (id, user_id, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1)'
  ).run('preview-session', 'preview-user', 'active', Date.now() + 60_000);
  sqlite.prepare(
    'INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, preview_session_id, is_active, created_at, updated_at) VALUES (?, ?, NULL, ?, NULL, ?, 1, 1, 1)'
  ).run('preview-case', 'Preview case', 'all', 'preview-session');
  sqlite.prepare(
    'INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES (?, ?, 0, ?, 1)'
  ).run('preview-case', 'asset-a', 'Preview fixed caption');
  sqlite.prepare(
    'INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, NULL, 1, 1, 1)'
  ).run('preview-group', 'preview-case', 'Preview set', 'none');
  sqlite.prepare(
    'INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, created_at) VALUES (?, ?, ?, 0, ?, 1, 1)'
  ).run('preview-option', 'preview-group', 'asset-a', 'Preview option caption');

  return { sqlite, d1, db, ...storage };
}

/** @param {ReturnType<typeof fixture>} fx */
async function startStimulusReview(fx) {
  const reviewId = await startReview({
    db: fx.db,
    userId: 'learner-a',
    conceptId: 'topic-stimulus',
    rng: () => 0
  });
  assert.ok(reviewId);
  const review = await getReview(fx.db, reviewId, 'learner-a');
  assert.ok(review);
  return review;
}

test('replacement creates B, migrates production relationships, clones reusable questions, and preserves historical A provenance', async () => {
  const fx = fixture();
  try {
    const oldReview = await startStimulusReview(fx);
    const oldReusable = oldReview.questions.find((question) => question.sourceType === 'asset');
    assert.equal(oldReview.assets[0].assetId, 'asset-a');
    assert.equal(oldReview.assets[0].storageKey, 'teaching-images/asset-a.png');
    assert.equal(oldReusable?.sourceAssetQuestionId, 'aq-old-active');

    const beforeOption = fx.sqlite.prepare(
      'SELECT * FROM stimulus_group_options WHERE id = ?'
    ).get('option-1');
    const beforeExactQuestion = fx.sqlite.prepare(
      'SELECT * FROM stimulus_option_questions WHERE id = ?'
    ).get('soq-1');

    const result = await replaceAssetWithHigherResolution({
      db: fx.db,
      bucket: fx.bucket,
      assetId: 'asset-a',
      file: namedBlob('new-higher-resolution-image', 'image/png', 'better-copy.png'),
      confirmedSameImage: true
    });

    assert.notEqual(result.newAssetId, 'asset-a');
    assert.notEqual(result.newStorageKey, 'teaching-images/asset-a.png');
    assert.match(result.newStorageKey, /^teaching-images\/.+\.png$/);
    assert.equal(result.fixedRelationshipCount, 1);
    assert.equal(result.stimulusOptionCount, 1);
    assert.equal(result.clonedAssetQuestionCount, 2);
    assert.equal(result.remappedOptInCount, 1);

    const oldAsset = fx.sqlite.prepare('SELECT * FROM assets WHERE id = ?').get('asset-a');
    const newAsset = fx.sqlite.prepare('SELECT * FROM assets WHERE id = ?').get(result.newAssetId);
    assert.equal(oldAsset.is_active, 0);
    assert.equal(oldAsset.superseded_by_asset_id, result.newAssetId);
    assert.equal(oldAsset.storage_key, 'teaching-images/asset-a.png');
    assert.equal(newAsset.is_active, 1);
    assert.equal(newAsset.superseded_by_asset_id, null);
    assert.equal(newAsset.storage_key, result.newStorageKey);
    assert.equal(newAsset.original_filename, 'better-copy.png');
    assert.equal(newAsset.alt_text, oldAsset.alt_text);
    assert.equal(newAsset.source_label, oldAsset.source_label);
    assert.equal(newAsset.source_url, oldAsset.source_url);
    assert.equal(newAsset.licence, oldAsset.licence);
    assert.equal(newAsset.image_collection_id, oldAsset.image_collection_id);

    assert.equal(
      new TextDecoder().decode(fx.objects.get('teaching-images/asset-a.png').bytes),
      'old-image-bytes'
    );
    assert.equal(
      new TextDecoder().decode(fx.objects.get(result.newStorageKey).bytes),
      'new-higher-resolution-image'
    );
    assert.deepEqual(fx.deleted, []);

    const fixed = fx.sqlite.prepare(
      'SELECT * FROM case_assets WHERE case_id = ?'
    ).get('case-fixed');
    assert.equal(fixed.asset_id, result.newAssetId);
    assert.equal(fixed.display_order, 2);
    assert.equal(fixed.caption_md, 'Fixed caption');

    const option = fx.sqlite.prepare(
      'SELECT * FROM stimulus_group_options WHERE id = ?'
    ).get('option-1');
    assert.equal(option.id, 'option-1');
    assert.equal(option.asset_id, result.newAssetId);
    assert.equal(option.stimulus_group_id, beforeOption.stimulus_group_id);
    assert.equal(option.display_order, beforeOption.display_order);
    assert.equal(option.caption_md, beforeOption.caption_md);
    assert.equal(option.is_active, beforeOption.is_active);

    const exactQuestion = fx.sqlite.prepare(
      'SELECT * FROM stimulus_option_questions WHERE id = ?'
    ).get('soq-1');
    assert.deepEqual(exactQuestion, beforeExactQuestion);
    assert.equal(exactQuestion.answer_md, 'Exact Case-specific answer');

    const oldQuestions = fx.sqlite.prepare(
      'SELECT id, asset_id, question_prompt_id, answer_md, is_active FROM asset_questions WHERE asset_id = ? ORDER BY question_prompt_id'
    ).all('asset-a');
    const newQuestions = fx.sqlite.prepare(
      'SELECT id, asset_id, question_prompt_id, answer_md, is_active FROM asset_questions WHERE asset_id = ? ORDER BY question_prompt_id'
    ).all(result.newAssetId);
    assert.equal(oldQuestions.length, 2);
    assert.equal(newQuestions.length, 2);
    for (const oldQuestion of oldQuestions) {
      const clone = newQuestions.find(
        (question) => question.question_prompt_id === oldQuestion.question_prompt_id
      );
      assert.ok(clone);
      assert.notEqual(clone.id, oldQuestion.id);
      assert.equal(clone.answer_md, oldQuestion.answer_md);
      assert.equal(clone.is_active, oldQuestion.is_active);
    }

    const clonedActive = newQuestions.find(
      (question) => question.question_prompt_id === 'prompt-reusable'
    );
    assert.ok(clonedActive);
    const optIn = fx.sqlite.prepare(
      'SELECT * FROM stimulus_option_asset_questions WHERE stimulus_group_option_id = ?'
    ).get('option-1');
    assert.equal(optIn.asset_question_id, clonedActive.id);

    assert.equal(
      fx.sqlite.prepare('SELECT asset_id FROM case_assets WHERE case_id = ?').get('preview-case').asset_id,
      'asset-a'
    );
    assert.equal(
      fx.sqlite.prepare('SELECT asset_id FROM stimulus_group_options WHERE id = ?').get('preview-option').asset_id,
      'asset-a'
    );

    const historical = await getReview(fx.db, oldReview.id, 'learner-a');
    assert.ok(historical);
    assert.equal(historical.assets[0].assetId, 'asset-a');
    assert.equal(historical.assets[0].storageKey, 'teaching-images/asset-a.png');
    const historicalReusable = historical.questions.find((question) => question.sourceType === 'asset');
    assert.equal(historicalReusable.sourceAssetQuestionId, 'aq-old-active');
    assert.equal(historicalReusable.prompt, 'What finding is intrinsic to this image?');
    assert.equal(historicalReusable.answer, 'Canonical reusable answer');

    const newReview = await startStimulusReview(fx);
    assert.equal(newReview.assets[0].assetId, result.newAssetId);
    assert.notEqual(newReview.assets[0].assetId, 'asset-a');
    const newReusable = newReview.questions.find((question) => question.sourceType === 'asset');
    const newExact = newReview.questions.find((question) => question.sourceType === 'stimulus_option');
    assert.equal(newReusable.sourceAssetQuestionId, clonedActive.id);
    assert.equal(newReusable.answer, 'Canonical reusable answer');
    assert.equal(newExact.sourceStimulusOptionId, 'option-1');
    assert.equal(newExact.answer, 'Exact Case-specific answer');

    await assert.rejects(
      () => replaceAssetWithHigherResolution({
        db: fx.db,
        bucket: fx.bucket,
        assetId: 'asset-a',
        file: namedBlob('again', 'image/png', 'again.png'),
        confirmedSameImage: true
      }),
      (error) => error instanceof AssetReplacementInputError
        && /already been superseded/.test(error.message)
    );
  } finally {
    fx.sqlite.close();
  }
});

test('simulated D1 replacement failure rolls back semantics and removes only the newly uploaded R2 object', async () => {
  const fx = fixture();
  try {
    const oldReview = await startStimulusReview(fx);
    fx.d1.failNextBatch();

    await assert.rejects(
      () => replaceAssetWithHigherResolution({
        db: fx.db,
        bucket: fx.bucket,
        assetId: 'asset-a',
        file: namedBlob('doomed-new-image', 'image/png', 'doomed.png'),
        confirmedSameImage: true
      }),
      /simulated D1 replacement failure/
    );

    const asset = fx.sqlite.prepare(
      'SELECT is_active, superseded_by_asset_id, storage_key FROM assets WHERE id = ?'
    ).get('asset-a');
    assert.equal(asset.is_active, 1);
    assert.equal(asset.superseded_by_asset_id, null);
    assert.equal(asset.storage_key, 'teaching-images/asset-a.png');
    assert.equal(
      fx.sqlite.prepare('SELECT asset_id FROM case_assets WHERE case_id = ?').get('case-fixed').asset_id,
      'asset-a'
    );
    assert.equal(
      fx.sqlite.prepare('SELECT asset_id FROM stimulus_group_options WHERE id = ?').get('option-1').asset_id,
      'asset-a'
    );
    assert.equal(
      fx.sqlite.prepare('SELECT asset_question_id FROM stimulus_option_asset_questions WHERE stimulus_group_option_id = ?').get('option-1').asset_question_id,
      'aq-old-active'
    );
    assert.equal(
      fx.sqlite.prepare('SELECT COUNT(*) AS count FROM asset_questions WHERE asset_id <> ?').get('asset-a').count,
      0
    );
    assert.equal(
      fx.sqlite.prepare('SELECT COUNT(*) AS count FROM assets WHERE id <> ? AND preview_session_id IS NULL').get('asset-a').count,
      0
    );

    const historical = await getReview(fx.db, oldReview.id, 'learner-a');
    assert.ok(historical);
    assert.equal(historical.assets[0].storageKey, 'teaching-images/asset-a.png');
    assert.equal(
      historical.questions.find((question) => question.sourceType === 'asset').sourceAssetQuestionId,
      'aq-old-active'
    );

    assert.equal(fx.objects.has('teaching-images/asset-a.png'), true);
    assert.equal(fx.deleted.length, 1);
    assert.notEqual(fx.deleted[0], 'teaching-images/asset-a.png');
    assert.equal(fx.objects.has(fx.deleted[0]), false);
  } finally {
    fx.sqlite.close();
  }
});

test('replacement reuses JPEG/PNG, per-image-size, and total managed-R2 guardrails', async () => {
  const invalidType = fixture();
  try {
    await assert.rejects(
      () => replaceAssetWithHigherResolution({
        db: invalidType.db,
        bucket: invalidType.bucket,
        assetId: 'asset-a',
        file: namedBlob('bad', 'text/plain', 'bad.txt'),
        confirmedSameImage: true
      }),
      (error) => error instanceof MediaStorageLimitError && error.code === 'UNSUPPORTED_TYPE'
    );
    assert.deepEqual(invalidType.writes, []);
  } finally {
    invalidType.sqlite.close();
  }

  const oversized = fixture();
  try {
    const file = new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: 'image/png' });
    Object.defineProperty(file, 'name', { value: 'too-large.png' });
    await assert.rejects(
      () => replaceAssetWithHigherResolution({
        db: oversized.db,
        bucket: oversized.bucket,
        assetId: 'asset-a',
        file: /** @type {any} */ (file),
        confirmedSameImage: true
      }),
      (error) => error instanceof MediaStorageLimitError && error.code === 'IMAGE_TOO_LARGE'
    );
    assert.deepEqual(oversized.writes, []);
  } finally {
    oversized.sqlite.close();
  }

  const oldBytes = 'old-image-bytes'.length;
  const capacity = fixture({ extraUsageBytes: MAX_MEDIA_BYTES - oldBytes - 1 });
  try {
    await assert.rejects(
      () => replaceAssetWithHigherResolution({
        db: capacity.db,
        bucket: capacity.bucket,
        assetId: 'asset-a',
        file: namedBlob('several-bytes', 'image/png', 'capacity.png'),
        confirmedSameImage: true
      }),
      (error) => error instanceof MediaStorageLimitError && error.code === 'BUCKET_LIMIT'
    );
    assert.deepEqual(capacity.writes, []);
  } finally {
    capacity.sqlite.close();
  }
});

test('Preview-owned source Assets and missing same-image confirmation are rejected before R2 writes', async () => {
  const fx = fixture();
  try {
    fx.sqlite.prepare(
      'INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, preview_session_id, superseded_by_asset_id, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, 1, 1)'
    ).run(
      'preview-asset',
      'image',
      'preview/preview-session/preview-asset.png',
      'image/png',
      'preview.png',
      'Preview alt',
      'preview-session'
    );

    await assert.rejects(
      () => replaceAssetWithHigherResolution({
        db: fx.db,
        bucket: fx.bucket,
        assetId: 'preview-asset',
        file: namedBlob('new', 'image/png', 'new.png'),
        confirmedSameImage: true
      }),
      /Preview-owned Assets cannot be replaced/
    );

    await assert.rejects(
      () => replaceAssetWithHigherResolution({
        db: fx.db,
        bucket: fx.bucket,
        assetId: 'asset-a',
        file: namedBlob('new', 'image/png', 'new.png'),
        confirmedSameImage: false
      }),
      /same underlying image/
    );

    assert.deepEqual(fx.writes, []);
  } finally {
    fx.sqlite.close();
  }
});

test('historical Review media serves storage_key_snapshot after A is inactive and another learner is denied', async () => {
  const fx = fixture();
  try {
    const oldReview = await startStimulusReview(fx);
    const reviewAsset = fx.sqlite.prepare(
      'SELECT id FROM review_assets WHERE review_id = ?'
    ).get(oldReview.id);
    assert.ok(reviewAsset);

    const result = await replaceAssetWithHigherResolution({
      db: fx.db,
      bucket: fx.bucket,
      assetId: 'asset-a',
      file: namedBlob('new-higher-resolution-image', 'image/png', 'better-copy.png'),
      confirmedSameImage: true
    });
    assert.equal(
      fx.sqlite.prepare('SELECT is_active FROM assets WHERE id = ?').get('asset-a').is_active,
      0
    );

    const { GET } = await import(
      '../src/routes/api/reviews/[reviewId]/assets/[reviewAssetId]/image/+server.js'
    );
    const response = await GET({
      locals: { user: { id: 'learner-a', role: 'user' } },
      params: { reviewId: oldReview.id, reviewAssetId: reviewAsset.id },
      platform: { env: { DB: fx.d1, MEDIA: fx.bucket } },
      request: new Request(
        `https://example.test/api/reviews/${oldReview.id}/assets/${reviewAsset.id}/image`
      )
    });
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('cache-control'),
      'private, max-age=31536000, immutable'
    );
    assert.equal(await response.text(), 'old-image-bytes');
    assert.equal(fx.reads.at(-1), 'teaching-images/asset-a.png');
    assert.notEqual(fx.reads.at(-1), result.newStorageKey);

    const readsBeforeDenial = fx.reads.length;
    const denied = await GET({
      locals: { user: { id: 'learner-b', role: 'user' } },
      params: { reviewId: oldReview.id, reviewAssetId: reviewAsset.id },
      platform: { env: { DB: fx.d1, MEDIA: fx.bucket } },
      request: new Request(
        `https://example.test/api/reviews/${oldReview.id}/assets/${reviewAsset.id}/image`
      )
    });
    assert.equal(denied.status, 404);
    assert.equal(fx.reads.length, readsBeforeDenial);
  } finally {
    fx.sqlite.close();
  }
});

test('schema/UI/routes keep replacement narrow, production-only, and outside Import Package v1', () => {
  const migration = readFileSync(
    new URL('../drizzle/0011_asset_supersession.sql', import.meta.url),
    'utf8'
  );
  assert.match(migration, /superseded_by_asset_id/);
  assert.match(migration, /REFERENCES `assets`\(`id`\)/);
  assert.match(migration, /assets_superseded_by_idx/);
  assert.doesNotMatch(migration, /asset_family|image_identity|version_history/i);

  const adminUi = readFileSync(
    new URL('../src/routes/admin/images/[assetId]/+page.svelte', import.meta.url),
    'utf8'
  );
  assert.match(adminUi, /Replace with higher-resolution version/);
  assert.match(adminUi, /same underlying image/);
  assert.match(adminUi, /preserving every Stimulus Option ID/);
  assert.match(adminUi, /historical Reviews/);

  const previewServer = readFileSync(
    new URL('../src/routes/preview-admin/images/[assetId]/+page.server.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(previewServer, /replaceHigherResolution|replaceAssetWithHigherResolution/);

  const studyServer = readFileSync(
    new URL('../src/routes/study/[reviewId]/+page.server.js', import.meta.url),
    'utf8'
  );
  assert.match(studyServer, /getReviewImageUrl/);
  assert.doesNotMatch(studyServer, /getTeachingImageUrl/);

  const reviewRoute = readFileSync(
    new URL('../src/routes/api/reviews/[reviewId]/assets/[reviewAssetId]/image/+server.js', import.meta.url),
    'utf8'
  );
  assert.match(reviewRoute, /getOwnedReviewMediaSnapshot/);
  assert.match(reviewRoute, /storageKeySnapshot/);
  assert.match(reviewRoute, /isPreviewWorker/);
  assert.match(reviewRoute, /isPreviewAdmin/);

  const currentAssetRoute = readFileSync(
    new URL('../src/routes/api/assets/[assetId]/image/+server.js', import.meta.url),
    'utf8'
  );
  assert.match(currentAssetRoute, /serveTeachingImage/);

  const importer = readFileSync(
    new URL('../src/lib/server/import/content-package.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(importer, /supersededByAssetId|superseded_by_asset_id/);
});
