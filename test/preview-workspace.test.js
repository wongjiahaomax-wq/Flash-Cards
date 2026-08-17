// Preview workspace tests intentionally use lightweight D1/R2 fakes and raw SQLite rows.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { listAdminCases } from '../src/lib/server/db/case-assets.js';
import { createDb } from '../src/lib/server/db/index.js';
import { listEligibleCases, listStudyConcepts, startReview } from '../src/lib/server/db/learning.js';
import {
  addPreviewAssetsToStimulusGroup,
  attachPreviewAssetsToCase,
  attachPreviewAsset,
  cleanupPreviewWorkspace,
  cloneCaseToPreview,
  createPreviewAssetFromUpload,
  createPreviewSession,
  ensurePreviewWorkspace,
  getLivePreviewSession,
  listPreviewCases,
  listPreviewCaseImagePicker,
  loadPreviewCaseEditor,
  PreviewWorkspaceError,
  savePreviewCaseQuestion,
  updatePreviewStimulusOptionCaption,
  updatePreviewCase
} from '../src/lib/server/db/preview-workspace.js';
import { GET as getAssetImage } from '../src/routes/api/assets/[assetId]/image/+server.js';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

const migrationSql = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql'
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
    this.objects = new Map();
    this.deleted = [];
    this.failNextDelete = false;
  }

  async list() {
    return {
      objects: [...this.objects.entries()].map(([key, value]) => ({ key, size: value.size })),
      truncated: false
    };
  }

  async head(key) {
    const value = this.objects.get(key);
    return value ? { key, size: value.size } : null;
  }

  async put(key, file) {
    if (this.objects.has(key)) return null;
    this.objects.set(key, { body: file, size: file.size, type: file.type });
    return { key, size: file.size };
  }

  async delete(key) {
    if (this.failNextDelete) {
      this.failNextDelete = false;
      throw new Error('simulated R2 delete failure');
    }
    this.deleted.push(key);
    this.objects.delete(key);
  }
}

function seed(sqlite) {
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, is_active) VALUES ('topic-1', 'Cardiology', 'cardiology', 1);
    INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, is_active)
      VALUES ('case-source', 'Source STEMI', 'Production vignette', 'automatic', NULL, 1);
    INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-source', 'topic-1', 'primary');

    INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, source_label, source_url, licence, is_active)
      VALUES
      ('asset-fixed', 'image', 'teaching-images/fixed.png', 'image/png', 'fixed.png', 'Fixed ECG', 'Source', 'https://example.com/fixed', 'CC BY', 1),
      ('asset-option', 'image', 'teaching-images/option.png', 'image/png', 'option.png', 'Alternative ECG', 'Source', 'https://example.com/option', 'CC BY', 1);
    INSERT INTO case_assets (case_id, asset_id, display_order, caption_md)
      VALUES ('case-source', 'asset-fixed', 0, 'Source-specific fixed caption');

    INSERT INTO question_prompts (id, prompt_md, is_active) VALUES
      ('prompt-shared-context', 'What is the diagnosis?', 1),
      ('prompt-option', 'What feature is present?', 1),
      ('prompt-topic', 'What is the broad management principle?', 1);
    INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active)
      VALUES ('case-question-source', 'case-source', 'prompt-shared-context', 'Anterior STEMI', 1);
    INSERT INTO concept_questions (id, concept_id, question_prompt_id, answer_md, inherit_to_descendants, is_active)
      VALUES ('topic-question', 'topic-1', 'prompt-topic', 'Treat the patient, not only the tracing.', 0, 1);

    INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, minimum_specific_questions, is_active)
      VALUES ('group-source', 'case-source', 'Choose one ECG', 0, 1, 'minimum', 1, 1);
    INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active)
      VALUES ('option-source', 'group-source', 'asset-option', 0, 'Option-specific caption', 1);
    INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active)
      VALUES ('group-question-source', 'group-source', 'prompt-shared-context', 'Interpret it in clinical context.', 1);
    INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active)
      VALUES ('option-question-source', 'option-source', 'prompt-option', 'ST elevation is present.', 1);

    INSERT INTO tags (id, name, normalized_name, is_active) VALUES
      ('tag-case', 'prolonged QTc', 'prolonged qtc', 1),
      ('tag-question', 'ECG diagnosis', 'ecg diagnosis', 1);
    INSERT INTO case_tags (case_id, tag_id) VALUES ('case-source', 'tag-case');
    INSERT INTO case_question_tags (case_question_id, tag_id) VALUES ('case-question-source', 'tag-question');
  `);
}

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  seed(sqlite);
  const d1 = createD1(sqlite);
  const db = /** @type {LearningDb} */ (createDb(/** @type {any} */ (d1)));
  return { sqlite, d1, db, bucket: new TestBucket() };
}

async function createClone(fixture, userId = 'preview-user') {
  const session = await createPreviewSession(fixture.db, userId, 1_800_000_000_000);
  const caseId = await cloneCaseToPreview(fixture.db, {
    previewSessionId: session.id,
    userId,
    sourceCaseId: 'case-source'
  });
  return { session, caseId };
}

test('Preview cloning owns the copy, preserves relationships/tags, reuses Assets, and isolates editable prompts', async () => {
  const fixture = createFixture();
  try {
    const sourceBefore = fixture.sqlite.prepare("SELECT * FROM cases WHERE id='case-source'").get();
    const assetsBefore = fixture.sqlite.prepare('SELECT id, storage_key, alt_text, source_label, source_url, licence, is_active FROM assets ORDER BY id').all();
    const { session, caseId } = await createClone(fixture);

    assert.deepEqual(fixture.sqlite.prepare("SELECT * FROM cases WHERE id='case-source'").get(), sourceBefore);
    const clone = fixture.sqlite.prepare('SELECT * FROM cases WHERE id=?').get(caseId);
    assert.equal(clone.preview_session_id, session.id);
    assert.equal(clone.title, 'Source STEMI');
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) n FROM case_concepts WHERE case_id=?').get(caseId).n, 1);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) n FROM case_assets WHERE case_id=? AND asset_id=?').get(caseId, 'asset-fixed').n, 1);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) n FROM stimulus_groups WHERE case_id=?').get(caseId).n, 1);
    assert.equal(
      fixture.sqlite.prepare('SELECT COUNT(*) n FROM stimulus_group_options o JOIN stimulus_groups g ON g.id=o.stimulus_group_id WHERE g.case_id=? AND o.asset_id=?').get(caseId, 'asset-option').n,
      1
    );
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) n FROM case_tags WHERE case_id=? AND tag_id=?').get(caseId, 'tag-case').n, 1);
    assert.equal(
      fixture.sqlite.prepare('SELECT COUNT(*) n FROM case_question_tags t JOIN case_questions q ON q.id=t.case_question_id WHERE q.case_id=? AND t.tag_id=?').get(caseId, 'tag-question').n,
      1
    );

    const clonedCaseQuestion = fixture.sqlite.prepare('SELECT question_prompt_id FROM case_questions WHERE case_id=?').get(caseId);
    assert.notEqual(clonedCaseQuestion.question_prompt_id, 'prompt-shared-context');
    const clonedPrompt = fixture.sqlite.prepare('SELECT prompt_md, preview_session_id FROM question_prompts WHERE id=?').get(clonedCaseQuestion.question_prompt_id);
    assert.equal(clonedPrompt.prompt_md, 'What is the diagnosis?');
    assert.equal(clonedPrompt.preview_session_id, session.id);
    const groupPrompt = fixture.sqlite.prepare('SELECT q.question_prompt_id FROM stimulus_group_questions q JOIN stimulus_groups g ON g.id=q.stimulus_group_id WHERE g.case_id=?').get(caseId);
    assert.equal(groupPrompt.question_prompt_id, clonedCaseQuestion.question_prompt_id);

    const assetsAfter = fixture.sqlite.prepare('SELECT id, storage_key, alt_text, source_label, source_url, licence, is_active FROM assets WHERE preview_session_id IS NULL ORDER BY id').all();
    assert.deepEqual(assetsAfter, assetsBefore);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM concept_questions WHERE id='topic-question'").get().n, 1);
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview write helpers fail closed for production and foreign-session identifiers', async () => {
  const fixture = createFixture();
  try {
    const first = await createClone(fixture, 'preview-user-1');
    const second = await createClone(fixture, 'preview-user-2');

    await assert.rejects(
      updatePreviewCase(fixture.db, first.session.id, 'case-source', { title: 'Unsafe edit' }),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'NOT_OWNED'
    );
    await assert.rejects(
      updatePreviewCase(fixture.db, first.session.id, second.caseId, { title: 'Foreign edit' }),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'NOT_OWNED'
    );
    await assert.rejects(
      savePreviewCaseQuestion(fixture.db, first.session.id, first.caseId, {
        originalPromptId: 'prompt-shared-context',
        promptMd: 'Changed production prompt',
        answerMd: 'Unsafe',
        reusableForTopic: false
      }),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'NOT_OWNED'
    );
    await assert.rejects(
      savePreviewCaseQuestion(fixture.db, first.session.id, first.caseId, {
        promptMd: 'Preview-only question',
        answerMd: 'Preview-only answer',
        reusableForTopic: true
      }),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'GLOBAL_WRITE_BLOCKED'
    );
    assert.equal(fixture.sqlite.prepare("SELECT prompt_md FROM question_prompts WHERE id='prompt-shared-context'").get().prompt_md, 'What is the diagnosis?');

    const previewPromptId = fixture.sqlite.prepare('SELECT question_prompt_id FROM case_questions WHERE case_id=?').get(first.caseId).question_prompt_id;
    assert.throws(
      () => fixture.sqlite.prepare("INSERT INTO concept_questions (id, concept_id, question_prompt_id, answer_md, inherit_to_descendants, is_active) VALUES ('unsafe-topic-link','topic-1',?,'x',0,1)").run(previewPromptId),
      /Preview Question Prompts cannot be shared/
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('normal learner selection, counts and Review creation exclude Preview Cases', async () => {
  const fixture = createFixture();
  try {
    const { caseId } = await createClone(fixture);
    const eligible = await listEligibleCases(fixture.db, 'topic-1');
    assert.deepEqual(eligible.map((row) => row.id), ['case-source']);
    const concepts = await listStudyConcepts(fixture.db);
    assert.equal(concepts.find((row) => row.id === 'topic-1')?.caseCount, 1);

    const reviewId = await startReview({ db: fixture.db, userId: 'learner-1', conceptId: 'topic-1', rng: () => 0 });
    assert.ok(reviewId);
    assert.equal(fixture.sqlite.prepare('SELECT case_id FROM reviews WHERE id=?').get(reviewId).case_id, 'case-source');
    assert.throws(
      () => fixture.sqlite.prepare("INSERT INTO reviews (id,user_id,case_id,primary_concept_id,study_concept_id,case_title_snapshot,status) VALUES ('unsafe-review','learner-1',?,'topic-1','topic-1','Preview','started')").run(caseId),
      /Preview Cases cannot be used for learner Reviews/
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('normal Admin Case library excludes disposable Preview clones', async () => {
  const fixture = createFixture();
  try {
    await createClone(fixture);
    assert.deepEqual((await listAdminCases(fixture.db)).map((row) => row.id), ['case-source']);
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview uploads use isolated R2 keys and cleanup deletes only owned disposable data', async () => {
  const fixture = createFixture();
  try {
    const { session, caseId } = await createClone(fixture);
    const productionAssetsBefore = fixture.sqlite.prepare("SELECT * FROM assets WHERE preview_session_id IS NULL ORDER BY id").all();
    const file = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    Object.defineProperty(file, 'name', { value: 'preview.png' });

    const uploaded = await createPreviewAssetFromUpload(fixture.db, /** @type {any} */ (fixture.bucket), session.id, /** @type {any} */ (file), {
      altText: 'Disposable preview image'
    });
    assert.match(uploaded.storageKey, new RegExp(`^preview/${session.id}/[0-9a-f-]+\\.png$`));
    assert.equal(fixture.bucket.objects.has(uploaded.storageKey), true);
    assert.equal(fixture.sqlite.prepare('SELECT preview_session_id FROM assets WHERE id=?').get(uploaded.id).preview_session_id, session.id);

    await attachPreviewAsset(fixture.db, session.id, caseId, uploaded.id, 'Disposable caption');
    assert.deepEqual(fixture.sqlite.prepare("SELECT * FROM assets WHERE preview_session_id IS NULL ORDER BY id").all(), productionAssetsBefore);

    const result = await cleanupPreviewWorkspace({
      db: fixture.db,
      bucket: /** @type {any} */ (fixture.bucket),
      previewSessionId: session.id,
      userId: 'preview-user'
    });
    assert.equal(result.cleaned, true);
    assert.equal(fixture.bucket.deleted.includes(uploaded.storageKey), true);
    assert.equal(fixture.bucket.deleted.some((key) => key.startsWith('teaching-images/')), false);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) n FROM cases WHERE preview_session_id=?').get(session.id).n, 0);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) n FROM question_prompts WHERE preview_session_id=?').get(session.id).n, 0);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) n FROM assets WHERE preview_session_id=?').get(session.id).n, 0);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM cases WHERE id='case-source'").get().n, 1);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM assets WHERE id='asset-fixed'").get().n, 1);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM assets WHERE id='asset-option'").get().n, 1);

    const again = await cleanupPreviewWorkspace({
      db: fixture.db,
      bucket: /** @type {any} */ (fixture.bucket),
      previewSessionId: session.id,
      userId: 'preview-user'
    });
    assert.equal(again.alreadyClean, true);
  } finally {
    fixture.sqlite.close();
  }
});

test('partial cleanup marks cleanup_required and succeeds when retried', async () => {
  const fixture = createFixture();
  try {
    const { session } = await createClone(fixture);
    const file = new Blob([new Uint8Array([9, 8, 7])], { type: 'image/png' });
    Object.defineProperty(file, 'name', { value: 'retry.png' });
    await createPreviewAssetFromUpload(fixture.db, /** @type {any} */ (fixture.bucket), session.id, /** @type {any} */ (file), { altText: 'Retry preview image' });
    fixture.bucket.failNextDelete = true;

    await assert.rejects(
      cleanupPreviewWorkspace({ db: fixture.db, bucket: /** @type {any} */ (fixture.bucket), previewSessionId: session.id, userId: 'preview-user' }),
      /simulated R2 delete failure/
    );
    assert.equal(fixture.sqlite.prepare('SELECT status FROM preview_sessions WHERE id=?').get(session.id).status, 'cleanup_required');

    const retried = await cleanupPreviewWorkspace({ db: fixture.db, bucket: /** @type {any} */ (fixture.bucket), previewSessionId: session.id, userId: 'preview-user' });
    assert.equal(retried.cleaned, true);
    assert.equal(fixture.sqlite.prepare('SELECT status FROM preview_sessions WHERE id=?').get(session.id).status, 'cleaned');
  } finally {
    fixture.sqlite.close();
  }
});

test('expired abandoned workspace stays learner-invisible and is cleaned before a new workspace starts', async () => {
  const fixture = createFixture();
  try {
    const { session, caseId } = await createClone(fixture);
    fixture.sqlite.prepare('UPDATE preview_sessions SET expires_at=1 WHERE id=?').run(session.id);
    assert.equal((await listEligibleCases(fixture.db, 'topic-1')).some((row) => row.id === caseId), false);

    const next = await ensurePreviewWorkspace({
      db: fixture.db,
      bucket: /** @type {any} */ (fixture.bucket),
      userId: 'preview-user',
      now: 1_900_000_000_000
    });
    assert.notEqual(next.id, session.id);
    assert.equal(fixture.sqlite.prepare('SELECT status FROM preview_sessions WHERE id=?').get(session.id).status, 'cleaned');
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) n FROM cases WHERE preview_session_id=?').get(session.id).n, 0);
    assert.equal((await listPreviewCases(fixture.db, next.id)).length, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview-owned images cannot be fetched by a normal authenticated learner even with the Asset ID', async () => {
  const fixture = createFixture();
  try {
    const { session } = await createClone(fixture);
    const file = new Blob([new Uint8Array([1])], { type: 'image/png' });
    Object.defineProperty(file, 'name', { value: 'secret.png' });
    const uploaded = await createPreviewAssetFromUpload(fixture.db, /** @type {any} */ (fixture.bucket), session.id, /** @type {any} */ (file), { altText: 'Preview-only image' });

    const response = await getAssetImage({
      params: { assetId: uploaded.id },
      locals: { user: { id: 'learner', role: 'user' } },
      platform: { env: { DB: fixture.d1, MEDIA: fixture.bucket, PREVIEW_MODE: 'true' } },
      request: new Request(`https://preview.example/api/assets/${uploaded.id}/image`)
    });
    assert.equal(response.status, 404);
  } finally {
    fixture.sqlite.close();
  }
});

test('database ownership trigger blocks a Preview Asset from acquiring production usage', async () => {
  const fixture = createFixture();
  try {
    const { session } = await createClone(fixture);
    const file = new Blob([new Uint8Array([5, 5])], { type: 'image/png' });
    Object.defineProperty(file, 'name', { value: 'ambiguous.png' });
    const uploaded = await createPreviewAssetFromUpload(fixture.db, /** @type {any} */ (fixture.bucket), session.id, /** @type {any} */ (file), { altText: 'Ambiguous image' });

    assert.throws(
      () => fixture.sqlite.prepare("INSERT INTO case_assets (case_id,asset_id,display_order) VALUES ('case-source',?,1)").run(uploaded.id),
      /Preview Assets may only be attached/
    );
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM case_assets WHERE case_id='case-source' AND asset_id=?").get(uploaded.id).n, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('session lookup remains scoped to each Preview Admin owner', async () => {
  const fixture = createFixture();
  try {
    const first = await createPreviewSession(fixture.db, 'owner-1', Date.now());
    const second = await createPreviewSession(fixture.db, 'owner-2', Date.now());
    assert.equal((await getLivePreviewSession(fixture.db, 'owner-1'))?.id, first.id);
    assert.equal((await getLivePreviewSession(fixture.db, 'owner-2'))?.id, second.id);
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview image picker and multi-attach mutate only Preview-owned relationships', async () => {
  const fixture = createFixture();
  try {
    const { session, caseId } = await createClone(fixture, 'preview-image-owner');
    const second = await createClone(fixture, 'preview-image-other-owner');
    fixture.sqlite.prepare(`
      INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, source_label, is_active)
      VALUES ('asset-picker-production', 'image', 'teaching-images/picker-production.png', 'image/png', 'Picker production ECG.png', 'Production picker ECG', 'Archive', 1)
    `).run();
    const productionAssetBefore = fixture.sqlite.prepare("SELECT * FROM assets WHERE id='asset-picker-production'").get();
    const sourceRelationshipBefore = fixture.sqlite.prepare("SELECT * FROM case_assets WHERE case_id='case-source' AND asset_id='asset-fixed'").get();

    const picker = await listPreviewCaseImagePicker(fixture.db, session.id, caseId, { search: 'Picker production', limit: 10 });
    assert.deepEqual(picker.assets.map((asset) => asset.id), ['asset-picker-production']);
    assert.equal(picker.assets[0].previewSessionId, null);
    const loaded = await loadPreviewCaseEditor(fixture.db, session.id, caseId, { imagePickerOpen: true, imagePickerSearch: 'Picker production' });
    assert.equal(loaded.imagePicker.assets[0].id, 'asset-picker-production');

    await attachPreviewAssetsToCase(fixture.db, session.id, caseId, ['asset-picker-production']);
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) n FROM case_assets WHERE case_id=? AND asset_id='asset-picker-production'").get(caseId).n, 1);
    assert.deepEqual(fixture.sqlite.prepare("SELECT * FROM assets WHERE id='asset-picker-production'").get(), productionAssetBefore);
    assert.deepEqual(fixture.sqlite.prepare("SELECT * FROM case_assets WHERE case_id='case-source' AND asset_id='asset-fixed'").get(), sourceRelationshipBefore);

    const previewGroup = fixture.sqlite.prepare('SELECT id FROM stimulus_groups WHERE case_id=? LIMIT 1').get(caseId).id;
    const groupAsset = 'asset-picker-group-production';
    fixture.sqlite.prepare(`
      INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active)
      VALUES (?, 'image', ?, 'image/png', 'Group production ECG.png', 'Group production ECG', 1)
    `).run(groupAsset, `teaching-images/${groupAsset}.png`);
    await addPreviewAssetsToStimulusGroup(fixture.db, session.id, previewGroup, [groupAsset]);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) n FROM stimulus_group_options WHERE stimulus_group_id=? AND asset_id=?').get(previewGroup, groupAsset).n, 1);

    const option = fixture.sqlite.prepare('SELECT id FROM stimulus_group_options WHERE stimulus_group_id=? AND asset_id=?').get(previewGroup, 'asset-option');
    await updatePreviewStimulusOptionCaption(fixture.db, session.id, caseId, option.id, 'Preview-only caption');
    assert.equal(fixture.sqlite.prepare('SELECT caption_md FROM stimulus_group_options WHERE id=?').get(option.id).caption_md, 'Preview-only caption');
    assert.equal(fixture.sqlite.prepare("SELECT caption_md FROM stimulus_group_options WHERE id='option-source'").get().caption_md, 'Option-specific caption');

    await assert.rejects(
      () => addPreviewAssetsToStimulusGroup(fixture.db, session.id, 'group-source', [groupAsset]),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'NOT_OWNED'
    );
    const otherGroup = fixture.sqlite.prepare('SELECT id FROM stimulus_groups WHERE case_id=? LIMIT 1').get(second.caseId).id;
    await assert.rejects(
      () => addPreviewAssetsToStimulusGroup(fixture.db, session.id, otherGroup, [groupAsset]),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'NOT_OWNED'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview minimum-mode coverage blocks new images until set-wide coverage is sufficient', async () => {
  const fixture = createFixture();
  try {
    const { session, caseId } = await createClone(fixture, 'preview-minimum-owner');
    const groupId = fixture.sqlite.prepare('SELECT id FROM stimulus_groups WHERE case_id=?').get(caseId).id;
    fixture.sqlite.prepare('UPDATE stimulus_groups SET minimum_specific_questions=2 WHERE id=?').run(groupId);
    fixture.sqlite.prepare("INSERT INTO assets (id, type, storage_key, mime_type, original_filename, is_active) VALUES ('preview-minimum-blocked', 'image', 'teaching-images/preview-minimum-blocked.png', 'image/png', 'Blocked preview image', 1)").run();
    const beforeOptions = fixture.sqlite.prepare('SELECT * FROM stimulus_group_options WHERE stimulus_group_id=?').all(groupId);

    await assert.rejects(
      () => addPreviewAssetsToStimulusGroup(fixture.db, session.id, groupId, ['preview-minimum-blocked']),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'INVALID_INPUT' && /below this Preview set's minimum of 2/.test(error.message)
    );
    assert.deepEqual(fixture.sqlite.prepare('SELECT * FROM stimulus_group_options WHERE stimulus_group_id=?').all(groupId), beforeOptions);

    fixture.sqlite.prepare('UPDATE stimulus_groups SET minimum_specific_questions=1 WHERE id=?').run(groupId);
    const result = await addPreviewAssetsToStimulusGroup(fixture.db, session.id, groupId, ['preview-minimum-blocked']);
    assert.equal(result.addedCount, 1);
    assert.equal(fixture.sqlite.prepare('SELECT COUNT(*) n FROM stimulus_group_options WHERE stimulus_group_id=? AND asset_id=?').get(groupId, 'preview-minimum-blocked').n, 1);
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview image addition rejects inactive Preview Cases and inactive groups', async () => {
  const fixture = createFixture();
  try {
    const { session, caseId } = await createClone(fixture, 'preview-inactive-owner');
    const groupId = fixture.sqlite.prepare('SELECT id FROM stimulus_groups WHERE case_id=?').get(caseId).id;
    fixture.sqlite.prepare("INSERT INTO assets (id, type, storage_key, mime_type, original_filename, is_active) VALUES ('preview-inactive-input', 'image', 'teaching-images/preview-inactive-input.png', 'image/png', 'Inactive target input', 1)").run();
    const beforeOptions = fixture.sqlite.prepare('SELECT * FROM stimulus_group_options WHERE stimulus_group_id=?').all(groupId);

    fixture.sqlite.prepare('UPDATE cases SET is_active=0 WHERE id=?').run(caseId);
    await assert.rejects(
      () => addPreviewAssetsToStimulusGroup(fixture.db, session.id, groupId, ['preview-inactive-input']),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'INVALID_INPUT' && /Preview Case is inactive/.test(error.message)
    );
    fixture.sqlite.prepare('UPDATE cases SET is_active=1 WHERE id=?').run(caseId);

    fixture.sqlite.prepare('UPDATE stimulus_groups SET is_active=0 WHERE id=?').run(groupId);
    await assert.rejects(
      () => addPreviewAssetsToStimulusGroup(fixture.db, session.id, groupId, ['preview-inactive-input']),
      (error) => error instanceof PreviewWorkspaceError && error.code === 'INVALID_INPUT' && /alternative set is inactive/.test(error.message)
    );
    assert.deepEqual(fixture.sqlite.prepare('SELECT * FROM stimulus_group_options WHERE stimulus_group_id=?').all(groupId), beforeOptions);
  } finally {
    fixture.sqlite.close();
  }
});
