// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createServer } from 'vite';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import { buildAdminStudyPreview, buildDirectAdminStudyPreview } from '../src/lib/server/learning/admin-study-preview.js';
import { applyCurrentSchema } from './current-schema.js';

const LEARNER_RUNTIME_TABLES = Object.freeze([
  'learner_preferences',
  'learner_fsrs_profiles',
  'learner_case_fsrs',
  'learner_case_encounters',
  'scheduled_review_events',
  'learner_optimizer_evidence',
  'learner_aggregates',
  'learner_system_aggregates',
  'active_reviews',
  'active_review_questions',
  'active_review_assets',
  'free_review_completion_receipts',
  'reviews',
  'review_questions',
  'review_assets'
]);

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(buildSeedSql());
  // Add a real top-level System and move the existing seed Topic tree beneath it.
  // Do not reclassify a Topic that already owns Cases/questions: current taxonomy
  // guards correctly reject that mutation.
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)
    VALUES ('preview-system', 'Preview System', 'preview-system', 'system', NULL, 1);
    UPDATE concepts SET parent_id = 'preview-system' WHERE id = 'seed-stemi';
  `);

  const d1 = {
    prepare(sql) {
      return {
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
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  };
  return { sqlite, db: createDb(d1), d1 };
}

function learnerCounts(sqlite) {
  return Object.fromEntries(LEARNER_RUNTIME_TABLES.map((table) => [
    table,
    Number(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n ?? -1)
  ]));
}

function totalChanges(sqlite) {
  return Number(sqlite.prepare('SELECT total_changes() AS n').get()?.n ?? -1);
}

function learnerStateSnapshot(sqlite) {
  return Object.fromEntries(LEARNER_RUNTIME_TABLES.map((table) => [
    table,
    sqlite.prepare(`SELECT * FROM \`${table}\` ORDER BY rowid`).all()
  ]));
}

test('Admin Study Preview resolves current learner content without mutating any learner FSRS/Free state', async () => {
  const { sqlite, db } = fixture();
  try {
    const beforeCounts = learnerCounts(sqlite);
    const beforeChanges = totalChanges(sqlite);

    const preview = await buildAdminStudyPreview({
      db,
      systemId: 'preview-system',
      routes: [{ routeType: 'topic', routeId: 'seed-anterior-stemi' }],
      caseId: 'seed-anterior-a',
      contentMode: 'expanded',
      rng: () => 0
    });

    assert.equal(preview.systemId, 'preview-system');
    assert.equal(preview.candidate.id, 'seed-anterior-a');
    assert.equal(preview.snapshot.case.id, 'seed-anterior-a');
    assert.ok(preview.snapshot.questions.length > 0);
    assert.ok(preview.snapshot.assets.length > 0);

    assert.equal(totalChanges(sqlite), beforeChanges, 'preview resolution must execute no database writes');
    assert.deepEqual(learnerCounts(sqlite), beforeCounts);
  } finally {
    sqlite.close();
  }
});

test('direct Case Editor Study Preview resolves the exact Case without mutating learner state', async () => {
  const { sqlite, db } = fixture();
  try {
    const beforeCounts = learnerCounts(sqlite);
    const beforeChanges = totalChanges(sqlite);

    const preview = await buildDirectAdminStudyPreview({
      db,
      caseId: 'seed-anterior-a',
      contentMode: 'original',
      rng: () => 0
    });

    assert.equal(preview.candidate.id, 'seed-anterior-a');
    assert.equal(preview.snapshot.case.id, 'seed-anterior-a');
    assert.ok(preview.snapshot.questions.length > 0);
    assert.equal(totalChanges(sqlite), beforeChanges, 'direct preview resolution must execute no database writes');
    assert.deepEqual(learnerCounts(sqlite), beforeCounts);
  } finally {
    sqlite.close();
  }
});

test('direct Study Preview resolves a Primary Topic with no System ancestry', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("UPDATE concepts SET parent_id = NULL WHERE id = 'seed-stemi'");
    const beforeCounts = learnerCounts(sqlite);
    const beforeChanges = totalChanges(sqlite);

    const preview = await buildDirectAdminStudyPreview({
      db,
      caseId: 'seed-anterior-a',
      contentMode: 'original',
      rng: () => 0
    });

    assert.equal(preview.candidate.id, 'seed-anterior-a');
    assert.equal(preview.candidate.studyConceptId, 'seed-anterior-stemi');
    assert.equal(preview.snapshot.case.id, 'seed-anterior-a');
    assert.ok(preview.snapshot.questions.some((question) => question.questionPromptId === 'seed-prompt-describe-ecg'));
    assert.ok(preview.snapshot.assets.some((asset) => asset.assetId === 'seed-asset-anterior-a'));
    assert.equal(totalChanges(sqlite), beforeChanges);
    assert.deepEqual(learnerCounts(sqlite), beforeCounts);
  } finally {
    sqlite.close();
  }
});

test('direct Admin preview uses saved Case-specific Original content when no usable Primary Topic exists', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("DELETE FROM case_concepts WHERE case_id = 'seed-anterior-a'");
    const beforeCounts = learnerCounts(sqlite);
    const beforeChanges = totalChanges(sqlite);

    const preview = await buildDirectAdminStudyPreview({
      db,
      caseId: 'seed-anterior-a',
      contentMode: 'original',
      rng: () => 0
    });

    assert.equal(preview.candidate.id, 'seed-anterior-a');
    assert.equal(preview.candidate.studyConceptId, null);
    assert.equal(preview.snapshot.case.id, 'seed-anterior-a');
    assert.deepEqual(preview.snapshot.questions.map((question) => question.questionPromptId), ['seed-prompt-describe-ecg']);
    assert.equal(preview.snapshot.questions[0].answerSnapshotMd, 'ST elevation in V1–V4 with reciprocal inferior ST depression.');
    assert.equal(preview.snapshot.assets[0].assetId, 'seed-asset-anterior-a');
    assert.equal(preview.snapshot.assets[0].imageUrl, '/api/assets/seed-asset-anterior-a/image');
    assert.equal(totalChanges(sqlite), beforeChanges);
    assert.deepEqual(learnerCounts(sqlite), beforeCounts);
  } finally {
    sqlite.close();
  }
});

test('direct Admin preview explains when a Case without a Primary Topic has no saved Original questions', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec("DELETE FROM case_concepts WHERE case_id = 'seed-anterior-a'; UPDATE case_questions SET is_active = 0 WHERE case_id = 'seed-anterior-a'");

    await assert.rejects(
      () => buildDirectAdminStudyPreview({ db, caseId: 'seed-anterior-a', contentMode: 'original', rng: () => 0 }),
      /no active Production Case-specific Original questions/
    );
  } finally {
    sqlite.close();
  }
});

test('direct Case Editor Study Preview fails instead of falling back to another Case', async () => {
  const { sqlite, db } = fixture();
  try {
    await assert.rejects(
      () => buildDirectAdminStudyPreview({ db, caseId: 'missing-case', contentMode: 'original', rng: () => 0 }),
      /active Production Case is unavailable for direct Admin preview/
    );
  } finally {
    sqlite.close();
  }
});

test('direct Study Preview route load resolves the exact Case, preserves return context, and stays read-only', async () => {
  const fixtureValue = fixture();
  const vite = await createServer();
  try {
    const route = await vite.ssrLoadModule('/src/routes/admin/study-preview/+page.server.js');
    const returnQuery = 'q=ecg&sort=topic-desc&lifecycle=active&page=4';
    const url = new URL('http://localhost/admin/study-preview');
    url.searchParams.set('mode', 'direct');
    url.searchParams.set('caseId', 'seed-anterior-a');
    url.searchParams.set('return_query', returnQuery);
    const before = learnerStateSnapshot(fixtureValue.sqlite);
    const beforeChanges = totalChanges(fixtureValue.sqlite);

    const data = await route.load({ platform: { env: { DB: fixtureValue.d1 } }, url });

    assert.equal(data.directMode, true);
    assert.equal(data.directCaseId, 'seed-anterior-a');
    assert.equal(data.preview.candidate.id, 'seed-anterior-a');
    assert.equal(data.preview.snapshot.case.id, 'seed-anterior-a');
    assert.equal(new URL(data.directBackHref, url).searchParams.get('return_query'), returnQuery);
    assert.equal(totalChanges(fixtureValue.sqlite), beforeChanges);
    assert.deepEqual(learnerStateSnapshot(fixtureValue.sqlite), before);
  } finally {
    await vite.close();
    fixtureValue.sqlite.close();
  }
});

test('direct Study Preview route loads a saved Case whose Primary Topic has no System ancestry', async () => {
  const fixtureValue = fixture();
  const vite = await createServer();
  try {
    fixtureValue.sqlite.exec("UPDATE concepts SET parent_id = NULL WHERE id = 'seed-stemi'");
    const route = await vite.ssrLoadModule('/src/routes/admin/study-preview/+page.server.js');
    const returnQuery = 'q=unassigned&sort=case-asc&page=2';
    const url = new URL('http://localhost/admin/study-preview');
    url.searchParams.set('mode', 'direct');
    url.searchParams.set('caseId', 'seed-anterior-a');
    url.searchParams.set('return_query', returnQuery);
    const before = learnerStateSnapshot(fixtureValue.sqlite);
    const beforeChanges = totalChanges(fixtureValue.sqlite);

    const data = await route.load({ platform: { env: { DB: fixtureValue.d1 } }, url });

    assert.equal(data.directMode, true);
    assert.equal(data.directCaseId, 'seed-anterior-a');
    assert.equal(data.preview.candidate.studyConceptId, 'seed-anterior-stemi');
    assert.equal(data.preview.snapshot.case.id, 'seed-anterior-a');
    assert.equal(new URL(data.directBackHref, url).searchParams.get('return_query'), returnQuery);
    assert.equal(totalChanges(fixtureValue.sqlite), beforeChanges);
    assert.deepEqual(learnerStateSnapshot(fixtureValue.sqlite), before);
  } finally {
    await vite.close();
    fixtureValue.sqlite.close();
  }
});

test('Case Editor return route and direct preview both support saved Case questions without a Primary Topic', async () => {
  const fixtureValue = fixture();
  const vite = await createServer();
  try {
    fixtureValue.sqlite.exec("DELETE FROM case_concepts WHERE case_id = 'seed-anterior-a'");
    const before = learnerStateSnapshot(fixtureValue.sqlite);
    const beforeChanges = totalChanges(fixtureValue.sqlite);
    const editorRoute = await vite.ssrLoadModule('/src/routes/admin/cases/[caseId]/+page.server.js');
    const editorUrl = new URL('http://localhost/admin/cases/seed-anterior-a');
    const editor = await editorRoute.load({
      locals: { user: { id: 'local-admin', role: 'admin' } },
      platform: { env: { DB: fixtureValue.d1 } },
      params: { caseId: 'seed-anterior-a' },
      url: editorUrl
    });
    assert.equal(editor.selectedCase.case.id, 'seed-anterior-a');
    assert.deepEqual(editor.selectedCase.questions.map((question) => question.questionPromptId), ['seed-prompt-describe-ecg']);
    assert.equal(editor.selectedCase.questions[0].reusableForTopic, false);

    const previewRoute = await vite.ssrLoadModule('/src/routes/admin/study-preview/+page.server.js');
    const previewUrl = new URL('http://localhost/admin/study-preview?mode=direct&caseId=seed-anterior-a');
    const preview = await previewRoute.load({ platform: { env: { DB: fixtureValue.d1 } }, url: previewUrl });
    assert.equal(preview.preview.candidate.studyConceptId, null);
    assert.equal(preview.preview.snapshot.case.id, 'seed-anterior-a');
    assert.equal(preview.preview.snapshot.questions[0].questionPromptId, 'seed-prompt-describe-ecg');
    assert.equal(new URL(preview.directBackHref, previewUrl).pathname, editorUrl.pathname);
    assert.equal(totalChanges(fixtureValue.sqlite), beforeChanges);
    assert.deepEqual(learnerStateSnapshot(fixtureValue.sqlite), before);
  } finally {
    await vite.close();
    fixtureValue.sqlite.close();
  }
});

test('direct Study Preview route renders expected unavailability but propagates unexpected failures', async () => {
  const fixtureValue = fixture();
  const vite = await createServer();
  try {
    const route = await vite.ssrLoadModule('/src/routes/admin/study-preview/+page.server.js');
    const missingUrl = new URL('http://localhost/admin/study-preview?mode=direct&caseId=missing-case');
    const unavailable = await route.load({ platform: { env: { DB: fixtureValue.d1 } }, url: missingUrl });
    assert.equal(unavailable.preview, null);
    assert.match(unavailable.directError, /active Production Case is unavailable for direct Admin preview/);

    fixtureValue.sqlite.exec("DELETE FROM case_concepts WHERE case_id = 'seed-anterior-a'; UPDATE case_questions SET is_active = 0 WHERE case_id = 'seed-anterior-a'");
    const returnQuery = 'q=unassigned&sort=case-asc&page=2';
    const noContentUrl = new URL('http://localhost/admin/study-preview?mode=direct&caseId=seed-anterior-a');
    noContentUrl.searchParams.set('return_query', returnQuery);
    const noContent = await route.load({ platform: { env: { DB: fixtureValue.d1 } }, url: noContentUrl });
    assert.equal(noContent.preview, null);
    assert.match(noContent.directError, /no active Production Case-specific Original questions/);
    assert.equal(new URL(noContent.directBackHref, noContentUrl).searchParams.get('return_query'), returnQuery);

    const brokenDb = { prepare() { throw new Error('unexpected-preview-database-failure'); } };
    await assert.rejects(
      () => route.load({ platform: { env: { DB: brokenDb } }, url: missingUrl }),
      /unexpected-preview-database-failure/
    );
  } finally {
    await vite.close();
    fixtureValue.sqlite.close();
  }
});
