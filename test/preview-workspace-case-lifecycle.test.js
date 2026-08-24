// Focused characterization coverage for Preview Case lifecycle behavior.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  addPreviewSecondaryTopic,
  cloneCaseToPreview,
  createPreviewSession,
  listPreviewCases,
  listProductionCasesForPreview,
  PreviewWorkspaceError,
  promotePreviewTopic,
  removePreviewSecondaryTopic,
  updatePreviewCase,
  updatePreviewCaseVignette
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

function createFixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, is_active) VALUES
      ('topic-primary', 'Cardiology', 'cardiology', 1),
      ('topic-secondary', 'Emergency Medicine', 'emergency-medicine', 1),
      ('topic-third', 'General Medicine', 'general-medicine', 1),
      ('topic-inactive', 'Inactive Topic', 'inactive-topic', 0);

    INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, is_active) VALUES
      ('case-source', 'Source STEMI', 'Production vignette', 'fixed', 3, 1),
      ('case-inactive', 'Inactive source', 'Inactive vignette', 'automatic', NULL, 0);

    INSERT INTO case_concepts (case_id, concept_id, role) VALUES
      ('case-source', 'topic-primary', 'primary'),
      ('case-inactive', 'topic-primary', 'primary');

    INSERT INTO tags (id, name, normalized_name, is_active)
    VALUES ('tag-cross-cutting', 'Cross-cutting concept', 'cross-cutting concept', 1);
    INSERT INTO case_tags (case_id, tag_id)
    VALUES ('case-source', 'tag-cross-cutting');
  `);
  const db = /** @type {LearningDb} */ (createDb(/** @type {any} */ (createD1(sqlite))));
  return { sqlite, db };
}

async function createClone(fixture, userId = 'owner-a', sourceCaseId = 'case-source') {
  const session = await createPreviewSession(fixture.db, userId, 1_800_000_000_000);
  const caseId = await cloneCaseToPreview(fixture.db, {
    previewSessionId: session.id,
    userId,
    sourceCaseId
  });
  return { session, caseId };
}

async function expectPreviewError(promise, code, message) {
  await assert.rejects(
    promise,
    (error) => error instanceof PreviewWorkspaceError && error.code === code && error.message === message
  );
}

test('Preview Case listing and cloning preserve the source contract, canonical Topic, and Case Tags', async () => {
  const fixture = createFixture();
  try {
    assert.deepEqual((await listProductionCasesForPreview(fixture.db)).map((row) => row.id), ['case-source']);
    assert.deepEqual((await listProductionCasesForPreview(fixture.db, 'stemi')).map((row) => row.id), ['case-source']);
    assert.deepEqual(await listProductionCasesForPreview(fixture.db, 'inactive'), []);

    const sourceBefore = fixture.sqlite.prepare("SELECT * FROM cases WHERE id='case-source'").get();
    const { session, caseId } = await createClone(fixture);
    const clone = fixture.sqlite.prepare('SELECT * FROM cases WHERE id=?').get(caseId);

    assert.equal(clone.preview_session_id, session.id);
    assert.equal(clone.title, sourceBefore.title);
    assert.equal(clone.vignette_md, sourceBefore.vignette_md);
    assert.equal(clone.question_selection_mode, sourceBefore.question_selection_mode);
    assert.equal(clone.question_count, sourceBefore.question_count);
    assert.equal(clone.is_active, sourceBefore.is_active);
    assert.deepEqual(fixture.sqlite.prepare("SELECT * FROM cases WHERE id='case-source'").get(), sourceBefore);
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT concept_id, role FROM case_concepts WHERE case_id=?').all(caseId).map((row) => ({ ...row })),
      [{ concept_id: 'topic-primary', role: 'primary' }]
    );
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT tag_id FROM case_tags WHERE case_id=?').all(caseId).map((row) => row.tag_id),
      ['tag-cross-cutting']
    );
    assert.deepEqual((await listPreviewCases(fixture.db, session.id)).map((row) => row.id), [caseId]);
    assert.deepEqual((await listProductionCasesForPreview(fixture.db)).map((row) => row.id), ['case-source']);
  } finally {
    fixture.sqlite.close();
  }
});

test('inactive production Cases stay hidden from the picker but retain the existing direct-clone behavior', async () => {
  const fixture = createFixture();
  try {
    assert.equal((await listProductionCasesForPreview(fixture.db)).some((row) => row.id === 'case-inactive'), false);
    const { session, caseId } = await createClone(fixture, 'inactive-owner', 'case-inactive');
    const clone = fixture.sqlite.prepare('SELECT preview_session_id, is_active FROM cases WHERE id=?').get(caseId);
    assert.equal(clone.preview_session_id, session.id);
    assert.equal(clone.is_active, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview Case cloning preserves session ownership and existing invalid-session/source errors', async () => {
  const fixture = createFixture();
  try {
    const session = await createPreviewSession(fixture.db, 'owner-a', 1_800_000_000_000);

    await expectPreviewError(
      cloneCaseToPreview(fixture.db, {
        previewSessionId: session.id,
        userId: 'owner-b',
        sourceCaseId: 'case-source'
      }),
      'NOT_OWNED',
      'The Preview workspace does not belong to this user.'
    );

    await expectPreviewError(
      cloneCaseToPreview(fixture.db, {
        previewSessionId: session.id,
        userId: 'owner-a',
        sourceCaseId: 'missing-source'
      }),
      'INVALID_SOURCE',
      'Choose an existing production Case to copy.'
    );

    fixture.sqlite.prepare("UPDATE preview_sessions SET status='cleanup_required' WHERE id=?").run(session.id);
    await expectPreviewError(
      cloneCaseToPreview(fixture.db, {
        previewSessionId: session.id,
        userId: 'owner-a',
        sourceCaseId: 'case-source'
      }),
      'CLEANUP_REQUIRED',
      'The Preview workspace must be cleaned before it can be used.'
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Preview Case metadata and Primary Topic replacement stay inside the owning workspace', async () => {
  const fixture = createFixture();
  try {
    const first = await createClone(fixture, 'owner-a');
    const second = await createClone(fixture, 'owner-b');

    await updatePreviewCase(fixture.db, first.session.id, first.caseId, {
      title: 'Edited Preview STEMI',
      vignetteMd: 'Edited Preview vignette',
      questionSelectionMode: 'fixed',
      questionCount: 2,
      conceptId: 'topic-secondary'
    });
    let row = fixture.sqlite.prepare('SELECT title, vignette_md, question_selection_mode, question_count FROM cases WHERE id=?').get(first.caseId);
    assert.deepEqual({ ...row }, {
      title: 'Edited Preview STEMI',
      vignette_md: 'Edited Preview vignette',
      question_selection_mode: 'fixed',
      question_count: 2
    });
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT concept_id, role FROM case_concepts WHERE case_id=?').all(first.caseId).map((topicRow) => ({ ...topicRow })),
      [{ concept_id: 'topic-secondary', role: 'primary' }]
    );

    await updatePreviewCaseVignette(fixture.db, first.session.id, first.caseId, null);
    row = fixture.sqlite.prepare('SELECT vignette_md FROM cases WHERE id=?').get(first.caseId);
    assert.equal(row.vignette_md, null);

    await promotePreviewTopic(fixture.db, first.session.id, first.caseId, 'topic-third');
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT concept_id, role FROM case_concepts WHERE case_id=?').all(first.caseId).map((topicRow) => ({ ...topicRow })),
      [{ concept_id: 'topic-third', role: 'primary' }]
    );

    for (const operation of [addPreviewSecondaryTopic, removePreviewSecondaryTopic]) {
      await expectPreviewError(
        operation(fixture.db, first.session.id, first.caseId, 'topic-secondary'),
        'INVALID_INPUT',
        'Additional Study Topics are no longer supported. Use Case Tags for alternate or cross-cutting classification.'
      );
    }
    await expectPreviewError(
      promotePreviewTopic(fixture.db, first.session.id, first.caseId, 'topic-inactive'),
      'INVALID_INPUT',
      'Choose an active Topic.'
    );
    await expectPreviewError(
      updatePreviewCase(fixture.db, first.session.id, second.caseId, { title: 'Foreign edit' }),
      'NOT_OWNED',
      'This Case is not owned by the current Preview workspace.'
    );

    assert.equal(fixture.sqlite.prepare("SELECT title FROM cases WHERE id='case-source'").get().title, 'Source STEMI');
    assert.equal(fixture.sqlite.prepare('SELECT title FROM cases WHERE id=?').get(second.caseId).title, 'Source STEMI');
  } finally {
    fixture.sqlite.close();
  }
});

test('legacy non-primary Topic rows block silent Preview Primary replacement', async () => {
  const fixture = createFixture();
  try {
    const { session, caseId } = await createClone(fixture, 'legacy-owner');
    fixture.sqlite.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, 'topic-secondary', 'secondary')").run(caseId);
    await expectPreviewError(
      promotePreviewTopic(fixture.db, session.id, caseId, 'topic-third'),
      'INVALID_INPUT',
      'This Preview Case still has a legacy non-primary Topic relationship. Re-copy it after the reviewed Topic-to-Tag migration.'
    );
  } finally {
    fixture.sqlite.close();
  }
});