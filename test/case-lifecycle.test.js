import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getCaseLibraryPage, parseCaseLibraryFilters } from '../src/lib/server/db/case-library.js';
import {
  bulkDeactivateProductionCases,
  bulkRestoreProductionCases,
  CaseLifecycleError,
  deactivateProductionCase,
  getInactiveProductionCaseRecovery,
  restoreProductionCase
} from '../src/lib/server/db/case-lifecycle.ts';
import { requireProductionCase } from '../src/lib/server/db/content-guards.js';
import { createDb } from '../src/lib/server/db/index.js';
import { listEligibleCases } from '../src/lib/server/db/learning.js';

const migrationSql = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0004_resumable_import_jobs.sql',
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
  '0015_contextual_system_topic_tag_navigation.sql'
]
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('system-eye', 'Eye', 'eye', 'system', NULL, 1),
      ('topic-glaucoma', 'Glaucoma', 'glaucoma', 'topic', 'system-eye', 1),
      ('topic-retina', 'Retina', 'retina', 'topic', 'system-eye', 1);
    INSERT INTO tags (id, name, normalized_name, is_active) VALUES ('tag-urgent', 'Urgent', 'urgent', 1);
  `);
  const d1 = /** @type {any} */ ({
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
    /** @param {any[]} queries */
    async batch(queries) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const query of queries) results.push(await query.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  });
  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite };
}

/** @param {DatabaseSync} sqlite @param {string} id @param {string} title @param {string} [topicId] */
function insertProductionCase(sqlite, id, title, topicId = 'topic-glaucoma') {
  sqlite.prepare('INSERT INTO cases (id, title, vignette_md, is_active) VALUES (?, ?, ?, 1)').run(id, title, `Vignette for ${id}`);
  sqlite.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, ?, 'primary')").run(id, topicId);
}

/** @param {DatabaseSync} sqlite @param {string} id */
function setInactive(sqlite, id) {
  sqlite.prepare('UPDATE cases SET is_active = 0 WHERE id = ?').run(id);
}

/** @param {DatabaseSync} sqlite @param {string} caseId */
function lifecycleSnapshot(sqlite, caseId) {
  return {
    questions: Number(sqlite.prepare('SELECT COUNT(*) AS count FROM case_questions WHERE case_id = ?').get(caseId)?.count ?? 0),
    topics: Number(sqlite.prepare('SELECT COUNT(*) AS count FROM case_concepts WHERE case_id = ?').get(caseId)?.count ?? 0),
    tags: Number(sqlite.prepare('SELECT COUNT(*) AS count FROM case_tags WHERE case_id = ?').get(caseId)?.count ?? 0),
    assets: Number(sqlite.prepare('SELECT COUNT(*) AS count FROM case_assets WHERE case_id = ?').get(caseId)?.count ?? 0),
    groups: Number(sqlite.prepare('SELECT COUNT(*) AS count FROM stimulus_groups WHERE case_id = ?').get(caseId)?.count ?? 0),
    options: Number(sqlite.prepare('SELECT COUNT(*) AS count FROM stimulus_group_options WHERE stimulus_group_id IN (SELECT id FROM stimulus_groups WHERE case_id = ?)').get(caseId)?.count ?? 0),
    reviews: Number(sqlite.prepare('SELECT COUNT(*) AS count FROM reviews WHERE case_id = ?').get(caseId)?.count ?? 0)
  };
}

test('single Case lifecycle preserves content/history, learner exclusion, recovery context, and duplicate display text', async () => {
  const fixture = createLearningDb();
  try {
    insertProductionCase(fixture.sqlite, 'case-original', 'Acute angle closure glaucoma');
    insertProductionCase(fixture.sqlite, 'case-corrected', 'Acute angle closure glaucoma');
    insertProductionCase(fixture.sqlite, 'case-inactive-zulu', 'Zulu glaucoma');
    setInactive(fixture.sqlite, 'case-inactive-zulu');

    fixture.sqlite.exec(`
      INSERT INTO question_prompts (id, prompt_md, is_active) VALUES
        ('prompt-original', 'What is the diagnosis?', 1),
        ('prompt-corrected', 'What is the diagnosis?', 1);
      INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES
        ('cq-original', 'case-original', 'prompt-original', 'Original answer', 1),
        ('cq-corrected', 'case-corrected', 'prompt-corrected', 'Corrected answer', 1);
      INSERT INTO case_tags (case_id, tag_id) VALUES
        ('case-original', 'tag-urgent'),
        ('case-inactive-zulu', 'tag-urgent');
      INSERT INTO assets (id, storage_key, mime_type, alt_text, is_active) VALUES
        ('asset-fixed', 'teaching/fixed.png', 'image/png', 'Clinical image', 1),
        ('asset-option', 'teaching/option.png', 'image/png', 'Alternative clinical image', 1);
      INSERT INTO case_assets (case_id, asset_id, display_order) VALUES ('case-original', 'asset-fixed', 0);
      INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, is_active) VALUES ('group-original', 'case-original', 'Alternative set', 0, 1, 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, is_active, removed_from_case) VALUES ('option-original', 'group-original', 'asset-option', 0, 1, 0);
      INSERT INTO reviews (id, user_id, case_id, primary_concept_id, study_concept_id, case_title_snapshot, vignette_snapshot_md, status) VALUES ('review-original', 'learner-1', 'case-original', 'topic-glaucoma', 'topic-glaucoma', 'Acute angle closure glaucoma', 'Historical vignette', 'completed');
      INSERT INTO review_questions (id, review_id, question_prompt_id, source_type, display_order, prompt_snapshot_md, answer_snapshot_md) VALUES ('rq-original', 'review-original', 'prompt-original', 'case', 0, 'What is the diagnosis?', 'Original historical answer');
      INSERT INTO review_assets (id, review_id, asset_id, display_order, storage_key_snapshot, alt_text_snapshot) VALUES ('ra-original', 'review-original', 'asset-fixed', 0, 'teaching/fixed.png', 'Clinical image');
    `);

    const before = lifecycleSnapshot(fixture.sqlite, 'case-original');
    assert.ok((await listEligibleCases(fixture.db, 'topic-glaucoma')).some((row) => row.id === 'case-original'));

    const first = await deactivateProductionCase(fixture.db, 'case-original');
    assert.equal(first.changed, true);
    const retry = await deactivateProductionCase(fixture.db, 'case-original');
    assert.equal(retry.changed, false);
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM cases WHERE id = 'case-original'").get()?.is_active, 0);
    assert.deepEqual(lifecycleSnapshot(fixture.sqlite, 'case-original'), before);
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM question_prompts WHERE id = 'prompt-original'").get()?.is_active, 1);
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM assets WHERE id = 'asset-fixed'").get()?.is_active, 1);
    assert.deepEqual(
      { ...fixture.sqlite.prepare("SELECT case_title_snapshot, vignette_snapshot_md FROM reviews WHERE id = 'review-original'").get() },
      { case_title_snapshot: 'Acute angle closure glaucoma', vignette_snapshot_md: 'Historical vignette' }
    );
    assert.equal((await listEligibleCases(fixture.db, 'topic-glaucoma')).some((row) => row.id === 'case-original'), false);
    await assert.rejects(requireProductionCase(fixture.db, 'case-original'));

    const activeLibrary = await getCaseLibraryPage(fixture.db, { search: 'Acute', tagId: '', lifecycle: 'active' }, { pageSize: 10 });
    assert.deepEqual(activeLibrary.rows.map((row) => row.id), ['case-corrected']);
    const inactiveLibrary = await getCaseLibraryPage(
      fixture.db,
      { search: '', topicSearch: 'glauc', systemSearch: 'eye', tagId: 'tag-urgent', sort: 'case-desc', lifecycle: 'inactive' },
      { page: 1, pageSize: 1 }
    );
    assert.equal(inactiveLibrary.totalCount, 2);
    assert.equal(inactiveLibrary.totalPages, 2);
    assert.equal(inactiveLibrary.rows[0]?.id, 'case-inactive-zulu');
    assert.equal(inactiveLibrary.rows[0]?.isActive, false);

    const recovery = await getInactiveProductionCaseRecovery(fixture.db, 'case-original');
    assert.equal(recovery?.case.id, 'case-original');
    assert.equal(recovery?.case.title, 'Acute angle closure glaucoma');
    assert.deepEqual(recovery?.primaryTopics.map((topic) => topic.name), ['Glaucoma']);
    assert.equal(recovery?.systemName, 'Eye');
    assert.deepEqual(recovery?.tags.map((tag) => tag.name), ['Urgent']);

    const restored = await restoreProductionCase(fixture.db, 'case-original');
    assert.equal(restored.changed, true);
    assert.equal((await restoreProductionCase(fixture.db, 'case-original')).changed, false);
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM cases WHERE id = 'case-original'").get()?.is_active, 1);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM cases WHERE title = 'Acute angle closure glaucoma' AND is_active = 1").get()?.count, 2);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM question_prompts WHERE prompt_md = 'What is the diagnosis?'").get()?.count, 2);
    assert.ok((await listEligibleCases(fixture.db, 'topic-glaucoma')).some((row) => row.id === 'case-original'));
  } finally {
    fixture.sqlite.close();
  }
});

test('restore validation is actionable and failed restore leaves the Case inactive', async () => {
  const fixture = createLearningDb();
  try {
    insertProductionCase(fixture.sqlite, 'case-invalid', 'Invalid restore Case', 'topic-retina');
    await deactivateProductionCase(fixture.db, 'case-invalid');
    fixture.sqlite.prepare("UPDATE concepts SET is_active = 0 WHERE id = 'topic-retina'").run();

    await assert.rejects(
      restoreProductionCase(fixture.db, 'case-invalid'),
      (error) => error instanceof CaseLifecycleError && /Primary Topic is inactive/i.test(error.message)
    );
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM cases WHERE id = 'case-invalid'").get()?.is_active, 0);

    fixture.sqlite.prepare("UPDATE concepts SET is_active = 1 WHERE id = 'topic-retina'").run();
    fixture.sqlite.prepare("DELETE FROM case_concepts WHERE case_id = 'case-invalid' AND role = 'primary'").run();
    await assert.rejects(
      restoreProductionCase(fixture.db, 'case-invalid'),
      (error) => error instanceof CaseLifecycleError && /exactly one Primary Topic/i.test(error.message)
    );
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM cases WHERE id = 'case-invalid'").get()?.is_active, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('bulk lifecycle validates the complete set, rejects Preview ownership, and obeys the 60-Case limit', async () => {
  const fixture = createLearningDb();
  try {
    insertProductionCase(fixture.sqlite, 'case-a', 'Case A');
    insertProductionCase(fixture.sqlite, 'case-b', 'Case B');
    insertProductionCase(fixture.sqlite, 'case-c', 'Case C');
    fixture.sqlite.exec("INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview-1', 'preview-user', 'active', 4102444800000)");
    fixture.sqlite.exec("INSERT INTO cases (id, title, preview_session_id, is_active) VALUES ('preview-case', 'Preview Case', 'preview-1', 1)");
    fixture.sqlite.exec("INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('preview-case', 'topic-glaucoma', 'primary')");

    await bulkDeactivateProductionCases(fixture.db, ['case-a', 'case-b']);
    assert.deepEqual(fixture.sqlite.prepare("SELECT id, is_active FROM cases WHERE id IN ('case-a','case-b') ORDER BY id").all().map((row) => ({ ...row })), [
      { id: 'case-a', is_active: 0 },
      { id: 'case-b', is_active: 0 }
    ]);

    await assert.rejects(bulkDeactivateProductionCases(fixture.db, ['case-c', 'preview-case']), CaseLifecycleError);
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM cases WHERE id = 'case-c'").get()?.is_active, 1);
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM cases WHERE id = 'preview-case'").get()?.is_active, 1);

    fixture.sqlite.prepare("DELETE FROM case_concepts WHERE case_id = 'case-b' AND role = 'primary'").run();
    await assert.rejects(bulkRestoreProductionCases(fixture.db, ['case-a', 'case-b']), CaseLifecycleError);
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM cases WHERE id = 'case-a'").get()?.is_active, 0);
    assert.equal(fixture.sqlite.prepare("SELECT is_active FROM cases WHERE id = 'case-b'").get()?.is_active, 0);
    fixture.sqlite.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-b', 'topic-glaucoma', 'primary')").run();
    await bulkRestoreProductionCases(fixture.db, ['case-a', 'case-b']);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM cases WHERE id IN ('case-a','case-b') AND is_active = 1").get()?.count, 2);

    await assert.rejects(
      bulkDeactivateProductionCases(fixture.db, Array.from({ length: 61 }, (_, index) => `case-${index}`)),
      (error) => error instanceof CaseLifecycleError && /no more than 60/i.test(error.message)
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('lifecycle query parsing keeps Active as the default and uses a separate key from success status', () => {
  assert.equal(parseCaseLibraryFilters(new URLSearchParams()).lifecycle, 'active');
  assert.equal(parseCaseLibraryFilters(new URLSearchParams('lifecycle=inactive&status=cases-deactivated')).lifecycle, 'inactive');
});

test('shared editor lifecycle UX is production-only and introduces no Preview named-action authority', () => {
  const editor = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
  const previewRoute = readFileSync(new URL('../src/routes/preview-admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
  const lifecycleModule = readFileSync(new URL('../src/lib/server/db/case-lifecycle.ts', import.meta.url), 'utf8');
  assert.match(editor, /\{#if !data\.previewMode\}[\s\S]*Deactivate Case/);
  assert.match(editor, /\/admin\/cases\/\$\{encodeURIComponent\(selectedCase\.case\.id\)\}\/deactivate/);
  assert.doesNotMatch(editor, /action=["']\?\/deactivateCase["']/);
  assert.doesNotMatch(previewRoute, /deactivateProductionCase|restoreProductionCase/);
  assert.doesNotMatch(lifecycleModule, /deleteTeachingImage|putTeachingImage|env\.MEDIA|R2/);
});
