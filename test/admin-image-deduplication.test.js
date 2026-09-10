// @ts-nocheck

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { compile } from 'svelte/compiler';
import { render } from 'svelte/server';

import { createDb } from '../src/lib/server/db/index.js';
import {
  AssetDeduplicationInputError,
  AssetDeduplicationStaleError,
  cleanupDuplicateAsset,
  getDuplicateAssetMergePlan,
  listPendingDuplicateCleanup,
  mergeDuplicateAssets
} from '../src/lib/server/db/asset-deduplication.js';
import { ActiveReviewError, createFreeActiveReview } from '../src/lib/server/db/active-reviews.js';
import {
  AssetQuestionInputError,
  createAssetQuestion,
  removeAssetQuestionOptIn,
  optInAssetQuestion,
  optInFixedAssetQuestion,
  setAssetQuestionActive,
  updateAssetQuestionAnswer
} from '../src/lib/server/db/asset-questions.js';
import { applyCurrentSchema } from './current-schema.js';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  return sqlite;
}

function insertAsset(sqlite, id, overrides = {}) {
  sqlite.prepare(`
    INSERT INTO assets (
      id, type, storage_key, mime_type, original_filename, alt_text,
      preview_session_id, superseded_by_asset_id, deduplicated_into_asset_id,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    overrides.type ?? 'image',
    overrides.storageKey ?? `teaching-images/${id}.png`,
    overrides.mimeType ?? 'image/png',
    overrides.filename ?? id,
    overrides.altText ?? `${id} alt`,
    overrides.previewSessionId ?? null,
    overrides.supersededByAssetId ?? null,
    overrides.deduplicatedIntoAssetId ?? null,
    overrides.isActive ?? 1,
    overrides.createdAt ?? 1,
    overrides.updatedAt ?? 1
  );
}

function expectConstraint(action, message = /deduplicat|tombstone/i) {
  assert.throws(action, (error) => {
    assert.match(String(error?.message ?? error), message);
    return true;
  });
}

function d1Fixture(sqlite, { beforeBatch, beforeStatement } = {}) {
  return {
    prepare(statement) {
      return {
        bind(...params) {
          return {
            async all() { if (beforeStatement) await beforeStatement(statement, sqlite); return { results: sqlite.prepare(statement).all(...params) }; },
            async first() { return sqlite.prepare(statement).get(...params) ?? null; },
            async raw() { if (beforeStatement) await beforeStatement(statement, sqlite); return sqlite.prepare(statement).all(...params).map((row) => Object.values(row)); },
            async run() {
              if (beforeStatement) await beforeStatement(statement, sqlite);
              const result = sqlite.prepare(statement).run(...params);
              return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            },
            statement
          };
        }
      };
    },
    async batch(statements) {
      if (beforeBatch) await beforeBatch(sqlite, statements);
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

function bucketFixture({ deleteError = false } = {}) {
  const objects = new Map();
  const deleted = [];
  return {
    objects,
    deleted,
    bucket: {
      async head(key) { return objects.has(key) ? { key, size: 10 } : null; },
      async delete(key) {
        deleted.push(key);
        if (deleteError) throw new Error('simulated R2 delete failure');
        objects.delete(key);
      }
    }
  };
}

function domainFixture(options = {}) {
  const sqlite = fixture();
  const d1 = d1Fixture(sqlite, options);
  const storage = bucketFixture(options);
  const db = createDb(d1);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, is_active, created_at, updated_at) VALUES ('system', 'System', 'system', 'system', 1, 1, 1);
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active, created_at, updated_at) VALUES ('topic', 'Topic', 'topic', 'topic', 'system', 1, 1, 1);
    INSERT INTO cases (id, title, vignette_md, question_selection_mode, is_active, created_at, updated_at) VALUES ('case-a', 'Case A', '<script>Case A</script>', 'all', 1, 1, 1);
    INSERT INTO cases (id, title, vignette_md, question_selection_mode, is_active, created_at, updated_at) VALUES ('case-b', 'Case B', 'Full B vignette', 'all', 1, 1, 1);
    INSERT INTO cases (id, title, vignette_md, question_selection_mode, is_active, created_at, updated_at) VALUES ('case-old', 'Inactive B Case', 'Inactive context', 'all', 0, 1, 1);
    INSERT INTO case_concepts (case_id, concept_id, role, created_at) VALUES ('case-a', 'topic', 'primary', 1);
    INSERT INTO case_concepts (case_id, concept_id, role, created_at) VALUES ('case-b', 'topic', 'primary', 1);
    INSERT INTO case_concepts (case_id, concept_id, role, created_at) VALUES ('case-old', 'topic', 'primary', 1);
    INSERT INTO question_prompts (id, prompt_md, is_active, created_at, updated_at) VALUES ('prompt-shared', '<b>Prompt</b>', 1, 1, 1);
    INSERT INTO question_prompts (id, prompt_md, is_active, created_at, updated_at) VALUES ('prompt-b-only', 'B only prompt', 1, 1, 1);
    INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('case-q', 'case-b', 'prompt-shared', 'Case answer', 1, 1, 1);
    INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-b', 'case-b', 'B group', 0, 1, 1, 1);
    INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('group-q', 'group-b', 'prompt-b-only', 'Group answer', 1, 1, 1);
  `);
  insertAsset(sqlite, 'asset-a', { storageKey: 'teaching-images/asset-a.png', filename: 'A name' });
  insertAsset(sqlite, 'asset-b', { storageKey: 'teaching-images/asset-b.png', filename: 'B name' });
  insertAsset(sqlite, 'asset-unused', { storageKey: 'teaching-images/unused.png' });
  sqlite.exec(`
    INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES ('case-a', 'asset-a', 0, 'A caption', 1);
    INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES ('case-b', 'asset-b', 0, 'B caption', 1);
    INSERT INTO case_assets (case_id, asset_id, display_order, caption_md, created_at) VALUES ('case-old', 'asset-b', 0, 'Old caption', 1);
    INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES ('option-b', 'group-b', 'asset-b', 0, 'Option caption', 1, 0, 1);
    INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('option-q', 'option-b', 'prompt-shared', 'Option answer', 1, 1, 1);
    INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('aq-a', 'asset-a', 'prompt-shared', 'Reusable answer', 1, 1, 1);
    INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('aq-b', 'asset-b', 'prompt-shared', 'Reusable answer', 1, 1, 1);
    INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('aq-b-only', 'asset-b', 'prompt-b-only', 'B reusable answer', 1, 1, 1);
    INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES ('option-b', 'aq-b', 1);
    INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES ('option-b', 'aq-b-only', 1);
  `);
  storage.objects.set('teaching-images/asset-a.png', true);
  storage.objects.set('teaching-images/asset-b.png', true);
  return { sqlite, db, ...storage };
}

function insertLateBOption(sqlite) {
  sqlite.exec(`
    INSERT INTO cases (id, title, vignette_md, question_selection_mode, is_active, created_at, updated_at) VALUES ('case-b-late', 'Case B late', 'Late vignette', 'all', 1, 1, 1);
    INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-b-late', 'case-b-late', 'Late group', 0, 1, 1, 1);
    INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES ('option-b-late', 'group-b-late', 'asset-b', 0, 'Late option', 1, 0, 1);
  `);
}

function forceBToTombstone(sqlite, { moveQuestionId = null } = {}) {
  if (moveQuestionId) sqlite.prepare('UPDATE asset_questions SET asset_id = ? WHERE id = ?').run('asset-a', moveQuestionId);
  sqlite.prepare('UPDATE assets SET is_active = 0, deduplicated_into_asset_id = ? WHERE id = ?').run('asset-a', 'asset-b');
}

function insertExpiredActiveReview(sqlite, reviewId, userId) {
  sqlite.prepare('INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1, 1)').run(userId, userId, `${userId}@example.test`);
  sqlite.prepare(`
    INSERT INTO active_reviews (
      id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
      run_id, scope_fingerprint, scope_json, case_title_snapshot, vignette_snapshot_md,
      snapshot_version, started_at, expires_at
    ) VALUES (?, ?, 'case-b', 'system', 'free', 'original', NULL, ?, ?, ?, 'Case B', 'Expired snapshot', 1, 1, 2)
  `).run(
    reviewId,
    userId,
    `${reviewId}-run`,
    `${reviewId}-scope`,
    JSON.stringify({
      version: 2,
      systemId: 'system',
      runScope: { systems: [{ systemId: 'system', mode: 'routes', routes: [{ routeType: 'topic', routeId: 'topic' }] }] }
    })
  );
}

test('0028 is additive and existing Assets receive a NULL dedupe tombstone', () => {
  const sqlite = fixture();
  try {
    insertAsset(sqlite, 'existing');
    const column = sqlite.prepare("PRAGMA table_info('assets')").all().find((row) => row.name === 'deduplicated_into_asset_id');
    assert.equal(column.notnull, 0);
    assert.equal(sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('existing').deduplicated_into_asset_id, null);
    assert.ok(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'assets_deduplicated_into_idx'").get());
  } finally { sqlite.close(); }
});

test('database tombstone guards enforce inactive, immutable, non-self, non-tombstoned, non-chain state', () => {
  const sqlite = fixture();
  try {
    insertAsset(sqlite, 'survivor');
    insertAsset(sqlite, 'duplicate');
    insertAsset(sqlite, 'third');
    expectConstraint(() => sqlite.prepare('UPDATE assets SET deduplicated_into_asset_id = ?, is_active = 1 WHERE id = ?').run('survivor', 'duplicate'), /inactive/);
    expectConstraint(() => sqlite.prepare('UPDATE assets SET deduplicated_into_asset_id = ? WHERE id = ?').run('duplicate', 'duplicate'), /itself/);
    sqlite.prepare('UPDATE assets SET deduplicated_into_asset_id = ?, is_active = 0 WHERE id = ?').run('survivor', 'duplicate');
    expectConstraint(() => sqlite.prepare('UPDATE assets SET deduplicated_into_asset_id = NULL WHERE id = ?').run('duplicate'), /immutable/);
    expectConstraint(() => sqlite.prepare('UPDATE assets SET deduplicated_into_asset_id = ? WHERE id = ?').run('third', 'duplicate'), /immutable/);
    expectConstraint(() => sqlite.prepare('UPDATE assets SET is_active = 1 WHERE id = ?').run('duplicate'), /reactivated|deduplicated/);
    expectConstraint(() => sqlite.prepare('UPDATE assets SET deduplicated_into_asset_id = ? WHERE id = ?').run('third', 'survivor'), /incoming|source/);
    expectConstraint(() => sqlite.prepare('UPDATE assets SET deduplicated_into_asset_id = ?, is_active = 0 WHERE id = ?').run('third', 'survivor'), /incoming|source/);
    expectConstraint(() => sqlite.prepare('INSERT INTO assets (id, type, storage_key, mime_type, deduplicated_into_asset_id, is_active) VALUES (?, ?, ?, ?, ?, 0)').run('fourth', 'image', 'fourth.png', 'image/png', 'duplicate'), /tombstoned|target/);
  } finally { sqlite.close(); }
});

test('database reference guards reject reacquisition of a tombstoned Asset', () => {
  const sqlite = fixture();
  try {
    insertAsset(sqlite, 'survivor');
    insertAsset(sqlite, 'duplicate');
    sqlite.prepare('UPDATE assets SET deduplicated_into_asset_id = ?, is_active = 0 WHERE id = ?').run('survivor', 'duplicate');
    sqlite.exec('PRAGMA foreign_keys = OFF');
    sqlite.exec(`
      INSERT INTO case_assets (case_id, asset_id, display_order) VALUES ('case', 'survivor', 0);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order) VALUES ('option', 'group', 'survivor', 0);
      INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md) VALUES ('aq', 'survivor', 'prompt', 'answer');
      INSERT INTO active_review_assets (id, active_review_id, asset_id, display_order, storage_key_snapshot) VALUES ('review-asset', 'review', 'survivor', 0, 'other.png');
    `);
    const attempts = [
      'INSERT INTO case_assets (case_id, asset_id, display_order) VALUES (\'case\', \'duplicate\', 0)',
      'UPDATE case_assets SET asset_id = \'duplicate\' WHERE case_id = \'case\' AND asset_id = \'survivor\'',
      'INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order) VALUES (\'option\', \'group\', \'duplicate\', 0)',
      'UPDATE stimulus_group_options SET asset_id = \'duplicate\' WHERE id = \'option\'',
      'INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md) VALUES (\'aq\', \'duplicate\', \'prompt\', \'answer\')',
      'UPDATE asset_questions SET asset_id = \'duplicate\' WHERE id = \'aq\'',
      'INSERT INTO active_review_assets (id, active_review_id, asset_id, display_order, storage_key_snapshot) VALUES (\'review-asset\', \'review\', \'duplicate\', 0, \'other.png\')',
      'UPDATE active_review_assets SET asset_id = \'duplicate\' WHERE id = \'review-asset\'',
      'INSERT INTO assets (id, type, storage_key, mime_type, superseded_by_asset_id, is_active) VALUES (\'new\', \'image\', \'new.png\', \'image/png\', \'duplicate\', 0)',
      'UPDATE assets SET superseded_by_asset_id = \'duplicate\' WHERE id = \'survivor\''
    ];
    for (const statement of attempts) expectConstraint(() => sqlite.exec(statement));
    expectConstraint(() => sqlite.exec("INSERT INTO active_review_assets (id, active_review_id, asset_id, display_order, storage_key_snapshot) VALUES ('review-key', 'review', 'survivor', 0, 'teaching-images/duplicate.png')"), /storage key|deduplicated/);
  } finally { sqlite.close(); }
});

test('higher-resolution supersession of a survivor remains allowed while an incoming dedupe tombstone exists', () => {
  const sqlite = fixture();
  try {
    insertAsset(sqlite, 'survivor');
    insertAsset(sqlite, 'duplicate');
    insertAsset(sqlite, 'replacement');
    sqlite.prepare('UPDATE assets SET deduplicated_into_asset_id = ?, is_active = 0 WHERE id = ?').run('survivor', 'duplicate');
    sqlite.prepare('UPDATE assets SET is_active = 0, superseded_by_asset_id = ? WHERE id = ?').run('replacement', 'survivor');
    assert.deepEqual({ ...sqlite.prepare('SELECT is_active, superseded_by_asset_id, deduplicated_into_asset_id FROM assets WHERE id = ?').get('survivor') }, { is_active: 0, superseded_by_asset_id: 'replacement', deduplicated_into_asset_id: null });
    assert.equal(sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('duplicate').deduplicated_into_asset_id, 'survivor');
  } finally { sqlite.close(); }
});

test('merge plan exposes full retained certification context and deterministic fingerprint', async () => {
  const fx = domainFixture();
  try {
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.equal(plan.canMerge, true);
    assert.equal(plan.contexts.filter((context) => context.asset_id === 'asset-b').length, 3);
    const bFixed = plan.contexts.find((context) => context.asset_id === 'asset-b' && context.relationship === 'fixed');
    assert.equal(bFixed.case.vignetteMd, 'Full B vignette');
    assert.equal(bFixed.caseQuestions[0].promptMd, '<b>Prompt</b>');
    const bOption = plan.contexts.find((context) => context.asset_id === 'asset-b' && context.relationship === 'stimulus-option');
    assert.equal(bOption.group.questions[0].answer_md, 'Group answer');
    assert.equal(bOption.optionQuestions[0].answer_md, 'Option answer');
    assert.equal(plan.questionConflicts.find((conflict) => conflict.questionPromptId === 'prompt-shared').kind, 'same-answer');
    assert.equal(plan.mergePlanFingerprint.length, 64);
    fx.sqlite.prepare('UPDATE cases SET vignette_md = ? WHERE id = ?').run('Changed vignette', 'case-b');
    const changed = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.notEqual(changed.mergePlanFingerprint, plan.mergePlanFingerprint);
  } finally { fx.sqlite.close(); }
});

test('prospective Prompt conflicts include unrelated active Groups in a retained Case', async () => {
  const fx = domainFixture();
  try {
    fx.sqlite.prepare('UPDATE asset_questions SET is_active = 0 WHERE id = ?').run('aq-b');
    fx.sqlite.exec(`
      INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-other', 'case-b', 'Other group', 1, 1, 1, 1);
      INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('group-other-q', 'group-other', 'prompt-shared', 'Other group answer', 1, 1, 1);
    `);
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.equal(plan.canMerge, false);
    assert.ok(plan.prospectivePromptConflicts.some((conflict) => conflict.key === 'case-b:prompt-shared'));
    assert.ok(plan.blockers.some((blocker) => blocker.code === 'prospective-prompt-conflict'));
  } finally { fx.sqlite.close(); }
});

test('prospective Prompt conflicts include unrelated active Option Questions in a retained Case', async () => {
  const fx = domainFixture();
  try {
    fx.sqlite.exec(`
      UPDATE asset_questions SET is_active = 0 WHERE id = 'aq-b';
      UPDATE stimulus_option_questions SET is_active = 0 WHERE id = 'option-q';
      INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-other-option', 'case-b', 'Other option group', 1, 1, 1, 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES ('option-other', 'group-other-option', 'asset-unused', 0, 'Other option caption', 1, 0, 1);
      INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('option-other-q', 'option-other', 'prompt-shared', 'Other option answer', 1, 1, 1);
    `);
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.equal(plan.canMerge, false);
    assert.ok(plan.prospectivePromptConflicts.some((conflict) => conflict.key === 'case-b:prompt-shared'));
    assert.ok(plan.blockers.some((blocker) => blocker.code === 'prospective-prompt-conflict'));
  } finally { fx.sqlite.close(); }
});

test('prospective Prompt conflicts include unrelated active reusable Option opt-ins after an OR-active transition', async () => {
  const fx = domainFixture();
  try {
    fx.sqlite.exec(`
      UPDATE asset_questions SET is_active = 0 WHERE id = 'aq-a';
      DELETE FROM stimulus_option_asset_questions WHERE asset_question_id = 'aq-b';
      UPDATE stimulus_option_questions SET is_active = 0 WHERE id = 'option-q';
      INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('aq-x', 'asset-unused', 'prompt-shared', 'Unrelated reusable answer', 1, 1, 1);
      INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-a-reusable', 'case-a', 'A reusable group', 1, 1, 1, 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES ('option-a-reusable', 'group-a-reusable', 'asset-a', 0, 'A reusable option', 1, 0, 1);
      INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES ('option-a-reusable', 'aq-a', 1);
      INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-reusable-other', 'case-a', 'Other reusable group', 2, 1, 1, 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES ('option-reusable-other', 'group-reusable-other', 'asset-unused', 0, 'Other reusable option', 1, 0, 1);
      INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES ('option-reusable-other', 'aq-x', 1);
    `);
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.equal(plan.canMerge, false);
    assert.ok(plan.prospectivePromptConflicts.some((conflict) => conflict.key === 'case-a:prompt-shared'));
    assert.ok(plan.blockers.some((blocker) => blocker.code === 'prospective-prompt-conflict'));
  } finally { fx.sqlite.close(); }
});

test('prospective Prompt conflicts include live reusable Option opt-ins in an inactive retained Case', async () => {
  const fx = domainFixture();
  try {
    fx.sqlite.exec(`
      UPDATE cases SET is_active = 0 WHERE id = 'case-a';
      UPDATE asset_questions SET is_active = 0 WHERE id = 'aq-a';
      DELETE FROM stimulus_option_asset_questions WHERE asset_question_id = 'aq-b';
      UPDATE stimulus_option_questions SET is_active = 0 WHERE id = 'option-q';
      INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('aq-x-inactive-case', 'asset-unused', 'prompt-shared', 'Unrelated reusable answer', 1, 1, 1);
      INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-a-inactive-case', 'case-a', 'Inactive-case A group', 1, 1, 1, 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES ('option-a-inactive-case', 'group-a-inactive-case', 'asset-a', 0, 'Inactive-case A option', 1, 0, 1);
      INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES ('option-a-inactive-case', 'aq-a', 1);
      INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-other-inactive-case', 'case-a', 'Other inactive-case group', 2, 1, 1, 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES ('option-other-inactive-case', 'group-other-inactive-case', 'asset-unused', 0, 'Other inactive-case option', 1, 0, 1);
      INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES ('option-other-inactive-case', 'aq-x-inactive-case', 1);
    `);
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.equal(plan.canMerge, false);
    assert.ok(plan.prospectivePromptConflicts.some((conflict) => conflict.key === 'case-a:prompt-shared'));
    assert.ok(plan.blockers.some((blocker) => blocker.code === 'prospective-prompt-conflict'));
  } finally { fx.sqlite.close(); }
});

test('prospective Prompt conflicts include unrelated reusable opt-ins whose inactive Prompt is OR-revived by the merge', async () => {
  const fx = domainFixture();
  try {
    fx.sqlite.exec(`
      UPDATE question_prompts SET is_active = 0 WHERE id = 'prompt-shared';
      UPDATE asset_questions SET is_active = 0 WHERE id = 'aq-a';
      DELETE FROM stimulus_option_asset_questions WHERE asset_question_id = 'aq-b';
      UPDATE stimulus_option_questions SET is_active = 0 WHERE id = 'option-q';
      INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('aq-x', 'asset-unused', 'prompt-shared', 'Unrelated reusable answer', 1, 1, 1);
      INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-a-reusable', 'case-a', 'A reusable group', 1, 1, 1, 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES ('option-a-reusable', 'group-a-reusable', 'asset-a', 0, 'A reusable option', 1, 0, 1);
      INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES ('option-a-reusable', 'aq-a', 1);
      INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-reusable-other', 'case-a', 'Other reusable group', 2, 1, 1, 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES ('option-reusable-other', 'group-reusable-other', 'asset-unused', 0, 'Other reusable option', 1, 0, 1);
      INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id, created_at) VALUES ('option-reusable-other', 'aq-x', 1);
    `);
    // The D1 cross-group guard ignores `question_prompts.is_active`, so the merge
    // reactivates aq-a (OR-active) and re-inserts the opt-ins even though the
    // Prompt is inactive. Preflight must therefore flag the pair as blocked.
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.equal(plan.canMerge, false);
    assert.ok(plan.prospectivePromptConflicts.some((conflict) => conflict.key === 'case-a:prompt-shared'));
    assert.ok(plan.blockers.some((blocker) => blocker.code === 'prospective-prompt-conflict'));
    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationInputError && /cross-Stimulus-Group/.test(error.message)
    );
    assert.equal(fx.deleted.length, 0);
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM stimulus_group_options WHERE id = ?').get('option-b').asset_id, 'asset-b');
    assert.equal(fx.sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('asset-b').deduplicated_into_asset_id, null);
  } finally { fx.sqlite.close(); }
});

test('certified merge unions reusable questions, moves retained relationships, and cleans only duplicate media', async () => {
  const fx = domainFixture();
  try {
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    const planAgain = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.deepEqual(plan.fingerprintPayload, planAgain.fingerprintPayload);
    const result = await mergeDuplicateAssets({
      db: fx.db,
      bucket: fx.bucket,
      survivorAssetId: 'asset-a',
      duplicateAssetId: 'asset-b',
      mergePlanFingerprint: plan.mergePlanFingerprint,
      questionResolutions: {},
      certificationConfirmed: true
    });
    assert.equal(result.cleanup.status, 'cleaned');
    assert.deepEqual(fx.deleted, ['teaching-images/asset-b.png']);
    assert.equal(fx.objects.has('teaching-images/asset-a.png'), true);
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM assets WHERE id = ?').get('asset-b').count, 0);
    assert.deepEqual(
      fx.sqlite.prepare('SELECT case_id, asset_id, caption_md FROM case_assets WHERE asset_id = ? ORDER BY case_id').all('asset-a').map((row) => ({ ...row })),
      [
        { case_id: 'case-a', asset_id: 'asset-a', caption_md: 'A caption' },
        { case_id: 'case-b', asset_id: 'asset-a', caption_md: 'B caption' },
        { case_id: 'case-old', asset_id: 'asset-a', caption_md: 'Old caption' }
      ]
    );
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM stimulus_group_options WHERE id = ?').get('option-b').asset_id, 'asset-a');
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM asset_questions WHERE asset_id = ?').get('asset-b').count, 0);
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM asset_questions WHERE asset_id = ?').get('asset-a').count, 2);
    assert.deepEqual(fx.sqlite.prepare('SELECT asset_question_id FROM stimulus_option_asset_questions WHERE stimulus_group_option_id = ? ORDER BY asset_question_id').all('option-b').map((row) => row.asset_question_id), ['aq-a', 'aq-b-only']);
  } finally { fx.sqlite.close(); }
});

test('same-Prompt different-answer conflicts require one exact resolution and preserve OR-active state', async () => {
  const fx = domainFixture();
  try {
    fx.sqlite.prepare('UPDATE asset_questions SET answer_md = ?, is_active = 0 WHERE id = ?').run('Duplicate answer', 'aq-b');
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.equal(plan.canMerge, false);
    assert.deepEqual(plan.questionResolutionBlockers.map((blocker) => blocker.code), ['question-conflict:prompt-shared']);

    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, questionResolutions: {}, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationInputError && /exactly one current answer resolution/.test(error.message)
    );
    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, questionResolutions: { 'prompt-shared': 'survivor', extra: 'duplicate' }, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationInputError && /exactly one current answer resolution/.test(error.message)
    );

    const result = await mergeDuplicateAssets({
      db: fx.db,
      bucket: fx.bucket,
      survivorAssetId: 'asset-a',
      duplicateAssetId: 'asset-b',
      mergePlanFingerprint: plan.mergePlanFingerprint,
      questionResolutions: { 'prompt-shared': 'duplicate' },
      certificationConfirmed: true
    });
    assert.equal(result.cleanup.status, 'cleaned');
    const canonical = fx.sqlite.prepare('SELECT answer_md, is_active FROM asset_questions WHERE id = ?').get('aq-a');
    assert.deepEqual({ ...canonical }, { answer_md: 'Duplicate answer', is_active: 1 });
  } finally { fx.sqlite.close(); }
});

test('reusable-question answer equality normalizes CRLF and lone CR but preserves surrounding whitespace', async () => {
  const equalPairs = [
    ['Line one\r\nLine two', 'Line one\nLine two'],
    ['Line one\rLine two', 'Line one\nLine two'],
    ['  padded\r\nanswer  ', '  padded\nanswer  ']
  ];
  for (const [survivorAnswer, duplicateAnswer] of equalPairs) {
    const fx = domainFixture();
    try {
      fx.sqlite.prepare('UPDATE asset_questions SET answer_md = ? WHERE id = ?').run(survivorAnswer, 'aq-a');
      fx.sqlite.prepare('UPDATE asset_questions SET answer_md = ? WHERE id = ?').run(duplicateAnswer, 'aq-b');
      const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
      const conflict = plan.questionConflicts.find((row) => row.questionPromptId === 'prompt-shared');
      assert.equal(conflict.kind, 'same-answer', JSON.stringify([survivorAnswer, duplicateAnswer]));
      assert.equal(conflict.resolutionRequired, false);
      await mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true });
      assert.equal(fx.sqlite.prepare('SELECT answer_md FROM asset_questions WHERE id = ?').get('aq-a').answer_md, survivorAnswer);
    } finally { fx.sqlite.close(); }
  }
});

test('reusable-question answer equality keeps trimmed and newline-collapsed differences distinct', async () => {
  const differentPairs = [
    ['answer', ' answer '],
    ['answer', 'answer\n'],
    ['line one\nline two', 'line one line two'],
    ['line one\nline two', 'line one\n\nline two']
  ];
  for (const [survivorAnswer, duplicateAnswer] of differentPairs) {
    const fx = domainFixture();
    try {
      fx.sqlite.prepare('UPDATE asset_questions SET answer_md = ? WHERE id = ?').run(survivorAnswer, 'aq-a');
      fx.sqlite.prepare('UPDATE asset_questions SET answer_md = ? WHERE id = ?').run(duplicateAnswer, 'aq-b');
      const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
      const conflict = plan.questionConflicts.find((row) => row.questionPromptId === 'prompt-shared');
      assert.equal(conflict.kind, 'different-answer', JSON.stringify([survivorAnswer, duplicateAnswer]));
      assert.equal(conflict.resolutionRequired, true);
      await assert.rejects(
        () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, questionResolutions: {}, certificationConfirmed: true }),
        (error) => error instanceof AssetDeduplicationInputError && /exactly one current answer resolution/.test(error.message)
      );
      await mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, questionResolutions: { 'prompt-shared': 'survivor' }, certificationConfirmed: true });
      assert.equal(fx.sqlite.prepare('SELECT answer_md FROM asset_questions WHERE id = ?').get('aq-a').answer_md, survivorAnswer);
    } finally { fx.sqlite.close(); }
  }
});

test('stale exact-state equality aborts before canonicalization or R2 cleanup', async () => {
  let first = true;
  const fx = domainFixture({ beforeBatch(sqlite) {
    if (!first) return;
    first = false;
    sqlite.prepare('UPDATE cases SET vignette_md = ? WHERE id = ?').run('Changed before claim', 'case-b');
  } });
  try {
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationStaleError
    );
    assert.equal(fx.deleted.length, 0);
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM case_assets WHERE case_id = ?').get('case-b').asset_id, 'asset-b');
    assert.equal(fx.sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('asset-b').deduplicated_into_asset_id, null);
  } finally { fx.sqlite.close(); }
});

test('stale exact-state equality covers retained Stimulus Option group and removal state', async () => {
  const changes = [
    {
      label: 'removed state',
      mutate(sqlite) { sqlite.prepare('UPDATE stimulus_group_options SET removed_from_case = 1 WHERE id = ?').run('option-b'); }
    },
    {
      label: 'group identity',
      mutate(sqlite) {
        sqlite.exec("INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-b-alt', 'case-b', 'Alternate group', 1, 1, 1, 1)");
        sqlite.prepare('UPDATE stimulus_group_options SET stimulus_group_id = ? WHERE id = ?').run('group-b-alt', 'option-b');
      }
    },
    {
      label: 'new unrelated group',
      mutate(sqlite) {
        sqlite.exec("INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-b-new', 'case-b', 'New group', 2, 1, 1, 1)");
      }
    }
  ];
  for (const change of changes) {
    let beforeBatch = true;
    const fx = domainFixture({ beforeBatch(sqlite) {
      if (!beforeBatch) return;
      beforeBatch = false;
      change.mutate(sqlite);
    } });
    try {
      const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
      await assert.rejects(
        () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true }),
        (error) => error instanceof AssetDeduplicationStaleError,
        change.label
      );
      assert.equal(fx.deleted.length, 0);
    } finally { fx.sqlite.close(); }
  }
});

test('stale exact-state equality rejects a new B Stimulus Option in a new Case before any mutation', async () => {
  let first = true;
  const fx = domainFixture({ beforeBatch(sqlite) {
    if (!first) return;
    first = false;
    sqlite.exec(`
      INSERT INTO cases (id, title, vignette_md, question_selection_mode, is_active, created_at, updated_at) VALUES ('case-new', 'New Case', 'New vignette', 'all', 1, 1, 1);
      INSERT INTO stimulus_groups (id, case_id, name, display_order, is_active, created_at, updated_at) VALUES ('group-new', 'case-new', 'New group', 0, 1, 1, 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active, removed_from_case, created_at) VALUES ('option-new', 'group-new', 'asset-b', 0, 'New option', 1, 0, 1);
    `);
  } });
  try {
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationStaleError
    );
    assert.equal(fx.deleted.length, 0);
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM stimulus_group_options WHERE id = ?').get('option-new').asset_id, 'asset-b');
    assert.equal(fx.sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('asset-b').deduplicated_into_asset_id, null);
  } finally { fx.sqlite.close(); }
});

test('stale B Asset Question answer writes are rejected after B-only questions move to A', async () => {
  const fx = domainFixture();
  try {
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM asset_questions WHERE id = ?').get('aq-b-only').asset_id, 'asset-b');
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    await mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true });
    await assert.rejects(
      () => updateAssetQuestionAnswer(fx.db, { assetQuestionId: 'aq-b-only', answerMd: 'stale write', expectedAssetId: 'asset-b' }),
      (error) => error instanceof AssetQuestionInputError && /moved to another Asset/.test(error.message)
    );
    assert.equal(fx.sqlite.prepare('SELECT answer_md, asset_id FROM asset_questions WHERE id = ?').get('aq-b-only').answer_md, 'B reusable answer');
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM asset_questions WHERE id = ?').get('aq-b-only').asset_id, 'asset-a');
  } finally { fx.sqlite.close(); }
});

test('stale B Asset Question active-state writes are rejected after B-only questions move to A', async () => {
  const fx = domainFixture();
  try {
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM asset_questions WHERE id = ?').get('aq-b-only').asset_id, 'asset-b');
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    await mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true });
    await assert.rejects(
      () => setAssetQuestionActive(fx.db, { assetQuestionId: 'aq-b-only', isActive: false, expectedAssetId: 'asset-b' }),
      (error) => error instanceof AssetQuestionInputError && /moved to another Asset/.test(error.message)
    );
    assert.equal(fx.sqlite.prepare('SELECT is_active, asset_id FROM asset_questions WHERE id = ?').get('aq-b-only').is_active, 1);
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM asset_questions WHERE id = ?').get('aq-b-only').asset_id, 'asset-a');
  } finally { fx.sqlite.close(); }
});

test('stale B stimulus-option opt-in is rejected after the option and B-only question move to A', async () => {
  const fx = domainFixture();
  try {
    insertLateBOption(fx.sqlite);
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM stimulus_group_options WHERE id = ?').get('option-b-late').asset_id, 'asset-b');
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM asset_questions WHERE id = ?').get('aq-b-only').asset_id, 'asset-b');
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    await mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true });
    await assert.rejects(
      () => optInAssetQuestion(fx.db, { caseId: 'case-b-late', optionId: 'option-b-late', assetQuestionId: 'aq-b-only', expectedAssetId: 'asset-b' }),
      (error) => error instanceof AssetQuestionInputError && /moved to another Asset/.test(error.message)
    );
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM stimulus_option_asset_questions WHERE stimulus_group_option_id = ? AND asset_question_id = ?').get('option-b-late', 'aq-b-only').count, 0);
  } finally { fx.sqlite.close(); }
});

test('stale exact-state equality rejects a new A Asset Question before any mutation', async () => {
  let first = true;
  const fx = domainFixture({ beforeBatch(sqlite) {
    if (!first) return;
    first = false;
    sqlite.exec(`
      INSERT INTO question_prompts (id, prompt_md, is_active, created_at, updated_at) VALUES ('prompt-a-late', 'Late A prompt', 1, 1, 1);
      INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active, created_at, updated_at) VALUES ('aq-a-late', 'asset-a', 'prompt-a-late', 'Late A answer', 1, 1, 1);
    `);
  } });
  try {
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationStaleError
    );
    assert.equal(fx.deleted.length, 0);
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM asset_questions WHERE id = ?').get('aq-a-late').asset_id, 'asset-a');
    assert.equal(fx.sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('asset-b').deduplicated_into_asset_id, null);
  } finally { fx.sqlite.close(); }
});

test('stale B opt-in removal cannot delete the canonical A opt-in after the merge interleaves', async () => {
  let triggered = false;
  const fx = domainFixture({ beforeStatement(statement, sqlite) {
    if (triggered || !/delete[\s\S]*stimulus_option_asset_questions/i.test(statement)) return;
    triggered = true;
    sqlite.prepare('DELETE FROM stimulus_option_asset_questions WHERE asset_question_id = ?').run('aq-b');
    sqlite.prepare('UPDATE asset_questions SET asset_id = ? WHERE id = ?').run('asset-a', 'aq-b-only');
    sqlite.prepare('UPDATE stimulus_group_options SET asset_id = ? WHERE id = ?').run('asset-a', 'option-b');
    forceBToTombstone(sqlite);
  } });
  try {
    const removal = removeAssetQuestionOptIn(fx.db, { optionId: 'option-b', assetQuestionId: 'aq-b-only', assetId: 'asset-b' });
    await assert.rejects(removal, (error) => error instanceof AssetQuestionInputError && /moved to another Asset/.test(error.message));
    assert.equal(triggered, true);
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM stimulus_option_asset_questions WHERE stimulus_group_option_id = ? AND asset_question_id = ?').get('option-b', 'aq-b-only').count, 1);
    assert.equal(fx.sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('asset-b').deduplicated_into_asset_id, 'asset-a');
  } finally { fx.sqlite.close(); }
});

test('stale B Asset Question creation does not leave a new Prompt after source invalidation', async () => {
  let first = true;
  const fx = domainFixture({ beforeBatch(sqlite) {
    if (!first) return;
    first = false;
    forceBToTombstone(sqlite);
  } });
  try {
    await assert.rejects(
      () => createAssetQuestion(fx.db, { assetId: 'asset-b', promptMd: 'Late stale prompt', answerMd: 'Late stale answer' }),
      (error) => error instanceof AssetQuestionInputError && /Asset changed/.test(error.message)
    );
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM question_prompts WHERE prompt_md = ?').get('Late stale prompt').count, 0);
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM asset_questions WHERE asset_id = ? AND answer_md = ?').get('asset-b', 'Late stale answer').count, 0);
    assert.equal(fx.sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('asset-b').deduplicated_into_asset_id, 'asset-a');
  } finally { fx.sqlite.close(); }
});

test('stale B Asset Question creation maps a fully deleted source Asset to the controlled Asset-changed error', async () => {
  let first = true;
  const fx = domainFixture({ beforeBatch(sqlite) {
    if (!first) return;
    first = false;
    sqlite.exec(`
      DELETE FROM stimulus_option_asset_questions WHERE stimulus_group_option_id = 'option-b' OR asset_question_id IN (SELECT id FROM asset_questions WHERE asset_id = 'asset-b');
      DELETE FROM stimulus_option_questions WHERE stimulus_group_option_id = 'option-b';
      DELETE FROM asset_questions WHERE asset_id = 'asset-b';
      DELETE FROM stimulus_group_options WHERE asset_id = 'asset-b';
      DELETE FROM case_assets WHERE asset_id = 'asset-b';
      DELETE FROM assets WHERE id = 'asset-b';
    `);
  } });
  try {
    await assert.rejects(
      () => createAssetQuestion(fx.db, { assetId: 'asset-b', promptMd: 'Deleted source prompt', answerMd: 'Deleted source answer' }),
      (error) => error instanceof AssetQuestionInputError && /Asset changed/.test(error.message)
    );
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM question_prompts WHERE prompt_md = ?').get('Deleted source prompt').count, 0);
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM asset_questions WHERE answer_md = ?').get('Deleted source answer').count, 0);
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM assets WHERE id = ?').get('asset-b').count, 0);
  } finally { fx.sqlite.close(); }
});

test('fixed-image reusable conversion maps a mid-batch source tombstone to a controlled error and rolls back', async () => {
  const fx = domainFixture({ beforeBatch(sqlite) {
    sqlite.prepare('UPDATE assets SET is_active = 0, deduplicated_into_asset_id = ? WHERE id = ?').run('asset-unused', 'asset-a');
  } });
  try {
    await assert.rejects(
      () => optInFixedAssetQuestion(fx.db, { caseId: 'case-a', assetId: 'asset-a', assetQuestionId: 'aq-a' }),
      (error) => error instanceof AssetQuestionInputError && /Asset changed/.test(error.message)
    );
    assert.equal(Number(fx.sqlite.prepare("SELECT count(*) AS count FROM stimulus_groups WHERE case_id = 'case-a'").get().count), 0);
    assert.equal(Number(fx.sqlite.prepare("SELECT count(*) AS count FROM stimulus_group_options WHERE asset_id = ?").get('asset-a').count), 0);
    assert.ok(fx.sqlite.prepare("SELECT 1 FROM case_assets WHERE case_id = 'case-a' AND asset_id = 'asset-a'").get());
    assert.ok(fx.sqlite.prepare('SELECT 1 FROM asset_questions WHERE id = ?').get('aq-a'));
  } finally { fx.sqlite.close(); }
});

test('fixed-image reusable conversion maps a mid-batch source deletion to a controlled error and rolls back the group', async () => {
  const fx = domainFixture({ beforeBatch(sqlite) {
    sqlite.prepare('DELETE FROM stimulus_option_asset_questions WHERE asset_question_id IN (SELECT id FROM asset_questions WHERE asset_id = ?)').run('asset-a');
    sqlite.prepare('DELETE FROM asset_questions WHERE asset_id = ?').run('asset-a');
    sqlite.prepare('DELETE FROM case_assets WHERE asset_id = ?').run('asset-a');
    sqlite.prepare('DELETE FROM assets WHERE id = ?').run('asset-a');
  } });
  try {
    await assert.rejects(
      () => optInFixedAssetQuestion(fx.db, { caseId: 'case-a', assetId: 'asset-a', assetQuestionId: 'aq-a' }),
      (error) => error instanceof AssetQuestionInputError && /Asset changed/.test(error.message)
    );
    assert.equal(Number(fx.sqlite.prepare("SELECT count(*) AS count FROM stimulus_groups WHERE case_id = 'case-a'").get().count), 0);
    assert.equal(Number(fx.sqlite.prepare("SELECT count(*) AS count FROM stimulus_group_options WHERE asset_id = ?").get('asset-a').count), 0);
    assert.equal(Number(fx.sqlite.prepare("SELECT count(*) AS count FROM assets WHERE id = ?").get('asset-a').count), 0);
    assert.equal(Number(fx.sqlite.prepare("SELECT count(*) AS count FROM case_assets WHERE asset_id = ?").get('asset-a').count), 0);
  } finally { fx.sqlite.close(); }
});

test('stale B Asset Question creation cannot reactivate an inactive question after it moves to A', async () => {
  let first = true;
  const fx = domainFixture({ beforeBatch(sqlite) {
    if (!first) return;
    first = false;
    sqlite.prepare('DELETE FROM stimulus_option_asset_questions WHERE asset_question_id = ?').run('aq-b');
    forceBToTombstone(sqlite, { moveQuestionId: 'aq-b-only' });
  } });
  try {
    fx.sqlite.prepare('UPDATE asset_questions SET is_active = 0 WHERE id = ?').run('aq-b-only');
    await assert.rejects(
      () => createAssetQuestion(fx.db, { assetId: 'asset-b', promptMd: 'B only prompt', answerMd: 'B reusable answer' }),
      (error) => error instanceof AssetQuestionInputError && /Asset changed/.test(error.message)
    );
    assert.deepEqual(
      { asset_id: fx.sqlite.prepare('SELECT asset_id FROM asset_questions WHERE id = ?').get('aq-b-only').asset_id, is_active: fx.sqlite.prepare('SELECT is_active FROM asset_questions WHERE id = ?').get('aq-b-only').is_active },
      { asset_id: 'asset-a', is_active: 0 }
    );
  } finally { fx.sqlite.close(); }
});

test('Asset Question creation preserves inactive and superseded production-image authoring semantics', async () => {
  for (const state of ['inactive', 'superseded']) {
    const fx = domainFixture();
    try {
      if (state === 'inactive') fx.sqlite.prepare('UPDATE assets SET is_active = 0 WHERE id = ?').run('asset-unused');
      else fx.sqlite.prepare('UPDATE assets SET superseded_by_asset_id = ? WHERE id = ?').run('asset-a', 'asset-unused');
      const questionId = await createAssetQuestion(fx.db, { assetId: 'asset-unused', promptMd: `${state} production prompt`, answerMd: `${state} production answer` });
      assert.equal(fx.sqlite.prepare('SELECT asset_id FROM asset_questions WHERE id = ?').get(questionId).asset_id, 'asset-unused');
      assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM question_prompts WHERE prompt_md = ?').get(`${state} production prompt`).count, 1);
    } finally { fx.sqlite.close(); }
  }
});

test('renaming an Image Collection after recompute stale-aborts the certified merge', async () => {
  let first = true;
  const fx = domainFixture({ beforeBatch(sqlite) {
    if (!first) return;
    first = false;
    sqlite.prepare('UPDATE image_collections SET name = ? WHERE id = ?').run('Renamed Collection', 'collection-a');
  } });
  try {
    fx.sqlite.exec("INSERT INTO image_collections (id, name, created_at, updated_at) VALUES ('collection-a', 'Original Collection', 1, 1)");
    fx.sqlite.prepare('UPDATE assets SET image_collection_id = ? WHERE id = ?').run('collection-a', 'asset-a');
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.equal(plan.survivor.image_collection_id, 'collection-a');
    assert.equal(plan.survivor.image_collection_name, 'Original Collection');
    assert.deepEqual(plan.fingerprintPayload.imageCollections.map((row) => ({ id: row.id, name: row.name })), [{ id: 'collection-a', name: 'Original Collection' }]);
    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationStaleError
    );
    assert.equal(fx.deleted.length, 0);
    assert.equal(fx.sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('asset-b').deduplicated_into_asset_id, null);
  } finally { fx.sqlite.close(); }
});

test('Phase 1 reasserts the global legacy Review zero sentinel before canonicalization', async () => {
  let first = true;
  const fx = domainFixture({ beforeBatch(sqlite) {
    if (!first) return;
    first = false;
    sqlite.prepare(`
      INSERT INTO reviews (id, user_id, case_id, primary_concept_id, case_title_snapshot, vignette_snapshot_md, status)
      VALUES ('late-legacy-review', 'legacy-user', 'case-b', 'topic', 'Case B', 'Late legacy snapshot', 'started')
    `).run();
  } });
  try {
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationStaleError
    );
    assert.equal(fx.deleted.length, 0);
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM case_assets WHERE case_id = ?').get('case-b').asset_id, 'asset-b');
    assert.equal(fx.sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('asset-b').deduplicated_into_asset_id, null);
  } finally { fx.sqlite.close(); }
});

test('Phase 1 treats an unreadable legacy Review sentinel as stale before mutation', async () => {
  let first = true;
  const fx = domainFixture({ beforeBatch(sqlite) {
    if (!first) return;
    first = false;
    sqlite.exec('DROP TABLE review_assets');
  } });
  try {
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationStaleError
    );
    assert.equal(fx.deleted.length, 0);
    assert.equal(fx.sqlite.prepare('SELECT asset_id FROM case_assets WHERE case_id = ?').get('case-b').asset_id, 'asset-b');
    assert.equal(fx.sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('asset-b').deduplicated_into_asset_id, null);
  } finally { fx.sqlite.close(); }
});

test('R2 cleanup failure leaves a durable tombstone and retry is idempotent', async () => {
  const fx = domainFixture({ deleteError: true });
  try {
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    const result = await mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true });
    assert.equal(result.cleanup.status, 'pending');
    const pending = await listPendingDuplicateCleanup(fx.db, fx.bucket);
    assert.equal(pending[0].reason, 'r2-delete-pending');
    assert.equal(fx.sqlite.prepare('SELECT is_active, deduplicated_into_asset_id FROM assets WHERE id = ?').get('asset-b').deduplicated_into_asset_id, 'asset-a');
    assert.equal(fx.objects.has('teaching-images/asset-b.png'), true);
  } finally { fx.sqlite.close(); }
});

test('expired but physically retained Active Review references still block deduplication', async () => {
  const fx = domainFixture();
  try {
    fx.sqlite.prepare(`
      INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('expired-learner', 'Expired learner', 'expired@example.test', 1, 1, 1);
    `).run();
    fx.sqlite.prepare(`
      INSERT INTO active_reviews (
        id, user_id, case_id, system_id, study_mode, content_mode, queue_class,
        run_id, scope_fingerprint, scope_json, case_title_snapshot, vignette_snapshot_md,
        snapshot_version, started_at, expires_at
      ) VALUES (
        'expired-review', 'expired-learner', 'case-b', 'system', 'free', 'original', NULL,
        'expired-run', 'expired-scope', ?, 'Case B', 'Expired snapshot', 1, 1, 2
      );
    `).run(JSON.stringify({
      version: 2,
      systemId: 'system',
      runScope: { systems: [{ systemId: 'system', mode: 'routes', routes: [{ routeType: 'topic', routeId: 'topic' }] }] }
    }));
    fx.sqlite.exec(`
      INSERT INTO active_review_assets (id, active_review_id, asset_id, display_order, storage_key_snapshot)
      VALUES ('expired-review-asset', 'expired-review', 'asset-b', 0, 'teaching-images/asset-b.png');
    `);
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.equal(plan.activeReviewAssets[0].expires_at, 2);
    assert.ok(plan.blockers.some((blocker) => blocker.code === 'active-review-reference'));
    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationInputError && /Review snapshot reference/.test(error.message)
    );
    assert.equal(fx.deleted.length, 0);
  } finally { fx.sqlite.close(); }
});

test('expired storage-key-only Active Review retention blocks deduplication independently of asset ownership', async () => {
  const fx = domainFixture();
  try {
    insertExpiredActiveReview(fx.sqlite, 'expired-key-review', 'expired-key-learner');
    fx.sqlite.exec(`
      INSERT INTO active_review_assets (id, active_review_id, asset_id, display_order, storage_key_snapshot)
      VALUES ('expired-key-review-asset', 'expired-key-review', 'asset-a', 0, 'teaching-images/asset-b.png');
    `);
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.equal(plan.activeReviewAssets.length, 1);
    assert.equal(plan.activeReviewAssets[0].asset_id, 'asset-a');
    assert.equal(plan.activeReviewAssets[0].storage_key_snapshot, 'teaching-images/asset-b.png');
    assert.equal(plan.activeReviewAssets[0].expires_at, 2);
    assert.ok(plan.blockers.some((blocker) => blocker.code === 'active-review-reference'));
    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationInputError && /Review snapshot reference/.test(error.message)
    );
    assert.equal(fx.deleted.length, 0);
  } finally { fx.sqlite.close(); }
});

test('expired Active Review Asset Question provenance blocks deduplication independently', async () => {
  const fx = domainFixture();
  try {
    insertExpiredActiveReview(fx.sqlite, 'expired-question-review', 'expired-question-learner');
    fx.sqlite.exec(`
      INSERT INTO active_review_questions (
        id, active_review_id, question_prompt_id, source_type, source_asset_question_id,
        display_order, prompt_snapshot_md, answer_snapshot_md
      ) VALUES ('expired-question', 'expired-question-review', 'prompt-b-only', 'asset', 'aq-b-only', 0, 'B only prompt', 'B reusable answer');
    `);
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    assert.equal(plan.activeReviewQuestions.length, 1);
    assert.equal(plan.activeReviewQuestions[0].asset_id, 'asset-b');
    assert.equal(plan.activeReviewQuestions[0].expires_at, 2);
    assert.ok(plan.blockers.some((blocker) => blocker.code === 'active-review-reference'));
    await assert.rejects(
      () => mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true }),
      (error) => error instanceof AssetDeduplicationInputError && /Review snapshot reference/.test(error.message)
    );
    assert.equal(fx.deleted.length, 0);
  } finally { fx.sqlite.close(); }
});

test('multiple cleanup-pending duplicates may point to one survivor while the survivor remains a blocked source', async () => {
  const fx = domainFixture({ deleteError: true });
  fx.objects.set('teaching-images/unused.png', true);
  insertAsset(fx.sqlite, 'asset-c', { storageKey: 'teaching-images/asset-c.png' });
  fx.objects.set('teaching-images/asset-c.png', true);
  try {
    const firstPlan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    const first = await mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: firstPlan.mergePlanFingerprint, certificationConfirmed: true });
    assert.equal(first.cleanup.status, 'pending');

    const secondPlan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-unused' });
    assert.equal(secondPlan.canMerge, true);
    const second = await mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-unused', mergePlanFingerprint: secondPlan.mergePlanFingerprint, certificationConfirmed: true });
    assert.equal(second.cleanup.status, 'pending');
    assert.deepEqual(
      fx.sqlite.prepare('SELECT id, deduplicated_into_asset_id FROM assets WHERE deduplicated_into_asset_id = ? ORDER BY id').all('asset-a').map((row) => ({ ...row })),
      [{ id: 'asset-b', deduplicated_into_asset_id: 'asset-a' }, { id: 'asset-unused', deduplicated_into_asset_id: 'asset-a' }]
    );

    const sourcePlan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-c', duplicateAssetId: 'asset-a' });
    assert.equal(sourcePlan.canMerge, false);
    assert.ok(sourcePlan.blockers.some((blocker) => blocker.code === 'duplicate-incoming-dedupe'));
  } finally { fx.sqlite.close(); }
});

test('stale Active Review persistence maps a dedupe race to content-unavailable', async () => {
  let triggered = false;
  const fx = domainFixture({ beforeBatch(sqlite, statements) {
    if (triggered || !statements.some((statement) => String(statement.statement ?? '').includes('INSERT INTO active_reviews'))) return;
    triggered = true;
    sqlite.prepare('UPDATE assets SET is_active = 0, deduplicated_into_asset_id = ? WHERE id = ?').run('asset-a', 'asset-b');
  } });
  try {
    fx.sqlite.exec(`
      INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES ('study-learner', 'Study learner', 'study@example.test', 1, 1, 1);
    `);
    await assert.rejects(
      () => createFreeActiveReview({
        db: fx.db,
        userId: 'study-learner',
        caseId: 'case-b',
        runScope: { systems: [{ systemId: 'system', mode: 'routes', routes: [{ routeType: 'topic', routeId: 'topic' }] }] },
        rng: () => 0
      }),
      (error) => error instanceof ActiveReviewError && error.code === 'content-unavailable'
    );
    assert.equal(fx.sqlite.prepare('SELECT count(*) AS count FROM active_reviews').get().count, 0);
  } finally { fx.sqlite.close(); }
});

test('cleanup rechecks the exact survivor object before deleting duplicate media', async () => {
  const fx = domainFixture({ deleteError: true });
  try {
    const plan = await getDuplicateAssetMergePlan({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b' });
    const claimOnly = await mergeDuplicateAssets({ db: fx.db, bucket: fx.bucket, survivorAssetId: 'asset-a', duplicateAssetId: 'asset-b', mergePlanFingerprint: plan.mergePlanFingerprint, certificationConfirmed: true });
    assert.equal(claimOnly.cleanup.status, 'pending');
    const deletedBeforeRetry = [...fx.deleted];
    fx.objects.delete('teaching-images/asset-a.png');
    const retry = await cleanupDuplicateAsset({ db: fx.db, bucket: fx.bucket, duplicateAssetId: 'asset-b' });
    assert.deepEqual(retry, { status: 'blocked', reason: 'canonical-survivor-media-missing' });
    assert.deepEqual(fx.deleted, deletedBeforeRetry);
    assert.equal(fx.objects.has('teaching-images/asset-b.png'), true);
    assert.equal(fx.sqlite.prepare('SELECT deduplicated_into_asset_id FROM assets WHERE id = ?').get('asset-b').deduplicated_into_asset_id, 'asset-a');
  } finally { fx.sqlite.close(); }
});

test('normal inactive Assets cannot use dedupe cleanup retry', async () => {
  const fx = domainFixture();
  try {
    fx.sqlite.prepare('UPDATE assets SET is_active = 0 WHERE id = ?').run('asset-b');
    await assert.rejects(() => cleanupDuplicateAsset({ db: fx.db, bucket: fx.bucket, duplicateAssetId: 'asset-b' }), (error) => error instanceof AssetDeduplicationInputError && /tombstone/i.test(error.message));
  } finally { fx.sqlite.close(); }
});

test('Admin certification evidence renders persisted text and permits required answer resolutions', async () => {
  const source = readFileSync(new URL('../src/routes/admin/images/deduplicate/+page.svelte', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../src/routes/admin/images/deduplicate/+page.server.js', import.meta.url), 'utf8');
  const detailServer = readFileSync(new URL('../src/routes/admin/images/[assetId]/+page.server.js', import.meta.url), 'utf8');
  const library = readFileSync(new URL('../src/lib/components/AdminImageLibrary.svelte', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\{@html/);
  assert.match(source, /displayAsset\(plan\.survivor/);
  assert.match(source, /<pre>\{context\.case\?\.vignetteMd \?\? ''\}<\/pre>/);
  assert.match(source, /<pre>\{question\.answer_md\}<\/pre>/);
  assert.match(source, /Prompt ID \{question\.question_prompt_id\}/);
  assert.match(source, /Group Question \{question\.id\}/);
  assert.match(source, /Option Question \{question\.id\}/);
  assert.match(source, /Retained inactive Stimulus Group/);
  assert.match(source, /Retained inactive Stimulus Option/);
  assert.match(source, /Retained removed-from-Case Stimulus Option/);
  assert.match(source, /asset\.image_collection_name/);
  assert.match(source, /naturalWidth/);
  assert.match(source, /context\.primaryTopic\.id/);
  assert.match(source, /item\.id\}\)/);
  assert.match(source, /white-space:pre-wrap/);
  assert.match(source, /I certify that the selected survivor is clinically and educationally interchangeable/);
  assert.match(server, /let result;/);
  assert.match(detailServer, /expectedAssetId: params\.assetId/);
  assert.ok(server.indexOf('redirect(303') > server.indexOf('} catch (error) {'));
  assert.match(library, /cleanupReasonLabel/);
  assert.match(library, /item\.reason/);
  assert.match(library, /let canCompareSelected = \$derived/);
  assert.match(library, /asset\.type === 'image'/);
  assert.match(library, /!asset\.supersededByAssetId/);
  assert.match(library, /!asset\.deduplicatedIntoAssetId/);

  const compiled = compile(source, { filename: 'AdminImageDeduplicationPage.svelte', generate: 'server' });
  const directory = mkdtempSync(join(process.cwd(), '.tmp-admin-dedupe-page-'));
  const modulePath = join(directory, 'AdminImageDeduplicationPage.mjs');
  writeFileSync(modulePath, compiled.js.code, 'utf8');
  try {
    const component = (await import(`${pathToFileURL(modulePath).href}?test=${Date.now()}`)).default;
    const hostile = '<script>alert(1)</script> persisted vignette';
    const html = render(component, {
      props: {
        data: {
          error: null,
          plan: {
            blockers: [],
            questionResolutionBlockers: [{ code: 'question-conflict:prompt', message: 'Choose one answer.' }],
            survivorAssetId: 'asset-a',
            duplicateAssetId: 'asset-b',
            mergePlanFingerprint: 'fingerprint',
            survivor: { id: 'asset-a', original_filename: 'A', alt_text: null, source_label: null, source_url: null, licence: null, image_collection_id: 'collection-a', image_collection_name: 'Collection A', mime_type: 'image/png', storage_key: 'a.png', is_active: true, preview_session_id: null, superseded_by_asset_id: null, deduplicated_into_asset_id: null, imageUrl: null },
            duplicate: { id: 'asset-b', original_filename: 'B', alt_text: null, source_label: null, source_url: null, licence: null, image_collection_id: null, mime_type: 'image/png', storage_key: 'b.png', is_active: true, preview_session_id: null, superseded_by_asset_id: null, deduplicated_into_asset_id: null, imageUrl: null },
            contexts: [
              { relationship: 'fixed', id: 'case-asset', display_order: 0, caption_md: '', case: { id: 'case-b', title: 'Case B', vignetteMd: hostile, isActive: true, previewSessionId: null }, primaryTopic: null, taxonomyPath: [], systemAncestry: [], caseQuestions: [] },
              {
                relationship: 'stimulus-option', id: 'option-id', stimulus_group_id: 'group-id', display_order: 1, created_at: 1, caption_md: 'Option caption', is_active: true, removed_from_case: false,
                case: { id: 'case-c', title: 'Case C', vignetteMd: 'Stimulus vignette', isActive: true, previewSessionId: null },
                primaryTopic: { id: 'topic-id', name: 'Topic' }, systemAncestry: [{ id: 'system-id', name: 'System' }],
                group: { id: 'group-id', name: 'Group', is_active: true, questions: [{ id: 'group-question-id', question_prompt_id: 'group-prompt-id', promptMd: 'Group prompt', is_active: true, answer_md: 'Group answer' }] },
                optionQuestions: [{ id: 'option-question-id', question_prompt_id: 'option-prompt-id', promptMd: 'Option prompt', is_active: true, answer_md: 'Option answer' }],
                caseQuestions: []
              },
              { relationship: 'stimulus-option', id: 'inactive-group-option', stimulus_group_id: 'inactive-group', display_order: 2, created_at: 1, caption_md: '', is_active: true, removed_from_case: false, case: { id: 'case-inactive-group', title: 'Inactive group case', vignetteMd: '', isActive: true, previewSessionId: null }, primaryTopic: null, systemAncestry: [], group: { id: 'inactive-group', name: 'Inactive group', is_active: false, questions: [] }, optionQuestions: [], caseQuestions: [] },
              { relationship: 'stimulus-option', id: 'inactive-option', stimulus_group_id: 'active-group', display_order: 3, created_at: 1, caption_md: '', is_active: false, removed_from_case: false, case: { id: 'case-inactive-option', title: 'Inactive option case', vignetteMd: '', isActive: true, previewSessionId: null }, primaryTopic: null, systemAncestry: [], group: { id: 'active-group', name: 'Active group', is_active: true, questions: [] }, optionQuestions: [], caseQuestions: [] },
              { relationship: 'stimulus-option', id: 'removed-option', stimulus_group_id: 'active-group', display_order: 4, created_at: 1, caption_md: '', is_active: true, removed_from_case: true, case: { id: 'case-removed-option', title: 'Removed option case', vignetteMd: '', isActive: true, previewSessionId: null }, primaryTopic: null, systemAncestry: [], group: { id: 'active-group', name: 'Active group', is_active: true, questions: [] }, optionQuestions: [], caseQuestions: [] }
            ],
            reusableQuestions: [{ asset_id: 'asset-a', id: 'aq-a', question_prompt_id: 'reusable-prompt-id', prompt_md: 'Reusable prompt', answer_md: 'Reusable answer', is_active: true, optIns: [] }],
            questionConflicts: [{ questionPromptId: 'prompt', promptMd: 'Prompt', resolutionRequired: true, survivor: { answer_md: 'Survivor answer' }, duplicate: { answer_md: 'Duplicate answer' } }]
          }
        },
        form: null
      }
    }).html;
    assert.match(html, /&lt;script>alert\(1\)&lt;\/script>/);
    assert.doesNotMatch(html, /<script\b/i);
    assert.match(html, /Primary Topic:/);
    assert.match(html, /collection-a · Collection A/);
    assert.match(html, /Topic \(ID topic-id\)/);
    assert.match(html, /System ancestry:/);
    assert.match(html, /System \(ID system-id\)/);
    assert.match(html, /Group Question group-question-id/);
    assert.match(html, /Option Question option-question-id/);
    assert.match(html, /Retained inactive Stimulus Group/);
    assert.match(html, /Retained inactive Stimulus Option/);
    assert.match(html, /Retained removed-from-Case Stimulus Option/);
    assert.match(html, /Prompt ID reusable-prompt-id: Reusable prompt/);
    assert.match(html, /type="radio"[^>]+required/);
    assert.match(html, /name="certification_confirmed"[^>]+required/);
    assert.doesNotMatch(html, /name="certification_confirmed"[^>]+disabled/);
    assert.match(html, /<button class="button primary[^"]*" type="submit">Certify and merge<\/button>/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
