// @ts-nocheck
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getCaseLibraryPage } from '../src/lib/server/db/case-library.js';
import { CASE_LIBRARY_UNASSIGNED_SYSTEM } from '../src/lib/case-library-classification.ts';
import { createDb } from '../src/lib/server/db/index.js';
import { applyCurrentSchema } from './current-schema.js';

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  const statements = [];
  const d1 = {
    prepare(sql) {
      return {
        bind(...params) {
          statements.push({ sql, params });
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
    async batch(queries) { return Promise.all(queries.map((query) => query.run())); }
  };
  return { db: createDb(d1), sqlite, statements };
}

function filters(overrides = {}) {
  return { search: '', topicId: '', systemId: '', tagId: '', sort: 'case-asc', lifecycle: 'active', ...overrides };
}

function taxonomyReadCount(statements) {
  return statements.filter(({ sql }) => /from "concepts"/i.test(sql) && /description_md/i.test(sql) && /\bkind\b/i.test(sql) && /parent_id/i.test(sql)).length;
}

test('System filtering distinguishes real matches, Unassigned, and stale IDs', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec(`
      INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview-1', 'user-1', 'active', 4102444800000);
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
        ('system-eye', 'Eye', 'eye', 'system', NULL, 1),
        ('topic-retina', 'Retina', 'retina', 'topic', 'system-eye', 1),
        ('topic-free-parent', 'Free Parent', 'free-parent', 'topic', NULL, 1),
        ('topic-free-child', 'Free Child', 'free-child', 'topic', 'topic-free-parent', 1),
        ('topic-free-direct', 'Free Direct', 'free-direct', 'topic', NULL, 1);
      INSERT INTO tags (id, name, normalized_name, is_active) VALUES ('tag-shared', 'Shared', 'shared', 1);
      INSERT INTO cases (id, title, is_active) VALUES
        ('case-eye', 'Eye Case', 1),
        ('case-free-direct', 'Direct Unassigned Case', 1),
        ('case-free-nested', 'Nested Unassigned Case', 1),
        ('case-inactive-free', 'Inactive Unassigned Case', 0);
      INSERT INTO cases (id, title, preview_session_id, is_active) VALUES ('case-preview-free', 'Preview Unassigned Case', 'preview-1', 1);
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES
        ('case-eye', 'topic-retina', 'primary'),
        ('case-free-direct', 'topic-free-direct', 'primary'),
        ('case-free-nested', 'topic-free-child', 'primary'),
        ('case-inactive-free', 'topic-free-child', 'primary'),
        ('case-preview-free', 'topic-free-child', 'primary');
      INSERT INTO case_tags (case_id, tag_id) VALUES ('case-eye', 'tag-shared'), ('case-free-nested', 'tag-shared');
    `);

    fixture.statements.length = 0;
    const unrestricted = await getCaseLibraryPage(fixture.db, filters(), { pageSize: 20 });
    assert.deepEqual(unrestricted.rows.map((row) => row.id), ['case-free-direct', 'case-eye', 'case-free-nested']);
    assert.equal(taxonomyReadCount(fixture.statements), 1, 'active Case Library must keep one canonical taxonomy read');

    const realSystem = await getCaseLibraryPage(fixture.db, filters({ systemId: 'system-eye' }), { pageSize: 20 });
    assert.deepEqual(realSystem.rows.map((row) => row.id), ['case-eye']);

    const unassigned = await getCaseLibraryPage(fixture.db, filters({ systemId: CASE_LIBRARY_UNASSIGNED_SYSTEM }), { pageSize: 20 });
    assert.deepEqual(unassigned.rows.map((row) => row.id), ['case-free-direct', 'case-free-nested']);
    assert.ok(unassigned.rows.every((row) => row.systemName === null));

    const staleSystem = await getCaseLibraryPage(fixture.db, filters({ systemId: 'not-a-system' }), { pageSize: 20 });
    assert.deepEqual(staleSystem.rows.map((row) => row.id), unrestricted.rows.map((row) => row.id));
    assert.equal(staleSystem.filters.systemId, '');

    const composed = await getCaseLibraryPage(fixture.db, filters({
      search: 'Nested',
      topicId: 'topic-free-child',
      systemId: CASE_LIBRARY_UNASSIGNED_SYSTEM,
      tagId: 'tag-shared'
    }), { pageSize: 20 });
    assert.deepEqual(composed.rows.map((row) => row.id), ['case-free-nested']);

    const inactive = await getCaseLibraryPage(fixture.db, filters({ lifecycle: 'inactive', systemId: CASE_LIBRARY_UNASSIGNED_SYSTEM }), { pageSize: 20 });
    assert.deepEqual(inactive.rows.map((row) => row.id), ['case-inactive-free']);
    assert.deepEqual(inactive.topicOptions, []);
    assert.deepEqual(inactive.topicParentOptions, []);
  } finally {
    fixture.sqlite.close();
  }
});

test('Case Library filters use Topic and System IDs, including named Unassigned System', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec(`
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
        ('system-eye', 'Eye', 'eye', 'system', NULL, 1),
        ('system-unassigned', 'Unassigned', 'unassigned', 'system', NULL, 1),
        ('topic-duplicate-eye', 'Acute pericarditis', 'acute-pericarditis-eye', 'topic', 'system-eye', 1),
        ('topic-duplicate-named', 'Acute pericarditis', 'acute-pericarditis-named', 'topic', 'system-unassigned', 1),
        ('topic-no-system', 'Acute pericarditis', 'acute-pericarditis-free', 'topic', NULL, 1);
      INSERT INTO cases (id, title, is_active) VALUES
        ('case-eye', 'Eye Case', 1),
        ('case-named-system', 'Named System Case', 1),
        ('case-no-system', 'No System Case', 1);
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES
        ('case-eye', 'topic-duplicate-eye', 'primary'),
        ('case-named-system', 'topic-duplicate-named', 'primary'),
        ('case-no-system', 'topic-no-system', 'primary');
    `);

    const eyeTopic = await getCaseLibraryPage(fixture.db, filters({ topicId: 'topic-duplicate-eye' }), { pageSize: 20 });
    const namedTopic = await getCaseLibraryPage(fixture.db, filters({ topicId: 'topic-duplicate-named' }), { pageSize: 20 });
    assert.deepEqual(eyeTopic.rows.map((row) => row.id), ['case-eye']);
    assert.deepEqual(namedTopic.rows.map((row) => row.id), ['case-named-system']);
    assert.equal(eyeTopic.topicFilterOptions.find((option) => option.id === 'topic-duplicate-eye')?.breadcrumb.at(-1)?.name, 'Acute pericarditis');

    const namedSystem = await getCaseLibraryPage(fixture.db, filters({ systemId: 'system-unassigned' }), { pageSize: 20 });
    const unassigned = await getCaseLibraryPage(fixture.db, filters({ systemId: CASE_LIBRARY_UNASSIGNED_SYSTEM }), { pageSize: 20 });
    assert.deepEqual(namedSystem.rows.map((row) => row.id), ['case-named-system']);
    assert.deepEqual(unassigned.rows.map((row) => row.id), ['case-no-system']);
    assert.notDeepEqual(namedSystem.rows.map((row) => row.id), unassigned.rows.map((row) => row.id));
  } finally {
    fixture.sqlite.close();
  }
});

test('lifecycle-invalid and stale taxonomy IDs are cleared instead of becoming invisible active filters', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec(`
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
        ('system-active', 'Active System', 'active-system', 'system', NULL, 1),
        ('topic-active', 'Active Topic', 'active-topic', 'topic', 'system-active', 1),
        ('system-retired', 'Retired System', 'retired-system', 'system', NULL, 0),
        ('topic-retired', 'Retired Topic', 'retired-topic', 'topic', 'system-retired', 0);
      INSERT INTO cases (id, title, is_active) VALUES
        ('case-active', 'Active Case', 1),
        ('case-inactive', 'Inactive Case', 0);
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES
        ('case-active', 'topic-active', 'primary'),
        ('case-inactive', 'topic-retired', 'primary');
    `);

    const inactive = await getCaseLibraryPage(fixture.db, filters({
      lifecycle: 'inactive',
      topicId: 'topic-retired',
      systemId: 'system-retired'
    }), { pageSize: 20 });
    assert.deepEqual(inactive.rows.map((row) => row.id), ['case-inactive']);
    assert.equal(inactive.filters.topicId, 'topic-retired');
    assert.equal(inactive.filters.systemId, 'system-retired');

    const activeAfterLifecycleSwitch = await getCaseLibraryPage(fixture.db, filters({
      lifecycle: 'active',
      topicId: 'topic-retired',
      systemId: 'system-retired'
    }), { pageSize: 20 });
    assert.deepEqual(activeAfterLifecycleSwitch.rows.map((row) => row.id), ['case-active']);
    assert.equal(activeAfterLifecycleSwitch.filters.topicId, '');
    assert.equal(activeAfterLifecycleSwitch.filters.systemId, '');

    const stalePersistedIds = await getCaseLibraryPage(fixture.db, filters({
      topicId: 'topic-that-no-longer-exists',
      systemId: 'system-that-no-longer-exists'
    }), { pageSize: 20 });
    assert.deepEqual(stalePersistedIds.rows.map((row) => row.id), ['case-active']);
    assert.equal(stalePersistedIds.filters.topicId, '');
    assert.equal(stalePersistedIds.filters.systemId, '');
  } finally {
    fixture.sqlite.close();
  }
});
