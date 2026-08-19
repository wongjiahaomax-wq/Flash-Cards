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
import { canManageCaseAssets } from '../src/lib/server/db/case-assets.js';
import { listAdminCases } from '../src/lib/server/db/case-assets.js';
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

/** @param {DatabaseSync} sqlite @param {string} caseId @param {string} conceptId */
function relationshipRole(sqlite, caseId, conceptId) {
  const row = sqlite.prepare('SELECT role FROM case_concepts WHERE case_id = ? AND concept_id = ?').get(caseId, conceptId);
  assert.ok(row);
  return row.role;
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

test('administrator can create a Case and change its default Topic without losing attached Topics', async () => {
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
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT case_id, concept_id, role FROM case_concepts WHERE case_id = ?').all(created.id).map((row) => ({ ...row })),
      [{ case_id: created.id, concept_id: 'seed-anterior-stemi', role: 'primary' }]
    );

    await updateCaseVignette(fixture.db, created.id, 'Updated case stem.');
    const updated = fixture.sqlite.prepare('SELECT vignette_md FROM cases WHERE id = ?').get(created.id);
    assert.ok(updated);
    assert.equal(updated.vignette_md, 'Updated case stem.');

    fixture.sqlite.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, 'seed-pityriasis-rosea', 'secondary')").run(created.id);
    await updateCase(fixture.db, {
      caseId: created.id,
      title: 'Renamed Case label',
      vignetteMd: 'Revised case stem.'
    });
    const revised = fixture.sqlite.prepare('SELECT title, vignette_md FROM cases WHERE id = ?').get(created.id);
    assert.deepEqual({ ...revised }, { title: 'Renamed Case label', vignette_md: 'Revised case stem.' });
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT concept_id, role FROM case_concepts WHERE case_id = ? ORDER BY concept_id').all(created.id).map((row) => ({ ...row })),
      [
        { concept_id: 'seed-anterior-stemi', role: 'primary' },
        { concept_id: 'seed-pityriasis-rosea', role: 'secondary' }
      ]
    );

    await promoteCaseTopic(fixture.db, { caseId: created.id, conceptId: 'seed-pityriasis-rosea' });
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT concept_id, role FROM case_concepts WHERE case_id = ? ORDER BY concept_id').all(created.id).map((row) => ({ ...row })),
      [
        { concept_id: 'seed-anterior-stemi', role: 'secondary' },
        { concept_id: 'seed-pityriasis-rosea', role: 'primary' }
      ]
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('administrator can add, remove, and promote secondary Study Topics without duplicate or invalid primary relationships', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, {
      title: 'Multi-topic authoring Case',
      conceptId: 'seed-anterior-stemi'
    });

    await addCaseSecondaryTopic(fixture.db, { caseId: created.id, conceptId: 'seed-pityriasis-rosea' });
    await addCaseSecondaryTopic(fixture.db, { caseId: created.id, conceptId: 'seed-stemi' });
    assert.deepEqual(
      (await listCaseTopics(fixture.db, created.id)).map((topic) => ({ id: topic.id, role: topic.role })),
      [
        { id: 'seed-anterior-stemi', role: 'primary' },
        { id: 'seed-pityriasis-rosea', role: 'secondary' },
        { id: 'seed-stemi', role: 'secondary' }
      ]
    );

    await assert.rejects(
      addCaseSecondaryTopic(fixture.db, { caseId: created.id, conceptId: 'seed-pityriasis-rosea' }),
      (error) => error instanceof AdminContentInputError && /already attached/i.test(error.message)
    );
    await assert.rejects(
      addCaseSecondaryTopic(fixture.db, { caseId: created.id, conceptId: 'does-not-exist' }),
      (error) => error instanceof AdminContentInputError && /missing or inactive/i.test(error.message)
    );

    await promoteCaseTopic(fixture.db, { caseId: created.id, conceptId: 'seed-pityriasis-rosea' });
    let topics = await listCaseTopics(fixture.db, created.id);
    assert.equal(topics.filter((topic) => topic.role === 'primary').length, 1);
    assert.deepEqual(
      topics.map((topic) => ({ id: topic.id, role: topic.role })).sort((a, b) => a.id.localeCompare(b.id)),
      [
        { id: 'seed-pityriasis-rosea', role: 'primary' },
        { id: 'seed-anterior-stemi', role: 'secondary' },
        { id: 'seed-stemi', role: 'secondary' }
      ].sort((a, b) => a.id.localeCompare(b.id))
    );

    await assert.rejects(
      removeCaseSecondaryTopic(fixture.db, { caseId: created.id, conceptId: 'seed-pityriasis-rosea' }),
      (error) => error instanceof AdminContentInputError && /primary Topic cannot be removed/i.test(error.message)
    );
    await removeCaseSecondaryTopic(fixture.db, { caseId: created.id, conceptId: 'seed-anterior-stemi' });
    topics = await listCaseTopics(fixture.db, created.id);
    assert.deepEqual(
      topics.map((topic) => ({ id: topic.id, role: topic.role })),
      [
        { id: 'seed-pityriasis-rosea', role: 'primary' },
        { id: 'seed-stemi', role: 'secondary' }
      ]
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('inactive Topic relationships remain visible but inactive Topics cannot be newly attached', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Historical Topic Case', conceptId: 'seed-anterior-stemi' });
    fixture.sqlite.prepare("INSERT INTO case_concepts (case_id, concept_id, role) VALUES (?, 'seed-pityriasis-rosea', 'secondary')").run(created.id);
    fixture.sqlite.prepare('UPDATE concepts SET is_active = 0 WHERE id = ?').run('seed-pityriasis-rosea');

    const topics = await listCaseTopics(fixture.db, created.id);
    assert.equal(topics.find((topic) => topic.id === 'seed-pityriasis-rosea')?.isActive, false);
    await assert.rejects(
      addCaseSecondaryTopic(fixture.db, { caseId: created.id, conceptId: 'seed-pityriasis-rosea' }),
      (error) => error instanceof AdminContentInputError && /missing or inactive/i.test(error.message)
    );
    await removeCaseSecondaryTopic(fixture.db, { caseId: created.id, conceptId: 'seed-pityriasis-rosea' });
    assert.equal((await listCaseTopics(fixture.db, created.id)).some((topic) => topic.id === 'seed-pityriasis-rosea'), false);
  } finally {
    fixture.sqlite.close();
  }
});

test('invalid primary changes leave the existing Case relationships untouched', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Primary rollback guard Case', conceptId: 'seed-anterior-stemi' });
    await addCaseSecondaryTopic(fixture.db, { caseId: created.id, conceptId: 'seed-pityriasis-rosea' });

    await assert.rejects(
      promoteCaseTopic(fixture.db, { caseId: created.id, conceptId: 'does-not-exist' }),
      AdminContentInputError
    );
    assert.deepEqual(
      (await listCaseTopics(fixture.db, created.id)).map((topic) => ({ id: topic.id, role: topic.role })),
      [
        { id: 'seed-anterior-stemi', role: 'primary' },
        { id: 'seed-pityriasis-rosea', role: 'secondary' }
      ]
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('a new Case Topic can become primary or an Additional Study Topic', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Inline Topic Case', conceptId: 'seed-anterior-stemi' });
    await addCaseSecondaryTopic(fixture.db, { caseId: created.id, conceptId: 'seed-stemi' });

    const primaryTopic = await createCaseTopic(fixture.db, {
      caseId: created.id,
      name: 'Pericarditis',
      relationshipIntent: 'primary'
    });
    assert.equal(primaryTopic.relationshipIntent, 'primary');
    assert.equal(relationshipRole(fixture.sqlite, created.id, primaryTopic.id), 'primary');
    assert.equal(relationshipRole(fixture.sqlite, created.id, 'seed-anterior-stemi'), 'secondary');
    assert.equal(relationshipRole(fixture.sqlite, created.id, 'seed-stemi'), 'secondary');

    const secondaryTopic = await createCaseTopic(fixture.db, {
      caseId: created.id,
      name: 'Pericarditis',
      relationshipIntent: 'secondary'
    });
    assert.equal(secondaryTopic.slug, 'pericarditis-2');
    assert.equal(relationshipRole(fixture.sqlite, created.id, secondaryTopic.id), 'secondary');
    assert.equal(relationshipRole(fixture.sqlite, created.id, primaryTopic.id), 'primary');
  } finally {
    fixture.sqlite.close();
  }
});

test('failed non-batched Case Topic attachment cleans up the newly created Topic', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Inline Topic Cleanup Case', conceptId: 'seed-anterior-stemi' });
    fixture.sqlite.exec(`
      CREATE TRIGGER reject_new_case_topic
      BEFORE INSERT ON case_concepts
      WHEN NEW.case_id = '${created.id}' AND NEW.concept_id NOT IN (SELECT concept_id FROM case_concepts WHERE case_id = NEW.case_id)
      BEGIN SELECT RAISE(ABORT, 'forced relationship failure'); END;
    `);
    const nonBatchedD1 = { prepare: fixture.d1.prepare };
    const nonBatchedDb = createDb(/** @type {D1Database} */ (/** @type {unknown} */ (nonBatchedD1)));

    await assert.rejects(
      createCaseTopic(nonBatchedDb, { caseId: created.id, name: 'Should Be Cleaned Up', relationshipIntent: 'secondary' }),
      /case_concepts/
    );
    assert.equal(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM concepts WHERE name = 'Should Be Cleaned Up'").get()?.count, 0);
    assert.deepEqual(
      fixture.sqlite.prepare('SELECT concept_id, role FROM case_concepts WHERE case_id = ?').all(created.id).map((row) => ({ ...row })),
      [{ concept_id: 'seed-anterior-stemi', role: 'primary' }]
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('new Case Topic creation validates the Case, name, and relationship intent before writing', async () => {
  const fixture = createLearningDb();
  try {
    const created = await createCase(fixture.db, { title: 'Inline Topic Validation Case', conceptId: 'seed-anterior-stemi' });
    await assert.rejects(
      createCaseTopic(fixture.db, { caseId: created.id, name: ' ', relationshipIntent: 'secondary' }),
      (error) => error instanceof AdminContentInputError && /Topic name is required/i.test(error.message)
    );
    await assert.rejects(
      createCaseTopic(fixture.db, { caseId: created.id, name: 'Invalid Intent Topic', relationshipIntent: 'unrelated' }),
      (error) => error instanceof AdminContentInputError && /primary or an Additional Study Topic/i.test(error.message)
    );
    await assert.rejects(
      createCaseTopic(fixture.db, { caseId: 'missing-case', name: 'Missing Case Topic', relationshipIntent: 'secondary' }),
      (error) => error instanceof AdminContentInputError && /missing or inactive/i.test(error.message)
    );
    fixture.sqlite.prepare('UPDATE cases SET is_active = 0 WHERE id = ?').run(created.id);
    await assert.rejects(
      createCaseTopic(fixture.db, { caseId: created.id, name: 'Inactive Case Topic', relationshipIntent: 'secondary' }),
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
