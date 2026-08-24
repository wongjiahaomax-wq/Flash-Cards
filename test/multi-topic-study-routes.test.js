import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { descendantDistances, resolveCaseStudyCandidates, resolveStudyConceptId } from '../src/lib/server/learning/study-routes.js';

const primaryOnlyMigrationSql = readFileSync(new URL('../drizzle/0016_primary_case_topics_only.sql', import.meta.url), 'utf8')
  .replaceAll('--> statement-breakpoint', '');

function createCaseConceptsDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE case_concepts (
      case_id text NOT NULL,
      concept_id text NOT NULL,
      role text NOT NULL CHECK (role IN ('primary', 'secondary')),
      created_at integer,
      PRIMARY KEY (case_id, concept_id)
    );
  `);
  return sqlite;
}

test('Study Concept resolver uses only the canonical primary Topic', () => {
  const concepts = [
    { id: 'root', parentId: null },
    { id: 'primary', parentId: 'root' },
    { id: 'secondary', parentId: 'root' },
    { id: 'secondary-child', parentId: 'secondary' }
  ];
  const links = [
    { conceptId: 'primary', role: 'primary' },
    { conceptId: 'secondary', role: 'secondary' },
    { conceptId: 'secondary-child', role: 'secondary' }
  ];

  assert.equal(resolveStudyConceptId({
    selectedConceptId: 'root',
    distances: descendantDistances('root', concepts),
    links
  }), 'primary');
  assert.equal(resolveStudyConceptId({
    selectedConceptId: 'secondary',
    distances: descendantDistances('secondary', concepts),
    links
  }), null);
});

test('legacy secondary relationships do not create learner Case routes', () => {
  const concepts = [
    { id: 'medicine', parentId: null },
    { id: 'canonical', parentId: 'medicine' },
    { id: 'alternate', parentId: null }
  ];
  const rows = [
    { id: 'case-a', title: 'A', isActive: true, conceptId: 'canonical', role: 'primary' },
    { id: 'case-a', title: 'A', isActive: true, conceptId: 'alternate', role: 'secondary' }
  ];

  const canonical = resolveCaseStudyCandidates({ selectedConceptId: 'medicine', concepts, rows });
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].primaryConceptId, 'canonical');
  assert.equal(canonical[0].studyConceptId, 'canonical');

  const alternate = resolveCaseStudyCandidates({ selectedConceptId: 'alternate', concepts, rows });
  assert.deepEqual(alternate, []);
});

test('0016 refuses to apply while any Case has a legacy secondary Topic relationship', () => {
  const sqlite = createCaseConceptsDb();
  try {
    sqlite.exec(`
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES
        ('case-a', 'canonical', 'primary'),
        ('case-a', 'alternate', 'secondary');
    `);
    assert.throws(() => sqlite.exec(primaryOnlyMigrationSql), /CHECK constraint failed|constraint/i);
  } finally {
    sqlite.close();
  }
});

test('0016 enforces one primary-only Case Topic relationship while allowing canonical replacement', () => {
  const sqlite = createCaseConceptsDb();
  try {
    sqlite.exec("INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-a', 'canonical', 'primary')");
    sqlite.exec(primaryOnlyMigrationSql);

    assert.throws(
      () => sqlite.exec("INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-b', 'alternate', 'secondary')"),
      /Primary Topic|canonical Primary Topic|primary/i
    );
    assert.throws(
      () => sqlite.exec("INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-a', 'another', 'primary')"),
      /only one canonical Topic relationship/i
    );

    sqlite.exec("UPDATE case_concepts SET concept_id = 'replacement', role = 'primary' WHERE case_id = 'case-a'");
    const row = sqlite.prepare('SELECT concept_id, role FROM case_concepts WHERE case_id = ?').get('case-a');
    assert.deepEqual({ ...row }, { concept_id: 'replacement', role: 'primary' });
  } finally {
    sqlite.close();
  }
});

test('0016 does not rewrite historical Review Topic provenance or immutable question snapshots', () => {
  const sqlite = createCaseConceptsDb();
  try {
    sqlite.exec(`
      CREATE TABLE reviews (
        id text PRIMARY KEY,
        primary_concept_id text NOT NULL,
        study_concept_id text NOT NULL
      );
      CREATE TABLE review_questions (
        id text PRIMARY KEY,
        review_id text NOT NULL,
        prompt_snapshot_md text NOT NULL,
        answer_snapshot_md text NOT NULL
      );
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('case-a', 'canonical', 'primary');
      INSERT INTO reviews (id, primary_concept_id, study_concept_id)
      VALUES ('historical-review', 'canonical', 'former-secondary');
      INSERT INTO review_questions (id, review_id, prompt_snapshot_md, answer_snapshot_md)
      VALUES ('rq-1', 'historical-review', 'Historical prompt', 'Historical answer');
    `);

    sqlite.exec(primaryOnlyMigrationSql);

    const review = sqlite.prepare('SELECT primary_concept_id, study_concept_id FROM reviews WHERE id = ?').get('historical-review');
    assert.deepEqual({ ...review }, { primary_concept_id: 'canonical', study_concept_id: 'former-secondary' });
    const snapshot = sqlite.prepare('SELECT prompt_snapshot_md, answer_snapshot_md FROM review_questions WHERE review_id = ?').get('historical-review');
    assert.deepEqual({ ...snapshot }, { prompt_snapshot_md: 'Historical prompt', answer_snapshot_md: 'Historical answer' });
  } finally {
    sqlite.close();
  }
});