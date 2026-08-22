import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { updateCaseVignette, AdminContentInputError } from '../src/lib/server/db/admin-content.js';
import {
  ContentGuardError,
  requireOwnedPreviewCase,
  requireProductionCase,
  requireProductionImageAsset
} from '../src/lib/server/db/content-guards.js';
import { createDb } from '../src/lib/server/db/index.js';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

const migrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(`
    INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES
      ('preview-a', 'preview-user-a', 'active', 2000000000000),
      ('preview-b', 'preview-user-b', 'active', 2000000000000);

    INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, is_active, preview_session_id) VALUES
      ('case-production', 'Production Case', 'Production vignette', 'automatic', NULL, 1, NULL),
      ('case-preview-a', 'Preview A Case', 'Preview A vignette', 'automatic', NULL, 1, 'preview-a'),
      ('case-preview-b', 'Preview B Case', 'Preview B vignette', 'automatic', NULL, 1, 'preview-b');

    INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active, preview_session_id) VALUES
      ('asset-production-image', 'image', 'test/production.png', 'image/png', 'production.png', 'Production image', 1, NULL),
      ('asset-preview-image', 'image', 'test/preview.png', 'image/png', 'preview.png', 'Preview image', 1, 'preview-a'),
      ('asset-production-non-image', 'document', 'test/document.bin', 'application/octet-stream', 'document.bin', 'Document', 1, NULL);
  `);

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
              return {
                success: true,
                results: [],
                meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
              };
            }
          };
        }
      };
    }
  };

  return {
    sqlite,
    db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1))))
  };
}

test('production Case guard accepts production and rejects Preview-owned Cases', async () => {
  const fixture = createFixture();
  try {
    assert.deepEqual(await requireProductionCase(fixture.db, 'case-production'), { id: 'case-production' });
    await assert.rejects(
      () => requireProductionCase(fixture.db, 'case-preview-a'),
      (error) => error instanceof ContentGuardError && error.code === 'PRODUCTION_CASE_REQUIRED'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('production image Asset guard rejects Preview-owned and non-image Assets', async () => {
  const fixture = createFixture();
  try {
    assert.deepEqual(await requireProductionImageAsset(fixture.db, 'asset-production-image'), {
      id: 'asset-production-image',
      type: 'image'
    });
    await assert.rejects(
      () => requireProductionImageAsset(fixture.db, 'asset-preview-image'),
      (error) => error instanceof ContentGuardError && error.code === 'PRODUCTION_ASSET_REQUIRED'
    );
    await assert.rejects(
      () => requireProductionImageAsset(fixture.db, 'asset-production-non-image'),
      (error) => error instanceof ContentGuardError && error.code === 'PRODUCTION_IMAGE_ASSET_REQUIRED'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview Case ownership guard accepts only the current Preview Session', async () => {
  const fixture = createFixture();
  try {
    assert.deepEqual(await requireOwnedPreviewCase(fixture.db, 'preview-a', 'case-preview-a'), {
      id: 'case-preview-a',
      previewSessionId: 'preview-a'
    });
    await assert.rejects(
      () => requireOwnedPreviewCase(fixture.db, 'preview-a', 'case-preview-b'),
      (error) => error instanceof ContentGuardError && error.code === 'PREVIEW_CASE_OWNERSHIP_REQUIRED'
    );
    await assert.rejects(
      () => requireOwnedPreviewCase(fixture.db, 'preview-a', 'case-production'),
      (error) => error instanceof ContentGuardError && error.code === 'PREVIEW_CASE_OWNERSHIP_REQUIRED'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('production Admin Case mutation rejects a Preview-owned Case', async () => {
  const fixture = createFixture();
  try {
    await assert.rejects(
      () => updateCaseVignette(fixture.db, 'case-preview-a', 'Must not be written'),
      (error) => error instanceof AdminContentInputError && /missing or inactive/.test(error.message)
    );
    const row = fixture.sqlite.prepare("SELECT vignette_md FROM cases WHERE id = 'case-preview-a'").get();
    assert.equal(row?.vignette_md, 'Preview A vignette');
  } finally {
    fixture.sqlite.close();
  }
});
