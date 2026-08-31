import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { updateCaseVignette, AdminContentInputError } from '../src/lib/server/db/admin-content.js';
import {
  ContentGuardError,
  requireProductionCase,
  requireProductionImageAsset
} from '../src/lib/server/db/content-guards.js';
import { createDb } from '../src/lib/server/db/index.js';
import {
  PreviewWorkspaceError,
  requireOwnedPreviewCase
} from '../src/lib/server/db/preview-workspace.js';
import {
  removeStimulusOptionQuestion,
  saveStimulusGroupQuestion,
  StimulusGroupInputError
} from '../src/lib/server/db/stimulus-groups.js';
import { applyCurrentSchema } from './current-schema.js';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(`
    INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES
      ('preview-a', 'preview-user-a', 'active', 2000000000000),
      ('preview-b', 'preview-user-b', 'active', 2000000000000);

    INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, is_active, preview_session_id) VALUES
      ('case-production', 'Production Case', 'Production vignette', 'automatic', NULL, 1, NULL),
      ('case-production-inactive', 'Inactive Production Case', 'Inactive production vignette', 'automatic', NULL, 0, NULL),
      ('case-preview-a', 'Preview A Case', 'Preview A vignette', 'automatic', NULL, 1, 'preview-a'),
      ('case-preview-b', 'Preview B Case', 'Preview B vignette', 'automatic', NULL, 1, 'preview-b');

    INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active, preview_session_id) VALUES
      ('asset-production-image', 'image', 'test/production.png', 'image/png', 'production.png', 'Production image', 1, NULL),
      ('asset-production-image-inactive', 'image', 'test/production-inactive.png', 'image/png', 'production-inactive.png', 'Inactive production image', 0, NULL),
      ('asset-preview-image', 'image', 'test/preview.png', 'image/png', 'preview.png', 'Preview image', 1, 'preview-a'),
      ('asset-production-non-image', 'document', 'test/document.bin', 'application/octet-stream', 'document.bin', 'Document', 1, NULL);

    INSERT INTO question_prompts (id, prompt_md, is_active, preview_session_id) VALUES
      ('prompt-production', 'Production option prompt', 1, NULL),
      ('prompt-preview-a', 'Preview-only wording', 1, 'preview-a');

    INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active) VALUES
      ('group-production', 'case-production', 'Production group', 0, 1, 'none', NULL, 1),
      ('group-preview-a', 'case-preview-a', 'Preview group', 0, 1, 'none', NULL, 1);

    INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, is_active) VALUES
      ('option-production', 'group-production', 'asset-production-image', 0, 1),
      ('option-preview-a', 'group-preview-a', 'asset-production-image', 0, 1);

    INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active) VALUES
      ('option-question-production', 'option-production', 'prompt-production', 'Production answer', 1),
      ('option-question-preview-a', 'option-preview-a', 'prompt-preview-a', 'Preview answer', 1);
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

test('production Case guard accepts active production and rejects Preview-owned or inactive Cases', async () => {
  const fixture = createFixture();
  try {
    assert.deepEqual(await requireProductionCase(fixture.db, 'case-production'), { id: 'case-production' });
    await assert.rejects(
      () => requireProductionCase(fixture.db, 'case-preview-a'),
      (error) => error instanceof ContentGuardError && error.code === 'PRODUCTION_CASE_REQUIRED'
    );
    await assert.rejects(
      () => requireProductionCase(fixture.db, 'case-production-inactive'),
      (error) => error instanceof ContentGuardError && error.code === 'PRODUCTION_CASE_REQUIRED'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('production image Asset guard rejects Preview-owned, inactive, and non-image Assets', async () => {
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
      () => requireProductionImageAsset(fixture.db, 'asset-production-image-inactive'),
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

test('Preview workspace remains the sole Preview Case ownership authority', async () => {
  const fixture = createFixture();
  try {
    const ownedCase = await requireOwnedPreviewCase(fixture.db, 'preview-a', 'case-preview-a');
    assert.equal(ownedCase.id, 'case-preview-a');
    assert.equal(ownedCase.previewSessionId, 'preview-a');
    assert.equal(ownedCase.vignetteMd, 'Preview A vignette');

    await assert.rejects(
      () => requireOwnedPreviewCase(fixture.db, 'preview-a', 'case-preview-b'),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'NOT_OWNED'
    );
    await assert.rejects(
      () => requireOwnedPreviewCase(fixture.db, 'preview-a', 'case-production'),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'NOT_OWNED'
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

test('production Stimulus Option question removal rejects a Preview-owned option', async () => {
  const fixture = createFixture();
  try {
    await assert.rejects(
      () => removeStimulusOptionQuestion(fixture.db, 'option-preview-a', 'prompt-preview-a'),
      (error) => error instanceof StimulusGroupInputError && /missing or inactive/.test(error.message)
    );
    const previewRow = fixture.sqlite.prepare("SELECT is_active FROM stimulus_option_questions WHERE id = 'option-question-preview-a'").get();
    assert.equal(previewRow?.is_active, 1);

    await removeStimulusOptionQuestion(fixture.db, 'option-production', 'prompt-production');
    const productionRow = fixture.sqlite.prepare("SELECT is_active FROM stimulus_option_questions WHERE id = 'option-question-production'").get();
    assert.equal(productionRow?.is_active, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('production Stimulus Group question creation does not reuse a Preview-owned prompt', async () => {
  const fixture = createFixture();
  try {
    const promptId = await saveStimulusGroupQuestion(fixture.db, 'group-production', {
      promptMd: 'Preview-only wording',
      answerMd: 'Production answer'
    });
    assert.notEqual(promptId, 'prompt-preview-a');
    const prompt = fixture.sqlite.prepare('SELECT prompt_md, preview_session_id FROM question_prompts WHERE id = ?').get(promptId);
    assert.equal(prompt?.prompt_md, 'Preview-only wording');
    assert.equal(prompt?.preview_session_id, null);
  } finally {
    fixture.sqlite.close();
  }
});