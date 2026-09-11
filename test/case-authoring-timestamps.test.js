import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { formatCaseAuthoringDate, formatCaseAuthoringDateTime } from '../src/lib/case-authoring-dates.js';
import { createConcept, promoteCaseTopic, updateCase } from '../src/lib/server/db/admin-content.js';
import { attachAssetToCase, getAdminCaseData } from '../src/lib/server/db/case-assets.js';
import { touchProductionCaseUpdatedAt } from '../src/lib/server/db/case-authoring-timestamps.js';
import { getCaseLibraryPage } from '../src/lib/server/db/case-library.js';
import { deactivateProductionCase, restoreProductionCase } from '../src/lib/server/db/case-lifecycle.ts';
import { saveCaseQuestion } from '../src/lib/server/db/case-questions.js';
import { bulkAddCaseTag } from '../src/lib/server/db/case-tag-authoring.ts';
import { createDb } from '../src/lib/server/db/index.js';
import { createStimulusGroup } from '../src/lib/server/db/stimulus-groups.js';
import { addCaseTag, createTag, renameTag } from '../src/lib/server/db/tag-library.js';
import { buildSeedSql } from '../scripts/seed-content.mjs';
import { applyCurrentSchema } from './current-schema.js';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(buildSeedSql());
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
  return { db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (d1))), sqlite };
}

/** @param {DatabaseSync} sqlite @param {string} caseId @param {number} createdAt @param {number} updatedAt */
function setCaseTimes(sqlite, caseId, createdAt, updatedAt) {
  sqlite.prepare('UPDATE cases SET created_at = ?, updated_at = ? WHERE id = ?').run(createdAt, updatedAt, caseId);
}

/** @param {DatabaseSync} sqlite @param {string} caseId */
function caseTimes(sqlite, caseId) {
  return /** @type {{ created_at: number, updated_at: number }} */ (
    sqlite.prepare('SELECT created_at, updated_at FROM cases WHERE id = ?').get(caseId)
  );
}

/** @param {DatabaseSync} sqlite @param {string} caseId */
function currentCase(sqlite, caseId) {
  return /** @type {{ title: string, vignette_md: string | null, question_selection_mode: string, question_count: number | null }} */ (
    sqlite.prepare('SELECT title, vignette_md, question_selection_mode, question_count FROM cases WHERE id = ?').get(caseId)
  );
}

test('core Case authoring advances Last edited, preserves Added, and identical replay is a no-op', async () => {
  const fixture = createLearningDb();
  try {
    const caseId = 'seed-anterior-a';
    setCaseTimes(fixture.sqlite, caseId, 1_000, 2_000);
    const current = currentCase(fixture.sqlite, caseId);

    await updateCase(fixture.db, {
      caseId,
      title: `${current.title} — revised`,
      vignetteMd: current.vignette_md,
      questionSelectionMode: current.question_selection_mode,
      questionCount: current.question_count
    });

    const edited = caseTimes(fixture.sqlite, caseId);
    assert.equal(edited.created_at, 1_000);
    assert.ok(edited.updated_at > 2_000);

    await updateCase(fixture.db, {
      caseId,
      title: `${current.title} — revised`,
      vignetteMd: current.vignette_md,
      questionSelectionMode: current.question_selection_mode,
      questionCount: current.question_count
    });
    assert.equal(caseTimes(fixture.sqlite, caseId).updated_at, edited.updated_at);
  } finally {
    fixture.sqlite.close();
  }
});

test('representative Topic, Tag, Case Question, fixed-image, and stimulus authoring refreshes Case recency', async () => {
  const fixture = createLearningDb();
  try {
    const caseId = 'seed-anterior-a';

    const topic = await createConcept(fixture.db, 'Timestamp test Topic');
    setCaseTimes(fixture.sqlite, caseId, 1_000, 2_000);
    await promoteCaseTopic(fixture.db, { caseId, conceptId: topic.id });
    assert.ok(caseTimes(fixture.sqlite, caseId).updated_at > 2_000);

    const tag = await createTag(fixture.db, 'Timestamp test Tag');
    setCaseTimes(fixture.sqlite, caseId, 1_000, 2_000);
    await addCaseTag(fixture.db, { caseId, tagId: tag.id });
    assert.ok(caseTimes(fixture.sqlite, caseId).updated_at > 2_000);

    setCaseTimes(fixture.sqlite, caseId, 1_000, 2_000);
    await saveCaseQuestion(fixture.db, {
      caseId,
      promptMd: 'Timestamp test Case question?',
      answerMd: 'Timestamp test answer.',
      reusableForTopic: false
    });
    assert.ok(caseTimes(fixture.sqlite, caseId).updated_at > 2_000);

    setCaseTimes(fixture.sqlite, caseId, 1_000, 2_000);
    await attachAssetToCase(fixture.db, caseId, 'seed-asset-anterior-b');
    assert.ok(caseTimes(fixture.sqlite, caseId).updated_at > 2_000);

    setCaseTimes(fixture.sqlite, caseId, 1_000, 2_000);
    await createStimulusGroup(fixture.db, { caseId, name: 'Timestamp alternatives', specificQuestionMode: 'none' });
    assert.ok(caseTimes(fixture.sqlite, caseId).updated_at > 2_000);
  } finally {
    fixture.sqlite.close();
  }
});

test('bulk Case Tag authoring timestamps only the changed subset already identified by the writer', async () => {
  const fixture = createLearningDb();
  try {
    const tag = await createTag(fixture.db, 'Bulk timestamp Tag');
    await addCaseTag(fixture.db, { caseId: 'seed-anterior-a', tagId: tag.id });
    setCaseTimes(fixture.sqlite, 'seed-anterior-a', 1_000, 11_000);
    setCaseTimes(fixture.sqlite, 'seed-anterior-b', 2_000, 22_000);

    const result = await bulkAddCaseTag(fixture.db, {
      caseIds: ['seed-anterior-a', 'seed-anterior-b'],
      tagId: tag.id
    });
    assert.equal(result.changedCount, 1);
    assert.equal(caseTimes(fixture.sqlite, 'seed-anterior-a').updated_at, 11_000);
    assert.ok(caseTimes(fixture.sqlite, 'seed-anterior-b').updated_at > 22_000);

    const afterB = caseTimes(fixture.sqlite, 'seed-anterior-b').updated_at;
    const repeated = await bulkAddCaseTag(fixture.db, {
      caseIds: ['seed-anterior-a', 'seed-anterior-b'],
      tagId: tag.id
    });
    assert.equal(repeated.changedCount, 0);
    assert.equal(caseTimes(fixture.sqlite, 'seed-anterior-a').updated_at, 11_000);
    assert.equal(caseTimes(fixture.sqlite, 'seed-anterior-b').updated_at, afterB);
  } finally {
    fixture.sqlite.close();
  }
});

test('global Tag maintenance and Case lifecycle changes do not fan out authoring recency', async () => {
  const fixture = createLearningDb();
  try {
    const caseId = 'seed-anterior-a';
    const tag = await createTag(fixture.db, 'Global metadata Tag');
    await addCaseTag(fixture.db, { caseId, tagId: tag.id });
    setCaseTimes(fixture.sqlite, caseId, 1_000, 44_000);

    await renameTag(fixture.db, { tagId: tag.id, name: 'Renamed global metadata Tag' });
    assert.equal(caseTimes(fixture.sqlite, caseId).updated_at, 44_000);

    await deactivateProductionCase(fixture.db, caseId);
    assert.equal(caseTimes(fixture.sqlite, caseId).updated_at, 44_000);
    await restoreProductionCase(fixture.db, caseId);
    assert.equal(caseTimes(fixture.sqlite, caseId).updated_at, 44_000);
  } finally {
    fixture.sqlite.close();
  }
});

test('Production timestamp helper does not touch Preview-owned Cases', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec(`
      INSERT INTO preview_sessions (id, user_id, status, expires_at)
      VALUES ('timestamp-preview', 'timestamp-user', 'active', 4102444800000);
      INSERT INTO cases (id, title, preview_session_id, is_active, created_at, updated_at)
      VALUES ('timestamp-preview-case', 'Preview timestamp Case', 'timestamp-preview', 1, 1000, 2000);
    `);
    await touchProductionCaseUpdatedAt(fixture.db, 'timestamp-preview-case', new Date(99_000));
    assert.equal(caseTimes(fixture.sqlite, 'timestamp-preview-case').updated_at, 2_000);
  } finally {
    fixture.sqlite.close();
  }
});

test('sequential post-commit timestamp failures are logged and swallowed as best-effort metadata', async () => {
  const error = new Error('timestamp write failed');
  const logged = /** @type {any[][]} */ ([]);
  const originalConsoleError = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const fakeDb = /** @type {any} */ ({
      update() {
        return {
          set() { return this; },
          where() { return Promise.reject(error); }
        };
      }
    });
    const result = await touchProductionCaseUpdatedAt(fakeDb, 'case-a', new Date(10_000));
    assert.equal(result, false);
    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], 'Unable to update Case authoring timestamp.');
    assert.equal(logged[0][1], error);
  } finally {
    console.error = originalConsoleError;
  }
});

test('Case Library/editor read models expose timestamps without extra per-Case reads', async () => {
  const fixture = createLearningDb();
  try {
    const page = await getCaseLibraryPage(fixture.db, {
      search: '', topicId: '', systemId: '', tagId: '', sort: 'case-asc', lifecycle: 'active'
    });
    const libraryCase = page.rows.find((row) => row.id === 'seed-anterior-a');
    assert.ok(libraryCase?.createdAt instanceof Date);
    assert.ok(libraryCase?.updatedAt instanceof Date);

    const editor = await getAdminCaseData(fixture.db, 'seed-anterior-a', { includeAvailable: false });
    assert.ok(editor?.case.createdAt instanceof Date);
    assert.ok(editor?.case.updatedAt instanceof Date);
  } finally {
    fixture.sqlite.close();
  }
});

test('Singapore Case-authoring date formatting is deterministic', () => {
  assert.equal(formatCaseAuthoringDate('2026-09-02T16:00:00.000Z'), '3 Sep 2026');
  assert.equal(formatCaseAuthoringDateTime('2026-09-09T13:42:00.000Z'), '9 Sep 2026, 21:42 SGT');
});

test('Admin Case Library and Production Case Editor render the requested timestamp metadata', () => {
  const librarySource = readFileSync(new URL('../src/routes/admin/cases/+page.svelte', import.meta.url), 'utf8');
  const headerSource = readFileSync(new URL('../src/lib/components/case-editor/CaseEditorHeader.svelte', import.meta.url), 'utf8');

  assert.match(librarySource, /Added \{formatCaseAuthoringDate\(item\.createdAt\)\} · Edited \{formatCaseAuthoringDate\(item\.updatedAt\)\}/);
  assert.match(headerSource, /\{#if !previewMode\}<p class="muted authoring-dates">Added \{formatCaseAuthoringDate\(selectedCase\.case\.createdAt\)\} · Last edited \{formatCaseAuthoringDateTime\(selectedCase\.case\.updatedAt\)\}/);
});
