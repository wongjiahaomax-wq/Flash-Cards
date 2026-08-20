import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { getReview, listEligibleCases, listStudyConcepts, startReview } from '../src/lib/server/db/learning.js';
import { descendantDistances, resolveCaseStudyCandidates, resolveStudyConceptId } from '../src/lib/server/learning/study-routes.js';

const baseMigrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');
const multiTopicMigrationSql = readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8');
const currentSchemaMigrationSql = [
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql'
]
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

/** @param {DatabaseSync} sqlite */
function d1For(sqlite) {
  return {
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() { return sqlite.prepare(sql).all(...params).map((/** @type {any} */ row) => Object.values(row)); },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            }
          };
        }
      };
    },
    /** @param {any[]} statements */
    async batch(statements) { return Promise.all(statements.map((/** @type {any} */ statement) => statement.run())); }
  };
}

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(baseMigrationSql);
  sqlite.exec(multiTopicMigrationSql);
  sqlite.exec(currentSchemaMigrationSql);
  const db = createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1For(sqlite))));
  seedMultiTopicCase(sqlite);
  return { db, sqlite };
}

/** @param {DatabaseSync} sqlite */
function seedMultiTopicCase(sqlite) {
  sqlite.exec(`
    INSERT INTO concepts (id, name, slug, parent_id, is_active) VALUES
      ('medicine', 'Medicine', 'medicine', NULL, 1),
      ('electrophysiology', 'Electrophysiology', 'electrophysiology', 'medicine', 1),
      ('hypocalcaemia', 'Hypocalcaemia', 'hypocalcaemia', 'medicine', 1),
      ('prolonged-qtc', 'Prolonged QTc', 'prolonged-qtc', 'electrophysiology', 1),
      ('drug-long-qt', 'Drug-induced long QT', 'drug-long-qt', 'prolonged-qtc', 1);

    INSERT INTO cases (id, title, vignette_md, question_selection_mode, is_active)
    VALUES ('vitd-hypocalcaemia', 'Vitamin-D-deficiency hypocalcaemia', 'A patient with vitamin D deficiency.', 'all', 1);

    INSERT INTO case_concepts (case_id, concept_id, role) VALUES
      ('vitd-hypocalcaemia', 'hypocalcaemia', 'primary'),
      ('vitd-hypocalcaemia', 'prolonged-qtc', 'secondary'),
      ('vitd-hypocalcaemia', 'drug-long-qt', 'secondary');

    INSERT INTO question_prompts (id, prompt_md, is_active) VALUES
      ('p-hypo', 'Hypocalcaemia reusable question', 1),
      ('p-qtc', 'Prolonged QTc reusable question', 1),
      ('p-drug', 'Drug-induced long-QT reusable question', 1),
      ('p-ancestor', 'Inherited electrophysiology question', 1),
      ('p-case', 'Case-specific question', 1),
      ('p-precedence', 'Describe this ECG', 1),
      ('p-option', 'Exact selected ECG question', 1);

    INSERT INTO concept_questions (id, concept_id, question_prompt_id, answer_md, inherit_to_descendants, is_active) VALUES
      ('cq-hypo', 'hypocalcaemia', 'p-hypo', 'Hypocalcaemia answer', 0, 1),
      ('cq-qtc', 'prolonged-qtc', 'p-qtc', 'Prolonged QTc answer', 0, 1),
      ('cq-drug', 'drug-long-qt', 'p-drug', 'Drug-induced long-QT answer', 0, 1),
      ('cq-ancestor', 'electrophysiology', 'p-ancestor', 'Inherited electrophysiology answer', 1, 1),
      ('cq-precedence-ancestor', 'electrophysiology', 'p-precedence', 'Ancestor answer', 1, 1),
      ('cq-precedence-qtc', 'prolonged-qtc', 'p-precedence', 'Study Topic answer', 0, 1);

    INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES
      ('case-q', 'vitd-hypocalcaemia', 'p-case', 'Case answer', 1),
      ('case-precedence', 'vitd-hypocalcaemia', 'p-precedence', 'Case-level answer', 1);

    INSERT INTO assets (id, type, storage_key, mime_type, alt_text, is_active)
    VALUES ('qtc-ecg', 'image', 'test/qtc-ecg.png', 'image/png', 'A prolonged-QTc ECG', 1);

    INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, is_active)
    VALUES ('ecg-group', 'vitd-hypocalcaemia', 'ECG', 0, 1, 'none', 1);

    INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, caption_md, is_active)
    VALUES ('ecg-option', 'ecg-group', 'qtc-ecg', 0, 'Selected ECG', 1);

    INSERT INTO stimulus_group_questions (id, stimulus_group_id, question_prompt_id, answer_md, is_active)
    VALUES ('group-precedence', 'ecg-group', 'p-precedence', 'Group-level answer', 1);

    INSERT INTO stimulus_option_questions (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active) VALUES
      ('option-precedence', 'ecg-option', 'p-precedence', 'Option-level answer', 1),
      ('option-only', 'ecg-option', 'p-option', 'Exact ECG answer', 1);
  `);
}

test('Study Concept resolver follows exact, primary-in-subtree, deepest-secondary, then stable tie precedence', () => {
  const concepts = [
    { id: 'root', parentId: null },
    { id: 'primary', parentId: 'root' },
    { id: 'secondary-a', parentId: 'root' },
    { id: 'secondary-b', parentId: 'secondary-a' },
    { id: 'secondary-c', parentId: 'secondary-a' }
  ];
  const rootDistances = descendantDistances('root', concepts);
  const links = [
    { conceptId: 'primary', role: 'primary' },
    { conceptId: 'secondary-a', role: 'secondary' },
    { conceptId: 'secondary-b', role: 'secondary' }
  ];
  assert.equal(resolveStudyConceptId({ selectedConceptId: 'secondary-a', distances: descendantDistances('secondary-a', concepts), links }), 'secondary-a');
  assert.equal(resolveStudyConceptId({ selectedConceptId: 'root', distances: rootDistances, links }), 'primary');

  const secondaryOnlyLinks = links.filter((link) => link.role === 'secondary');
  assert.equal(resolveStudyConceptId({ selectedConceptId: 'secondary-a', distances: descendantDistances('secondary-a', concepts), links: secondaryOnlyLinks }), 'secondary-a');
  assert.equal(resolveStudyConceptId({ selectedConceptId: 'root', distances: rootDistances, links: [
    { conceptId: 'outside', role: 'primary' },
    { conceptId: 'secondary-c', role: 'secondary' },
    { conceptId: 'secondary-b', role: 'secondary' }
  ] }), 'secondary-b');
});

test('candidate resolution deduplicates a Case with several matching Topic relationships', () => {
  const candidates = resolveCaseStudyCandidates({
    selectedConceptId: 'root',
    concepts: [
      { id: 'root', parentId: null },
      { id: 'primary', parentId: 'root' },
      { id: 'secondary', parentId: 'root' }
    ],
    rows: [
      { id: 'case-a', title: 'A', isActive: true, conceptId: 'primary', role: 'primary' },
      { id: 'case-a', title: 'A', isActive: true, conceptId: 'secondary', role: 'secondary' }
    ]
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, 'case-a');
  assert.equal(candidates[0].studyConceptId, 'primary');
});

test('Study Topic selector and Case eligibility count unique Cases across primary and secondary routes', async () => {
  const fixture = createLearningDb();
  try {
    const studyTopics = await listStudyConcepts(fixture.db);
    assert.equal(studyTopics.find((topic) => topic.id === 'hypocalcaemia')?.caseCount, 1);
    assert.equal(studyTopics.find((topic) => topic.id === 'prolonged-qtc')?.caseCount, 1);
    assert.equal(studyTopics.find((topic) => topic.id === 'electrophysiology')?.caseCount, 1);

    const exactSecondary = await listEligibleCases(fixture.db, 'prolonged-qtc');
    assert.equal(exactSecondary.length, 1);
    assert.equal(exactSecondary[0].primaryConceptId, 'hypocalcaemia');
    assert.equal(exactSecondary[0].studyConceptId, 'prolonged-qtc');

    const secondaryParent = await listEligibleCases(fixture.db, 'electrophysiology');
    assert.equal(secondaryParent.length, 1);
    assert.equal(secondaryParent[0].studyConceptId, 'drug-long-qt');

    const commonParent = await listEligibleCases(fixture.db, 'medicine');
    assert.equal(commonParent.length, 1);
    assert.equal(commonParent[0].studyConceptId, 'hypocalcaemia');
  } finally {
    fixture.sqlite.close();
  }
});

test('same Case studied through its primary route uses only the primary Topic layer', async () => {
  const fixture = createLearningDb();
  try {
    const reviewId = await startReview({ db: fixture.db, userId: 'learner', conceptId: 'hypocalcaemia', rng: () => 0 });
    assert.ok(reviewId);
    const review = await getReview(fixture.db, reviewId, 'learner');
    assert.ok(review);
    assert.equal(review.primaryConceptId, 'hypocalcaemia');
    assert.equal(review.studyConceptId, 'hypocalcaemia');
    assert.equal(review.conceptName, 'Hypocalcaemia');
    assert.ok(review.questions.some((question) => question.prompt === 'Hypocalcaemia reusable question'));
    assert.ok(!review.questions.some((question) => question.prompt === 'Prolonged QTc reusable question'));
    assert.ok(review.questions.some((question) => question.prompt === 'Case-specific question'));
  } finally {
    fixture.sqlite.close();
  }
});

test('same Case studied through a secondary route stores both Concepts and prevents default-Topic leakage', async () => {
  const fixture = createLearningDb();
  try {
    const reviewId = await startReview({ db: fixture.db, userId: 'learner', conceptId: 'prolonged-qtc', rng: () => 0 });
    assert.ok(reviewId);
    const review = await getReview(fixture.db, reviewId, 'learner');
    assert.ok(review);
    assert.equal(review.primaryConceptId, 'hypocalcaemia');
    assert.equal(review.studyConceptId, 'prolonged-qtc');
    assert.equal(review.conceptName, 'Prolonged QTc');
    assert.ok(review.questions.some((question) => question.prompt === 'Prolonged QTc reusable question'));
    assert.ok(review.questions.some((question) => question.prompt === 'Inherited electrophysiology question'));
    assert.ok(review.questions.some((question) => question.prompt === 'Case-specific question'));
    assert.ok(!review.questions.some((question) => question.prompt === 'Hypocalcaemia reusable question'));
    assert.ok(!review.questions.some((question) => question.prompt === 'Drug-induced long-QT reusable question'));

    const precedence = review.questions.find((question) => question.prompt === 'Describe this ECG');
    assert.equal(precedence?.answer, 'Option-level answer');
    assert.equal(precedence?.sourceType, 'stimulus_option');
    assert.ok(review.questions.some((question) => question.prompt === 'Exact selected ECG question'));
    assert.equal(review.assets.length, 1);
    assert.equal(review.assets[0].stimulusGroupId, 'ecg-group');
    assert.equal(review.assets[0].stimulusOptionId, 'ecg-option');
  } finally {
    fixture.sqlite.close();
  }
});

test('historical Reviews are backfilled to their former primary-Concept route without losing snapshots', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(baseMigrationSql);
    sqlite.exec(`
      INSERT INTO concepts (id, name, slug, is_active) VALUES ('old-topic', 'Old Topic', 'old-topic', 1);
      INSERT INTO cases (id, title, question_selection_mode, is_active) VALUES ('old-case', 'Old Case', 'automatic', 1);
      INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('old-case', 'old-topic', 'primary');
      INSERT INTO question_prompts (id, prompt_md, is_active) VALUES ('old-prompt', 'Old prompt', 1);
      INSERT INTO reviews (id, user_id, case_id, primary_concept_id, case_title_snapshot, status)
      VALUES ('old-review', 'learner', 'old-case', 'old-topic', 'Old Case', 'started');
      INSERT INTO review_questions (id, review_id, question_prompt_id, source_type, source_concept_id, display_order, prompt_snapshot_md, answer_snapshot_md)
      VALUES ('old-rq', 'old-review', 'old-prompt', 'concept', 'old-topic', 0, 'Old prompt', 'Old answer');
    `);

    sqlite.exec(multiTopicMigrationSql);
    const review = sqlite.prepare('SELECT primary_concept_id, study_concept_id FROM reviews WHERE id = ?').get('old-review');
    assert.deepEqual({ ...review }, { primary_concept_id: 'old-topic', study_concept_id: 'old-topic' });
    const snapshotCount = sqlite.prepare('SELECT COUNT(*) AS count FROM review_questions WHERE review_id = ?').get('old-review');
    assert.ok(snapshotCount);
    assert.equal(snapshotCount.count, 1);
    const studyColumn = sqlite.prepare("PRAGMA table_info('reviews')").all().find((column) => column.name === 'study_concept_id');
    assert.equal(studyColumn?.notnull, 1);
    const studyForeignKey = sqlite.prepare("PRAGMA foreign_key_list('reviews')").all().find((foreignKey) => foreignKey.from === 'study_concept_id');
    assert.equal(studyForeignKey?.table, 'concepts');
    assert.equal(String(studyForeignKey?.on_delete).toUpperCase(), 'RESTRICT');
  } finally {
    sqlite.close();
  }
});
