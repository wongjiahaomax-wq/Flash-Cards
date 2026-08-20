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
  readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0005_tag_foundation.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0007_image_collections.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0008_tag_shared_questions.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0009_reusable_image_questions.sql', import.meta.url), 'utf8')
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

function insertCase(sqlite, id, title = id) {
  sqlite.prepare('INSERT INTO cases (id, title, vignette_md, question_selection_mode, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, title, '', 'automatic', 1, 9_000, 9_000);
}

function insertGroup(sqlite, id, caseId, name = id, active = 1) {
  sqlite.prepare('INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, caseId, name, 0, 1, 'none', active, 9_000, 9_000);
}

function insertOption(sqlite, id, groupId, assetId, active = 1) {
  sqlite.prepare('INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, groupId, assetId, 0, active, 9_000, 9_000);
}

// Keep the remainder of this test file unchanged below this line.
