import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import {
  addCaseSecondaryTopic,
  AdminContentInputError,
  createCase,
  createCaseTopic,
  createConcept,
  listAdminConcepts,
  listCaseTopics,
  promoteCaseTopic,
  removeCaseSecondaryTopic,
  updateCase,
  updateCaseVignette
} from '../src/lib/server/db/admin-content.js';
import { canManageCaseAssets, listAdminCases } from '../src/lib/server/db/case-assets.js';
import { buildSeedSql } from '../scripts/seed-content.mjs';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

const migrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0007_image_collections.sql', import.meta.url), 'utf8')
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
    async batch(statements) {
      return Promise.all(statements.map((/** @type {any} */ statement) => statement.run()));
    }
  };
  return { db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))), d1, sqlite };
}

/** @param {DatabaseSync} sqlite @param {string} caseId */
function topicRelationships(sqlite, caseId) {
  return sqlite.prepare('SELECT concept_id, role FROM case_concepts WHERE case_id = ? ORDER BY concept_id').all(caseId).map((row) => ({ ...row }));
}

test('administrator can create Concepts with unique generated slugs', async () => {
  const fixture = createLearningDb();
  try {
    const first = await createConcept(fixture.db, 'New Topic');
    const second = await createConcept(fixture.db, 'New Topic');
    assert.equal(first.slug, 'new-topic');
    assert.equal(second.slug, 'new-topic-2');
    assert.deepEqual(
      (await listAdminConcepts(fixture.db)).filter((concept) => concept.id === first.id || concept.id === second.id).map((concept) => concept.name),
      ['New Topic', 'New Topic']
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('administrator can create and edit a Case while replacing its single canonical Topic', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, {
      title: 'Admin-only Case label',
      vignetteMd: 'A short case stem for study.',
      conceptId: 'seed-anterior-stemi'
    });

    const listed = await listAdminCases(fixture.db);
    assert.deepEqual(listed.find((item) => item.id === created.id), {
      id: created.id,
      title: 'Admin-only Case label',
      vignetteMd: 'A short case stem for study.',
      conceptId: 'seed-anterior-stemi',
      conceptName: 'Anterior STEMI'
    });
    assert.deepEqual(topicRelationships(fixture.sqlite, created.id), [
      { concept_id: 'seed-anterior-stemi', role: 'primary' }
    ]);

    await updateCaseVignette(fixture.db, created.id, 'Updated case stem.');
    await updateCase(fixture.db, {
      caseId: created.id,
      title: 'Renamed Case label',
      vignetteMd: 'Revised case stem.'
    });
    assert.deepEqual(
      { ...fixture.sqlite.prepare('SELECT title, vignette_md FROM cases WHERE id = ?').get(created.id) },
      { title: 'Renamed Case label', vignette_md: 'Revised case stem.' }
    );

    await promoteCaseTopic(fixture.db, { caseId: created.id, conceptId: 'seed-pityriasis-rosea' });
    assert.deepEqual(topicRelationships(fixture.sqlite, created.id), [
      { concept_id: 'seed-pityriasis-rosea', role: 'primary' }
    ]);
  } finally {
    fixture.sqlite.close();
  }
});

test('Additional Study Topic mutation APIs fail closed in favor of Case Tags', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Primary-only Case', conceptId: 'seed-anterior-stemi' });
    for (const operation of [addCaseSecondaryTopic, removeCaseSecondaryTopic]) {
      await assert.rejects(
        operation(fixture.db, { caseId: created.id, conceptId: 'seed-pityriasis-rosea' }),
        (error) => error instanceof AdminContentInputError && /Additional Study Topics are no longer supported/i.test(error.message)
      );
    }
    assert.deepEqual(topicRelationships(fixture.sqlite, created.id), [
      { concept_id: 'seed-anterior-stemi', role: 'primary' }
    ]);
  } finally {
    fixture.sqlite.close();
  }
});

test('legacy secondary Topic rows remain visible but block silent Primary Topic replacement', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Legacy relationship Case', conceptId: 'seed-anterior-stemi' });
    fixture.sqlite.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, 'seed-pityriasis-rosea', 'secondary')").run(created.id);
    fixture.sqlite.prepare("UPDATE concepts SET is_active = 0 WHERE id = 'seed-pityriasis-rosea'").run();

    const topics = await listCaseTopics(fixture.db, created.id);
    assert.equal(topics.find((topic) => topic.id === 'seed-pityriasis-rosea')?.isActive, false);
    await assert.rejects(
      promoteCaseTopic(fixture.db, { caseId: created.id, conceptId: 'seed-stemi' }),
      (error) => error instanceof AdminContentInputError && /legacy non-primary Topic relationships/i.test(error.message)
    );
    assert.deepEqual(topicRelationships(fixture.sqlite, created.id), [
      { concept_id: 'seed-anterior-stemi', role: 'primary' },
      { concept_id: 'seed-pityriasis-rosea', role: 'secondary' }
    ]);
  } finally {
    fixture.sqlite.close();
  }
});

test('invalid Primary Topic changes leave the existing canonical relationship untouched', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Primary rollback guard Case', conceptId: 'seed-anterior-stemi' });
    await assert.rejects(
      promoteCaseTopic(fixture.db, { caseId: created.id, conceptId: 'does-not-exist' }),
      AdminContentInputError
    );
    assert.deepEqual(topicRelationships(fixture.sqlite, created.id), [
      { concept_id: 'seed-anterior-stemi', role: 'primary' }
    ]);
  } finally {
    fixture.sqlite.close();
  }
});

test('a new Case Topic can become Primary but cannot be created as an Additional Study Topic', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Inline Topic Case', conceptId: 'seed-anterior-stemi' });
    const primaryTopic = await createCaseTopic(fixture.db, {
      caseId: created.id,
      name: 'Pericarditis',
      relationshipIntent: 'primary'
    });
    assert.equal(primaryTopic.relationshipIntent, 'primary');
    assert.deepEqual(topicRelationships(fixture.sqlite, created.id), [
      { concept_id: primaryTopic.id, role: 'primary' }
    ]);

    await assert.rejects(
      createCaseTopic(fixture.db, {
        caseId: created.id,
        name: 'Secondary Pericarditis',
        relationshipIntent: 'secondary'
      }),
      (error) => error instanceof AdminContentInputError && /Additional Study Topics are no longer supported/i.test(error.message)
    );
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM concepts WHERE name = 'Secondary Pericarditis'").get()?.count, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('failed non-batched Primary Topic creation restores the old relationship and cleans up the new Topic', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Primary Topic Cleanup Case', conceptId: 'seed-anterior-stemi' });
    fixture.sqlite.exec(`
      CREATE TRIGGER reject_primary_topic_replacement
      BEFORE UPDATE OF concept_id ON case_concepts
      WHEN OLD.case_id = '${created.id}'
      BEGIN SELECT RAISE(ABORT, 'forced primary relationship failure'); END;
    `);
    const nonBatchedD1 = { prepare: fixture.d1.prepare };
    const nonBatchedDb = createDb(/** @type {D1Database} */ (/** @type {unknown} */ (nonBatchedD1)));

    await assert.rejects(
      createCaseTopic(nonBatchedDb, { caseId: created.id, name: 'Failed Primary Topic', relationshipIntent: 'primary' }),
      /forced primary relationship failure/
    );
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM concepts WHERE name = 'Failed Primary Topic'").get()?.count, 0);
    assert.deepEqual(topicRelationships(fixture.sqlite, created.id), [
      { concept_id: 'seed-anterior-stemi', role: 'primary' }
    ]);
  } finally {
    fixture.sqlite.close();
  }
});

test('new Case Topic creation validates Case, name, and primary-only relationship intent before writing', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Inline Topic Validation Case', conceptId: 'seed-anterior-stemi' });
    await assert.rejects(
      createCaseTopic(fixture.db, { caseId: created.id, name: ' ', relationshipIntent: 'primary' }),
      (error) => error instanceof AdminContentInputError && /Topic name is required/i.test(error.message)
    );
    await assert.rejects(
      createCaseTopic(fixture.db, { caseId: created.id, name: 'Invalid Intent Topic', relationshipIntent: 'unrelated' }),
      (error) => error instanceof AdminContentInputError && /Additional Study Topics are no longer supported/i.test(error.message)
    );
    await assert.rejects(
      createCaseTopic(fixture.db, { caseId: 'missing-case', name: 'Missing Case Topic', relationshipIntent: 'primary' }),
      (error) => error instanceof AdminContentInputError && /missing or inactive/i.test(error.message)
    );
    fixture.sqlite.prepare('UPDATE cases SET is_active = 0 WHERE id = ?').run(created.id);
    await assert.rejects(
      createCaseTopic(fixture.db, { caseId: created.id, name: 'Inactive Case Topic', relationshipIntent: 'primary' }),
      (error) => error instanceof AdminContentInputError && /missing or inactive/i.test(error.message)
    );
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM concepts WHERE name IN ('Invalid Intent Topic', 'Missing Case Topic', 'Inactive Case Topic')").get()?.count, 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('content management requires the existing administrator role', () => {
  assert.equal(canManageCaseAssets(/** @type {any} */ ({ role: 'learner' })), false);
  assert.equal(canManageCaseAssets(/** @type {any} */ ({ role: 'admin' })), true);
});