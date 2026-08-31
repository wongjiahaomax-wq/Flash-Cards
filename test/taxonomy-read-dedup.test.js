import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { getTaxonomyWorkspaceLibrary } from '../src/lib/server/db/taxonomy-admin-read.ts';
import { applyCurrentSchema } from './current-schema.js';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */
/** @typedef {{ sql: string, params: any[] }} RecordedQuery */

const topicsRoute = readFileSync(new URL('../src/routes/admin/topics/+page.server.js', import.meta.url), 'utf8');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  /** @type {RecordedQuery[]} */
  const preparedQueries = [];
  const d1 = {
    /** @param {string} sql */
    prepare(sql) {
      /** @type {RecordedQuery} */
      const recorded = { sql, params: [] };
      preparedQueries.push(recorded);
      return {
        /** @param {...any} params */
        bind(...params) {
          recorded.params = params;
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
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    }
  };
  return {
    db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))),
    sqlite,
    preparedQueries
  };
}

/** @param {RecordedQuery[]} preparedQueries @param {string} table */
function queriesFrom(preparedQueries, table) {
  return preparedQueries.filter((query) => query.sql.includes(`from "${table}"`));
}

/** @param {ReturnType<typeof createLearningDb>} fixture */
function seed(fixture) {
  const { sqlite } = fixture;
  sqlite.exec("INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview-1', 'user-1', 'active', 4102444800000)");
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('archived', 'Archived topic', 'archived-topic', 'topic', NULL, 0),
      ('cardio', 'Cardiology', 'cardiology', 'system', NULL, 1),
      ('af', 'Atrial fibrillation', 'atrial-fibrillation', 'topic', 'cardio', 1),
      ('flutter', 'Atrial flutter', 'atrial-flutter', 'topic', 'cardio', 1),
      ('neuro', 'Neurology', 'neurology', 'system', NULL, 1);
  `);

  sqlite.exec("INSERT INTO cases (id, title, is_active) VALUES ('case-beta', 'Beta case', 1), ('case-alpha', 'Alpha case', 1), ('case-off', 'Inactive case', 0)");
  sqlite.exec("INSERT INTO cases (id, title, preview_session_id, is_active) VALUES ('case-preview', 'Preview case', 'preview-1', 1)");
  sqlite.exec(`
    INSERT INTO case_concepts (case_id, concept_id, role) VALUES
      ('case-beta', 'af', 'primary'),
      ('case-alpha', 'af', 'primary'),
      ('case-off', 'af', 'primary'),
      ('case-preview', 'af', 'primary');
  `);
}

test('Systems & Topics search derives filtered rows and hierarchy options from one taxonomy read', async () => {
  const fixture = createLearningDb();
  try {
    seed(fixture);
    fixture.preparedQueries.length = 0;

    const workspace = await getTaxonomyWorkspaceLibrary(fixture.db, { search: 'atrial' });

    assert.deepEqual(workspace.topics.map((item) => item.id), ['af', 'flutter']);
    assert.deepEqual(workspace.topics.map((item) => item.breadcrumbLabel), [
      'Cardiology → Atrial fibrillation',
      'Cardiology → Atrial flutter'
    ]);
    assert.deepEqual(workspace.hierarchyOptions.map((item) => item.id), ['archived', 'cardio', 'af', 'flutter', 'neuro']);

    const af = workspace.hierarchyOptions.find((item) => item.id === 'af');
    const cardio = workspace.hierarchyOptions.find((item) => item.id === 'cardio');
    const archived = workspace.hierarchyOptions.find((item) => item.id === 'archived');
    assert.ok(af);
    assert.ok(cardio);
    assert.ok(archived);
    assert.equal(af.directCaseCount, 2);
    assert.equal(af.descendantStudyCaseCount, 2);
    assert.deepEqual(af.directCases, [
      { id: 'case-alpha', title: 'Alpha case' },
      { id: 'case-beta', title: 'Beta case' }
    ]);
    assert.equal(cardio.directCaseCount, 0);
    assert.equal(cardio.descendantStudyCaseCount, 2);
    assert.equal(archived.isActive, false);
    assert.equal(archived.directCaseCount, 0);
    assert.equal(archived.descendantStudyCaseCount, 0);

    const conceptQueries = queriesFrom(fixture.preparedQueries, 'concepts');
    const primaryCaseQueries = queriesFrom(fixture.preparedQueries, 'case_concepts');
    assert.equal(conceptQueries.length, 1, JSON.stringify(conceptQueries));
    assert.equal(primaryCaseQueries.length, 1, JSON.stringify(primaryCaseQueries));
    assert.match(primaryCaseQueries[0].sql, /"case_concepts"\."role"\s*=\s*\?/);
    assert.match(primaryCaseQueries[0].sql, /"cases"\."is_active"\s*=\s*\?/);
    assert.match(primaryCaseQueries[0].sql, /"cases"\."preview_session_id"\s+is\s+null/i);
    assert.ok(primaryCaseQueries[0].params.includes('primary'));
  } finally {
    fixture.sqlite.close();
  }
});

test('Systems & Topics route invokes the broad taxonomy workspace helper once and keeps canonical mutations wired', () => {
  const workspaceReads = topicsRoute.match(/getTaxonomyWorkspaceLibrary\(db, filters\)/g) ?? [];
  assert.equal(workspaceReads.length, 1);
  assert.doesNotMatch(topicsRoute, /filters\.search\s*\?\s*listTaxonomyLibrary/);
  assert.doesNotMatch(topicsRoute, /listTaxonomyLibrary\(db/);
  assert.match(topicsRoute, /topics: taxonomyLibrary\.topics/);
  assert.match(topicsRoute, /hierarchyOptions: taxonomyLibrary\.hierarchyOptions/);
  assert.match(topicsRoute, /applyStagedTaxonomyWorkspace/);
  assert.match(topicsRoute, /applyStagedTaxonomyHierarchy/);
  assert.match(topicsRoute, /applyStagedCasePrimaryTopics/);
  assert.match(topicsRoute, /applyStagedCaseTags/);
});
