// Focused characterization coverage for Preview fixed Case-image behavior.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  attachPreviewAsset,
  attachPreviewAssetsToCase,
  cloneCaseToPreview,
  createPreviewSession,
  detachPreviewAsset,
  loadPreviewCaseEditor,
  movePreviewCaseAsset,
  PREVIEW_IMAGE_BULK_LIMIT,
  PreviewWorkspaceError,
  updatePreviewAssetCaption
} from '../src/lib/server/db/preview-workspace.js';

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
  '0010_reusable_image_reactivation_guard.sql',
  '0011_asset_supersession.sql',
  '0012_archive_stimulus_options.sql',
  '0013_review_assets_asset_lookup.sql',
  '0014_review_question_pool_mode.sql',
  '0015_contextual_system_topic_tag_navigation.sql',
  '0016_original_stimulus_options.sql'
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

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, is_active)
      VALUES ('topic-1', 'Cardiology', 'cardiology', 1);

    INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, is_active)
      VALUES ('case-source', 'Source Case', 'Source vignette', 'automatic', NULL, 1);
    INSERT INTO case_concepts (case_id, concept_id, role)
      VALUES ('case-source', 'topic-1', 'primary');

    INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active)
      VALUES
      ('asset-fixed-a', 'image', 'teaching-images/fixed-a.png', 'image/png', 'fixed-a.png', 'Fixed image A', 1),
      ('asset-fixed-b', 'image', 'teaching-images/fixed-b.png', 'image/png', 'fixed-b.png', 'Fixed image B', 1),
      ('asset-grouped', 'image', 'teaching-images/grouped.png', 'image/png', 'grouped.png', 'Grouped image', 1),
      ('asset-extra', 'image', 'teaching-images/extra.png', 'image/png', 'extra.png', 'Extra image', 1),
      ('asset-extra-2', 'image', 'teaching-images/extra-2.png', 'image/png', 'extra-2.png', 'Extra image 2', 1);

    INSERT INTO case_assets (case_id, asset_id, display_order, caption_md)
      VALUES
      ('case-source', 'asset-fixed-a', 0, 'First source caption'),
      ('case-source', 'asset-fixed-b', 1, 'Second source caption');

    INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active)
      VALUES ('group-source', 'case-source', 'Alternative set', 0, 1, 'none', NULL, 1);
    INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active)
      VALUES ('option-source', 'group-source', 'asset-grouped', 0, 'Grouped caption', 1);
  `);

  const db = /** @type {LearningDb} */ (createDb(/** @type {any} */ (createD1(sqlite))));
  return { sqlite, db };
}

async function createClone(fixture, userId) {
  const session = await createPreviewSession(fixture.db, userId, 1_800_000_000_000);
  const caseId = await cloneCaseToPreview(fixture.db, {
    previewSessionId: session.id,
    userId,
    sourceCaseId: 'case-source'
  });
  return { session, caseId };
}

async function expectPreviewError(promise, code, message) {
  await assert.rejects(
    promise,
    (error) => error instanceof PreviewWorkspaceError && error.code === code && error.message === message
  );
}

function fixedRows(sqlite, caseId) {
  return sqlite
    .prepare('SELECT asset_id, display_order, caption_md FROM case_assets WHERE case_id=? ORDER BY display_order')
    .all(caseId)
    .map((row) => ({ ...row }));
}

test('Preview Case cloning and editor reads preserve fixed-image order and Case-specific captions', async () => {
  const fixture = createFixture();
  try {
    const { session, caseId } = await createClone(fixture, 'owner-a');
    assert.deepEqual(fixedRows(fixture.sqlite, caseId), [
      { asset_id: 'asset-fixed-a', display_order: 0, caption_md: 'First source caption' },
      { asset_id: 'asset-fixed-b', display_order: 1, caption_md: 'Second source caption' }
    ]);

    const editor = await loadPreviewCaseEditor(fixture.db, session.id, caseId);
    assert.deepEqual(
      editor.selectedCase.attached.map((row) => ({ assetId: row.assetId, displayOrder: row.displayOrder, captionMd: row.captionMd })),
      [
        { assetId: 'asset-fixed-a', displayOrder: 0, captionMd: 'First source caption' },
        { assetId: 'asset-fixed-b', displayOrder: 1, captionMd: 'Second source caption' }
      ]
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('fixed-image attach helpers preserve duplicate, Alternative Set, missing-Asset, order, and bulk-count semantics', async () => {
  const fixture = createFixture();
  try {
    const { session, caseId } = await createClone(fixture, 'owner-a');

    await attachPreviewAsset(fixture.db, session.id, caseId, 'asset-extra', '  Added caption  ');
    assert.deepEqual(fixedRows(fixture.sqlite, caseId), [
      { asset_id: 'asset-fixed-a', display_order: 0, caption_md: 'First source caption' },
      { asset_id: 'asset-fixed-b', display_order: 1, caption_md: 'Second source caption' },
      { asset_id: 'asset-extra', display_order: 2, caption_md: 'Added caption' }
    ]);

    await expectPreviewError(
      attachPreviewAsset(fixture.db, session.id, caseId, 'asset-extra'),
      'INVALID_INPUT',
      'That image is already attached to this Preview Case.'
    );
    await expectPreviewError(
      attachPreviewAsset(fixture.db, session.id, caseId, 'asset-grouped'),
      'INVALID_INPUT',
      'That image is already used in an alternative set for this Preview Case.'
    );
    await expectPreviewError(
      attachPreviewAsset(fixture.db, session.id, caseId, 'asset-missing'),
      'NOT_OWNED',
      'The selected image is not available to this Preview workspace.'
    );

    assert.deepEqual(
      await attachPreviewAssetsToCase(fixture.db, session.id, caseId, ['asset-extra', 'asset-extra-2', 'asset-extra-2']),
      { attachedCount: 1, alreadyAttachedCount: 1, caseId }
    );
    assert.deepEqual(fixedRows(fixture.sqlite, caseId).map((row) => [row.asset_id, row.display_order]), [
      ['asset-fixed-a', 0],
      ['asset-fixed-b', 1],
      ['asset-extra', 2],
      ['asset-extra-2', 3]
    ]);

    await expectPreviewError(
      attachPreviewAssetsToCase(fixture.db, session.id, caseId, ['asset-grouped', 'asset-extra-2']),
      'INVALID_INPUT',
      'One or more selected images are already in an alternative set in this Preview Case.'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('fixed-image caption, reorder, and detach keep the existing relationship and normalization behavior', async () => {
  const fixture = createFixture();
  try {
    const { session, caseId } = await createClone(fixture, 'owner-a');

    await updatePreviewAssetCaption(fixture.db, session.id, caseId, 'asset-fixed-b', '  Revised caption  ');
    assert.equal(
      fixture.sqlite.prepare('SELECT caption_md FROM case_assets WHERE case_id=? AND asset_id=?').get(caseId, 'asset-fixed-b').caption_md,
      'Revised caption'
    );

    assert.equal(await movePreviewCaseAsset(fixture.db, session.id, caseId, 'asset-fixed-b', 'up'), true);
    assert.deepEqual(fixedRows(fixture.sqlite, caseId).map((row) => [row.asset_id, row.display_order]), [
      ['asset-fixed-b', 0],
      ['asset-fixed-a', 1]
    ]);
    assert.equal(await movePreviewCaseAsset(fixture.db, session.id, caseId, 'asset-fixed-b', 'up'), false);
    assert.equal(await movePreviewCaseAsset(fixture.db, session.id, caseId, 'asset-missing', 'down'), false);

    await detachPreviewAsset(fixture.db, session.id, caseId, 'asset-fixed-b');
    assert.deepEqual(fixedRows(fixture.sqlite, caseId), [
      { asset_id: 'asset-fixed-a', display_order: 0, caption_md: 'First source caption' }
    ]);
    await expectPreviewError(
      detachPreviewAsset(fixture.db, session.id, caseId, 'asset-grouped'),
      'INVALID_INPUT',
      'That image is not a fixed image on this Preview Case.'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('fixed-image mutations cannot cross Preview workspace ownership boundaries', async () => {
  const fixture = createFixture();
  try {
    const first = await createClone(fixture, 'owner-a');
    const second = await createClone(fixture, 'owner-b');
    const before = fixedRows(fixture.sqlite, second.caseId);
    const ownershipMessage = 'This Case is not owned by the current Preview workspace.';
    const oversizedSelection = Array.from(
      { length: PREVIEW_IMAGE_BULK_LIMIT + 1 },
      (_, index) => `asset-oversized-${index}`
    );

    await expectPreviewError(
      attachPreviewAsset(fixture.db, first.session.id, second.caseId, 'asset-extra'),
      'NOT_OWNED',
      ownershipMessage
    );
    await expectPreviewError(
      attachPreviewAssetsToCase(fixture.db, first.session.id, second.caseId, []),
      'NOT_OWNED',
      ownershipMessage
    );
    await expectPreviewError(
      attachPreviewAssetsToCase(fixture.db, first.session.id, second.caseId, oversizedSelection),
      'NOT_OWNED',
      ownershipMessage
    );
    await expectPreviewError(
      updatePreviewAssetCaption(fixture.db, first.session.id, second.caseId, 'asset-fixed-a', 'Foreign caption'),
      'NOT_OWNED',
      ownershipMessage
    );
    await expectPreviewError(
      movePreviewCaseAsset(fixture.db, first.session.id, second.caseId, 'asset-fixed-b', 'up'),
      'NOT_OWNED',
      ownershipMessage
    );
    await expectPreviewError(
      detachPreviewAsset(fixture.db, first.session.id, second.caseId, 'asset-fixed-a'),
      'NOT_OWNED',
      ownershipMessage
    );

    assert.deepEqual(fixedRows(fixture.sqlite, second.caseId), before);
  } finally {
    fixture.sqlite.close();
  }
});