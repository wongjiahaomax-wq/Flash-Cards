import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getCaseLibraryPage } from '../src/lib/server/db/case-library.js';
import { createDb } from '../src/lib/server/db/index.js';
import { applyCurrentSchema } from './current-schema.js';

const pageSource = readFileSync(new URL('../src/routes/admin/cases/+page.svelte', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../src/routes/admin/cases/+page.server.js', import.meta.url), 'utf8');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  /** @type {{ sql: string, params: any[] }[]} */
  const statements = [];
  const d1 = /** @type {any} */ ({
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
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
    /** @param {any[]} queries */
    async batch(queries) { return Promise.all(queries.map((query) => query.run())); }
  });
  return { db: createDb(/** @type {D1Database} */ (d1)), sqlite, statements };
}

/** @param {{ sql: string }[]} statements */
function taxonomyReadCount(statements) {
  return statements.filter(({ sql }) =>
    /from "concepts"/i.test(sql)
    && /description_md/i.test(sql)
    && /\bkind\b/i.test(sql)
    && /parent_id/i.test(sql)
  ).length;
}

/** @param {string} id */
function inputTag(id) {
  return pageSource.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? '';
}

test('Case Library text filters submit deliberately while Tag change remains immediate', () => {
  const searchForm = pageSource.match(/<form class="search-form"[\s\S]*?<\/form>/)?.[0] ?? '';
  assert.ok(searchForm, 'expected the Case Library GET search form');

  for (const [id, name] of [['case-search', 'q'], ['topic-search', 'topic'], ['system-search', 'system']]) {
    const input = inputTag(id);
    assert.ok(input, `expected ${id}`);
    assert.match(input, new RegExp(`name="${name}"`));
    assert.doesNotMatch(input, /oninput=|onkeydown=|onkeyup=/, `${id} must not submit while typing`);
  }

  assert.match(searchForm, /method="GET"/);
  assert.match(searchForm, /<button class="button primary" type="submit">Search<\/button>/);
  assert.match(searchForm, /<select id="case-tag" name="tag" onchange=\{applyFilters\}>/);
  assert.match(pageSource, /function applyFilters\(\)\s*\{\s*searchForm\?\.requestSubmit\(\);\s*\}/);
  assert.doesNotMatch(pageSource, /setTimeout\([^)]*requestSubmit|function autoSearch|searchTimer/);

  for (const name of ['q', 'topic', 'system', 'tag']) assert.match(searchForm, new RegExp(`name="${name}"`));
  assert.match(searchForm, /name="lifecycle" value="inactive"/);
  assert.match(searchForm, /name="sort" value=\{data\.caseFilters\.sort\}/);
  assert.doesNotMatch(searchForm, /name="page"/, 'new filter submissions must start from page 1');
  assert.match(pageSource, /return inactiveView \? '\/admin\/cases\?lifecycle=inactive' : '\/admin\/cases';/);
});

test('Case Library route reuses page taxonomy options and keeps lifecycle-correct Tag options', () => {
  assert.doesNotMatch(serverSource, /listAdminConcepts/);
  assert.match(serverSource, /topics:\s*pageData\.topicOptions/);
  assert.match(serverSource, /listCaseLibraryTagOptions\(db, filters\.lifecycle\)/);
  assert.match(serverSource, /'admin-case-library-read'/);
});

test('active Case Library derives Topic options from one canonical taxonomy supporting read', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec(`
      INSERT INTO preview_sessions (id, user_id, status, expires_at)
      VALUES ('preview-1', 'user-1', 'active', 4102444800000);
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
        ('system-eye', 'Eye', 'eye', 'system', NULL, 1),
        ('topic-glaucoma', 'Glaucoma', 'glaucoma', 'topic', 'system-eye', 1),
        ('topic-retina', 'Retina', 'retina', 'topic', 'system-eye', 1),
        ('topic-retired', 'Retired topic', 'retired-topic', 'topic', 'system-eye', 0);
      INSERT INTO cases (id, title, is_active) VALUES
        ('case-active', 'Acute glaucoma', 1),
        ('case-inactive', 'Old glaucoma', 0);
      INSERT INTO cases (id, title, preview_session_id, is_active)
      VALUES ('case-preview', 'Preview glaucoma', 'preview-1', 1);
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES
        ('case-active', 'topic-glaucoma', 'primary'),
        ('case-inactive', 'topic-retired', 'primary'),
        ('case-preview', 'topic-glaucoma', 'primary');
    `);

    fixture.statements.length = 0;
    const active = await getCaseLibraryPage(
      fixture.db,
      { search: 'glaucoma', topicSearch: 'glauc', systemSearch: 'eye', tagId: '', sort: 'case-asc', lifecycle: 'active' },
      { pageSize: 10 }
    );

    assert.equal(taxonomyReadCount(fixture.statements), 1, 'active page should load canonical Concept taxonomy once');
    assert.deepEqual(active.rows.map((row) => row.id), ['case-active']);
    assert.deepEqual(active.topicOptions, [
      {
        id: 'topic-glaucoma',
        name: 'Glaucoma',
        slug: 'glaucoma',
        breadcrumb: [
          { id: 'system-eye', name: 'Eye', kind: 'system' },
          { id: 'topic-glaucoma', name: 'Glaucoma', kind: 'topic' }
        ]
      },
      {
        id: 'topic-retina',
        name: 'Retina',
        slug: 'retina',
        breadcrumb: [
          { id: 'system-eye', name: 'Eye', kind: 'system' },
          { id: 'topic-retina', name: 'Retina', kind: 'topic' }
        ]
      }
    ]);

    fixture.statements.length = 0;
    const inactive = await getCaseLibraryPage(
      fixture.db,
      { search: '', topicSearch: 'retired', systemSearch: 'eye', tagId: '', sort: 'case-asc', lifecycle: 'inactive' },
      { pageSize: 10 }
    );
    assert.equal(taxonomyReadCount(fixture.statements), 1, 'inactive page still needs one taxonomy read for filter/display context');
    assert.deepEqual(inactive.rows.map((row) => row.id), ['case-inactive']);
    assert.equal(inactive.rows[0]?.systemName, 'Eye');
    assert.deepEqual(inactive.topicOptions, [], 'inactive recovery must not construct active Topic assignment options');
  } finally {
    fixture.sqlite.close();
  }
});
