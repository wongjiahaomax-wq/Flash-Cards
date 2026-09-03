// Focused characterization coverage for Preview workspace lifecycle and ownership foundations.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import * as previewWorkspace from './preview-workspace-test-adapter.js';
import { PreviewWorkspaceError as InternalPreviewWorkspaceError } from '../src/lib/server/db/preview-workspace/errors.js';
import { requiredText } from '../src/lib/server/db/preview-workspace/input.js';
import {
  requireOwnedPreviewGroup,
  requireOwnedPreviewOption,
  requireOwnedPreviewPrompt,
  requireOwnedSession,
  requirePreviewUsableAsset
} from '../src/lib/server/db/preview-workspace/ownership.js';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

const migrationSql = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql',
  '0011_asset_supersession.sql',
  '0012_archive_stimulus_options.sql'
]
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function createD1(sqlite) {
  return {
    prepare(sql) {
      return {
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
                meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
              };
            }
          };
        }
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    }
  };
}

class TestBucket {
  constructor() {
    this.deleted = [];
    this.failNextDelete = false;
  }

  async delete(key) {
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw new Error('simulated R2 delete failure');
    }
    this.deleted.push(key);
  }
}

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  const d1 = createD1(sqlite);
  const db = /** @type {LearningDb} */ (createDb(/** @type {any} */ (d1)));
  return { sqlite, db, bucket: new TestBucket() };
}

function seedOwnershipFixture(sqlite) {
  sqlite.exec(`
    INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES
      ('preview-a', 'owner-a', 'active', 2000000000000),
      ('preview-b', 'owner-b', 'active', 2000000000000);

    INSERT INTO cases (id, title, question_selection_mode, is_active, preview_session_id) VALUES
      ('case-production', 'Production Case', 'automatic', 1, NULL),
      ('case-preview-a', 'Preview A Case', 'automatic', 1, 'preview-a'),
      ('case-preview-b', 'Preview B Case', 'automatic', 1, 'preview-b');

    INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active, preview_session_id) VALUES
      ('asset-production', 'image', 'teaching-images/production.png', 'image/png', 'production.png', 'Production image', 1, NULL),
      ('asset-preview-a', 'image', 'preview/preview-a/current.png', 'image/png', 'current.png', 'Current Preview image', 1, 'preview-a'),
      ('asset-preview-b', 'image', 'preview/preview-b/foreign.png', 'image/png', 'foreign.png', 'Foreign Preview image', 1, 'preview-b'),
      ('asset-inactive', 'image', 'teaching-images/inactive.png', 'image/png', 'inactive.png', 'Inactive image', 0, NULL),
      ('asset-document', 'document', 'teaching-images/document.bin', 'application/octet-stream', 'document.bin', 'Document', 1, NULL);

    INSERT INTO question_prompts (id, prompt_md, is_active, preview_session_id) VALUES
      ('prompt-preview-a', 'Preview A prompt', 1, 'preview-a'),
      ('prompt-preview-b', 'Preview B prompt', 1, 'preview-b');

    INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, is_active) VALUES
      ('group-preview-a', 'case-preview-a', 'Preview A group', 0, 1, 'none', 1),
      ('group-preview-b', 'case-preview-b', 'Preview B group', 0, 1, 'none', 1);

    INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, is_active) VALUES
      ('option-preview-a', 'group-preview-a', 'asset-production', 0, 1),
      ('option-preview-b', 'group-preview-b', 'asset-production', 0, 1);
  `);
}

async function expectPreviewError(promise, code, message) {
  await assert.rejects(
    promise,
    (error) =>
      error instanceof previewWorkspace.PreviewWorkspaceError &&
      error.code === code &&
      error.message === message
  );
}

const expectedPublicExports = [
  'PREVIEW_IMAGE_BULK_LIMIT',
  'PREVIEW_IMAGE_PICKER_LIMIT',
  'PREVIEW_SESSION_TTL_MS',
  'PreviewWorkspaceError',
  'addPreviewAssetsToStimulusGroup',
  'addPreviewSecondaryTopic',
  'addPreviewStimulusOption',
  'attachPreviewAsset',
  'attachPreviewAssetsToCase',
  'cleanupPreviewWorkspace',
  'cloneCaseToPreview',
  'convertPreviewFixedAssetToOption',
  'createPreviewAssetFromUpload',
  'createPreviewSession',
  'createPreviewStimulusGroup',
  'detachPreviewAsset',
  'discardPreviewAsset',
  'ensurePreviewWorkspace',
  'getLivePreviewSession',
  'listPreviewCaseImagePicker',
  'listPreviewCases',
  'listProductionCasesForPreview',
  'loadPreviewCaseEditor',
  'movePreviewCaseAsset',
  'movePreviewCaseQuestion',
  'movePreviewStimulusOption',
  'promotePreviewTopic',
  'removePreviewCaseQuestion',
  'removePreviewSecondaryTopic',
  'removePreviewStimulusQuestion',
  'requireOwnedPreviewCase',
  'restorePreviewCaseQuestion',
  'savePreviewCaseQuestion',
  'savePreviewStimulusQuestion',
  'setPreviewStimulusOptionActive',
  'startPreviewAlternativeSet',
  'updatePreviewAssetCaption',
  'updatePreviewCase',
  'updatePreviewCaseVignette',
  'updatePreviewStimulusGroup',
  'updatePreviewStimulusOptionCaption',
  'validatePreviewStimulusGroupTarget'
].sort();

test('Preview workspace facade preserves its public export surface while internal guards stay private', () => {
  assert.deepEqual(Object.keys(previewWorkspace).sort(), expectedPublicExports);
  assert.equal(previewWorkspace.PreviewWorkspaceError, InternalPreviewWorkspaceError);
  assert.equal(previewWorkspace.requireOwnedPreviewPrompt, undefined);
  assert.equal(previewWorkspace.requireOwnedPreviewGroup, undefined);
  assert.equal(previewWorkspace.requireOwnedPreviewOption, undefined);
  assert.equal(previewWorkspace.requirePreviewUsableAsset, undefined);
  assert.equal(previewWorkspace.requireOwnedSession, undefined);
});

test('Preview Session creation uses the existing TTL and reuses the existing live workspace without extending it', async () => {
  const fixture = createFixture();
  try {
    const now = 1_800_000_000_000;
    const first = await previewWorkspace.createPreviewSession(fixture.db, 'owner-a', now);
    assert.equal(first.status, 'active');
    assert.equal(Number(first.expiresAt), now + previewWorkspace.PREVIEW_SESSION_TTL_MS);
    assert.equal(first.lastError, null);

    const reused = await previewWorkspace.createPreviewSession(fixture.db, 'owner-a', now + 60_000);
    assert.equal(reused.id, first.id);
    assert.equal(Number(reused.expiresAt), now + previewWorkspace.PREVIEW_SESSION_TTL_MS);
    assert.equal((await previewWorkspace.getLivePreviewSession(fixture.db, 'owner-a'))?.id, first.id);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM preview_sessions WHERE user_id='owner-a'").get().n, 1);
  } finally {
    fixture.sqlite.close();
  }
});

test('ensurePreviewWorkspace returns an unexpired active Session unchanged', async () => {
  const fixture = createFixture();
  try {
    const now = 1_800_000_000_000;
    const first = await previewWorkspace.createPreviewSession(fixture.db, 'owner-a', now);
    const ensured = await previewWorkspace.ensurePreviewWorkspace({
      db: fixture.db,
      bucket: /** @type {any} */ (fixture.bucket),
      userId: 'owner-a',
      now: now + 1_000
    });
    assert.equal(ensured.id, first.id);
    assert.equal(ensured.status, 'active');
    assert.deepEqual(fixture.bucket.deleted, []);
  } finally {
    fixture.sqlite.close();
  }
});

test('expired Session cleanup failure leaves cleanup_required and blocks replacement creation', async () => {
  const fixture = createFixture();
  try {
    const now = 1_800_000_000_000;
    const session = await previewWorkspace.createPreviewSession(fixture.db, 'owner-a', now);
    const key = `preview/${session.id}/owned.png`;
    fixture.sqlite.prepare(`
      INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active, preview_session_id)
      VALUES ('asset-owned', 'image', ?, 'image/png', 'owned.png', 'Owned Preview image', 1, ?)
    `).run(key, session.id);
    fixture.sqlite.prepare('UPDATE preview_sessions SET expires_at=1 WHERE id=?').run(session.id);
    fixture.bucket.failNextDelete = true;

    await assert.rejects(
      previewWorkspace.ensurePreviewWorkspace({
        db: fixture.db,
        bucket: /** @type {any} */ (fixture.bucket),
        userId: 'owner-a',
        now: now + previewWorkspace.PREVIEW_SESSION_TTL_MS
      }),
      /simulated R2 delete failure/
    );

    const failed = fixture.sqlite.prepare('SELECT status, last_error FROM preview_sessions WHERE id=?').get(session.id);
    assert.equal(failed.status, 'cleanup_required');
    assert.equal(failed.last_error, 'simulated R2 delete failure');
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM preview_sessions WHERE user_id='owner-a'").get().n, 1);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM assets WHERE id='asset-owned'").get().n, 1);

    const replacement = await previewWorkspace.ensurePreviewWorkspace({
      db: fixture.db,
      bucket: /** @type {any} */ (fixture.bucket),
      userId: 'owner-a',
      now: now + previewWorkspace.PREVIEW_SESSION_TTL_MS + 1
    });
    assert.notEqual(replacement.id, session.id);
    assert.equal(fixture.sqlite.prepare('SELECT status FROM preview_sessions WHERE id=?').get(session.id).status, 'cleaned');
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM assets WHERE id='asset-owned'").get().n, 0);
    assert.deepEqual(fixture.bucket.deleted, [key]);
  } finally {
    fixture.sqlite.close();
  }
});

test('ownership guards preserve owner isolation, PreviewWorkspaceError identity, codes and messages', async () => {
  const fixture = createFixture();
  try {
    seedOwnershipFixture(fixture.sqlite);

    assert.equal((await requireOwnedSession(fixture.db, 'preview-a', 'owner-a')).id, 'preview-a');
    assert.equal((await previewWorkspace.requireOwnedPreviewCase(fixture.db, 'preview-a', 'case-preview-a')).id, 'case-preview-a');
    assert.equal((await requireOwnedPreviewPrompt(fixture.db, 'preview-a', 'prompt-preview-a')).id, 'prompt-preview-a');
    assert.equal((await requireOwnedPreviewGroup(fixture.db, 'preview-a', 'group-preview-a')).id, 'group-preview-a');
    assert.equal((await requireOwnedPreviewOption(fixture.db, 'preview-a', 'option-preview-a')).id, 'option-preview-a');

    await expectPreviewError(
      requireOwnedSession(fixture.db, 'preview-a', 'owner-b'),
      'NOT_OWNED',
      'The Preview workspace does not belong to this user.'
    );
    await expectPreviewError(
      previewWorkspace.requireOwnedPreviewCase(fixture.db, 'preview-a', 'case-preview-b'),
      'NOT_OWNED',
      'This Case is not owned by the current Preview workspace.'
    );
    await expectPreviewError(
      requireOwnedPreviewPrompt(fixture.db, 'preview-a', 'prompt-preview-b'),
      'NOT_OWNED',
      'This Question Prompt is not owned by the current Preview workspace.'
    );
    await expectPreviewError(
      requireOwnedPreviewGroup(fixture.db, 'preview-a', 'group-preview-b'),
      'NOT_OWNED',
      'This Stimulus Group is not owned by the current Preview workspace.'
    );
    await expectPreviewError(
      requireOwnedPreviewOption(fixture.db, 'preview-a', 'option-preview-b'),
      'NOT_OWNED',
      'This Stimulus Option is not owned by the current Preview workspace.'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview usable Asset guard permits shared/current images and rejects foreign, inactive and non-image Assets', async () => {
  const fixture = createFixture();
  try {
    seedOwnershipFixture(fixture.sqlite);

    assert.equal((await requirePreviewUsableAsset(fixture.db, 'preview-a', 'asset-production')).id, 'asset-production');
    assert.equal((await requirePreviewUsableAsset(fixture.db, 'preview-a', 'asset-preview-a')).id, 'asset-preview-a');

    for (const assetId of ['asset-preview-b', 'asset-inactive', 'asset-document']) {
      await expectPreviewError(
        requirePreviewUsableAsset(fixture.db, 'preview-a', assetId),
        'NOT_OWNED',
        'The selected image is not available to this Preview workspace.'
      );
    }
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview error and input contracts retain existing INVALID_INPUT and INVALID_SOURCE semantics', async () => {
  assert.throws(
    () => requiredText('   ', 'Case title'),
    (error) =>
      error instanceof previewWorkspace.PreviewWorkspaceError &&
      error.code === 'INVALID_INPUT' &&
      error.message === 'Case title is required.'
  );

  const fixture = createFixture();
  try {
    seedOwnershipFixture(fixture.sqlite);
    await expectPreviewError(
      previewWorkspace.cloneCaseToPreview(fixture.db, {
        previewSessionId: 'preview-a',
        userId: 'owner-a',
        sourceCaseId: 'missing-source'
      }),
      'INVALID_SOURCE',
      'Choose an existing production Case to copy.'
    );
  } finally {
    fixture.sqlite.close();
  }
});