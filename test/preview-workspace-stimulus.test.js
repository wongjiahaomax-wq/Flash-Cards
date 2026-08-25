// Preview stimulus tests intentionally use lightweight D1 fakes and raw SQLite rows.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  addPreviewAssetsToStimulusGroup,
  addPreviewStimulusOption,
  createPreviewStimulusGroup,
  movePreviewStimulusOption,
  PreviewWorkspaceError,
  setPreviewStimulusOptionActive,
  startPreviewAlternativeSet,
  updatePreviewStimulusOptionCaption,
  validatePreviewStimulusGroupTarget
} from '../src/lib/server/db/preview-workspace.js';
import { createPreviewSession } from '../src/lib/server/db/preview-workspace/session.js';

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
  '0012_archive_stimulus_options.sql',
  '0014_review_question_pool_mode.sql'
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
    INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active) VALUES
      ('asset-a', 'image', 'teaching-images/a.png', 'image/png', 'a.png', 'A', 1),
      ('asset-b', 'image', 'teaching-images/b.png', 'image/png', 'b.png', 'B', 1),
      ('asset-c', 'image', 'teaching-images/c.png', 'image/png', 'c.png', 'C', 1),
      ('asset-d', 'image', 'teaching-images/d.png', 'image/png', 'd.png', 'D', 1),
      ('asset-inactive', 'image', 'teaching-images/inactive.png', 'image/png', 'inactive.png', 'Inactive', 0);
  `);
  const d1 = createD1(sqlite);
  const db = createDb(d1);
  return { sqlite, db };
}

async function createPreviewCase(fixture, userId, caseId) {
  const session = await createPreviewSession(fixture.db, userId, 1_800_000_000_000);
  fixture.sqlite
    .prepare("INSERT INTO cases (id, title, preview_session_id, is_active) VALUES (?, ?, ?, 1)")
    .run(caseId, `Preview ${caseId}`, session.id);
  return session;
}

test('Preview Alternative Set lifecycle preserves fixed-image conversion, captions, active state and ordering', async () => {
  const fixture = createFixture();
  try {
    const session = await createPreviewCase(fixture, 'preview-user', 'case-preview');
    fixture.sqlite.exec(`
      INSERT INTO case_assets (case_id, asset_id, display_order, caption_md) VALUES
        ('case-preview', 'asset-a', 0, 'Primary fixed caption'),
        ('case-preview', 'asset-b', 1, 'Second fixed caption');
    `);

    const groupId = await startPreviewAlternativeSet(fixture.db, session.id, 'case-preview', 'asset-a', 'Choose one image');
    const group = fixture.sqlite.prepare('SELECT * FROM stimulus_groups WHERE id=?').get(groupId);
    assert.equal(group.case_id, 'case-preview');
    assert.equal(group.name, 'Choose one image');
    assert.equal(group.selection_count, 1);
    assert.equal(group.specific_question_mode, 'none');
    assert.equal(group.is_active, 1);

    const converted = fixture.sqlite.prepare('SELECT * FROM stimulus_group_options WHERE stimulus_group_id=?').get(groupId);
    assert.equal(converted.asset_id, 'asset-a');
    assert.equal(converted.caption_md, 'Primary fixed caption');
    assert.equal(converted.display_order, 0);
    assert.equal(converted.is_active, 1);
    assert.equal(converted.removed_from_case, 0);
    assert.deepEqual(
      fixture.sqlite.prepare("SELECT asset_id, display_order, caption_md FROM case_assets WHERE case_id='case-preview' ORDER BY display_order").all(),
      [{ asset_id: 'asset-b', display_order: 0, caption_md: 'Second fixed caption' }]
    );

    await addPreviewStimulusOption(fixture.db, session.id, groupId, 'asset-c', 'Initial option caption');
    const added = fixture.sqlite.prepare("SELECT * FROM stimulus_group_options WHERE stimulus_group_id=? AND asset_id='asset-c'").get(groupId);
    assert.equal(added.display_order, 1);

    await updatePreviewStimulusOptionCaption(fixture.db, session.id, 'case-preview', added.id, 'Updated option caption');
    assert.equal(fixture.sqlite.prepare('SELECT caption_md FROM stimulus_group_options WHERE id=?').get(added.id).caption_md, 'Updated option caption');

    await setPreviewStimulusOptionActive(fixture.db, session.id, added.id, false);
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT is_active, removed_from_case FROM stimulus_group_options WHERE id=?').get(added.id),
      { is_active: 0, removed_from_case: 0 }
    );
    await setPreviewStimulusOptionActive(fixture.db, session.id, added.id, true);

    assert.equal(await movePreviewStimulusOption(fixture.db, session.id, groupId, added.id, 'up'), true);
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT asset_id, display_order FROM stimulus_group_options WHERE stimulus_group_id=? ORDER BY display_order').all(groupId),
      [
        { asset_id: 'asset-c', display_order: 0 },
        { asset_id: 'asset-a', display_order: 1 }
      ]
    );
    assert.equal(await movePreviewStimulusOption(fixture.db, session.id, groupId, added.id, 'up'), false);
  } finally {
    fixture.sqlite.close();
  }
});

test('Stimulus bulk add preserves target ownership before input validation and remains idempotent for existing active options', async () => {
  const fixture = createFixture();
  try {
    const first = await createPreviewCase(fixture, 'preview-user-1', 'case-first');
    const second = await createPreviewCase(fixture, 'preview-user-2', 'case-second');
    const firstGroup = await createPreviewStimulusGroup(fixture.db, first.id, 'case-first', { name: 'First set' });
    const secondGroup = await createPreviewStimulusGroup(fixture.db, second.id, 'case-second', { name: 'Second set' });

    await assert.rejects(
      addPreviewAssetsToStimulusGroup(fixture.db, first.id, secondGroup, []),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'NOT_OWNED'
    );
    await assert.rejects(
      addPreviewAssetsToStimulusGroup(fixture.db, first.id, firstGroup, []),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'INVALID_INPUT' && error.message === 'Select at least one image.'
    );

    assert.deepEqual(await addPreviewAssetsToStimulusGroup(fixture.db, first.id, firstGroup, ['asset-c', 'asset-d']), {
      addedCount: 2,
      alreadyPresentCount: 0,
      caseId: 'case-first'
    });
    assert.deepEqual(await addPreviewAssetsToStimulusGroup(fixture.db, first.id, firstGroup, ['asset-c', 'asset-d']), {
      addedCount: 0,
      alreadyPresentCount: 2,
      caseId: 'case-first'
    });
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT asset_id, display_order FROM stimulus_group_options WHERE stimulus_group_id=? ORDER BY display_order').all(firstGroup),
      [
        { asset_id: 'asset-c', display_order: 0 },
        { asset_id: 'asset-d', display_order: 1 }
      ]
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Stimulus target validation preserves minimum-specific-question coverage guard', async () => {
  const fixture = createFixture();
  try {
    const session = await createPreviewCase(fixture, 'preview-user', 'case-preview');
    const groupId = await createPreviewStimulusGroup(fixture.db, session.id, 'case-preview', {
      name: 'Coverage set',
      specificQuestionMode: 'minimum',
      minimumSpecificQuestions: 2
    });

    await assert.rejects(
      validatePreviewStimulusGroupTarget(fixture.db, session.id, groupId),
      (error) =>
        error instanceof PreviewWorkspaceError &&
        error.code === 'INVALID_INPUT' &&
        error.message ===
          "New images would have only 0 set-wide specific questions, below this Preview set's minimum of 2. Add set-wide questions or change coverage first."
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('starting an Alternative Set rolls back the new group when fixed-image conversion fails', async () => {
  const fixture = createFixture();
  try {
    const session = await createPreviewCase(fixture, 'preview-user', 'case-preview');
    fixture.sqlite.exec(`
      INSERT INTO case_assets (case_id, asset_id, display_order, caption_md)
      VALUES ('case-preview', 'asset-inactive', 0, 'Inactive fixed caption');
    `);

    await assert.rejects(
      startPreviewAlternativeSet(fixture.db, session.id, 'case-preview', 'asset-inactive', 'Should roll back'),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'NOT_OWNED'
    );
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM stimulus_groups WHERE case_id='case-preview'").get().n, 0);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM case_assets WHERE case_id='case-preview' AND asset_id='asset-inactive'").get().n, 1);
  } finally {
    fixture.sqlite.close();
  }
});
