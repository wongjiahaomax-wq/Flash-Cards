import test from 'node:test';
import assert from 'node:assert/strict';

import { pickCase } from '../src/lib/server/learning/cases.js';
import { pickReviewQuestions, resolveQuestionPool } from '../src/lib/server/learning/questions.js';

test('case-specific answers override primary and inherited Concept answers', () => {
  const pool = resolveQuestionPool({
    ancestorConceptQuestions: [
      {
        questionPromptId: 'diagnosis',
        promptMd: 'What is the diagnosis?',
        answerMd: 'STEMI',
        inheritToDescendants: true,
        distance: 1,
        sourceConceptId: 'stemi'
      }
    ],
    primaryConceptQuestions: [
      {
        questionPromptId: 'diagnosis',
        promptMd: 'What is the diagnosis?',
        answerMd: 'Anterior STEMI',
        sourceConceptId: 'anterior-stemi'
      }
    ],
    caseQuestions: [
      {
        questionPromptId: 'diagnosis',
        promptMd: 'What is the diagnosis?',
        answerMd: 'Extensive anterior STEMI'
      }
    ]
  });

  assert.equal(pool.length, 1);
  assert.equal(pool[0].answerMd, 'Extensive anterior STEMI');
  assert.equal(pool[0].sourceType, 'case');
});

test('nearest inheritable ancestor wins over a more distant ancestor', () => {
  const pool = resolveQuestionPool({
    ancestorConceptQuestions: [
      {
        questionPromptId: 'management',
        promptMd: 'What is the immediate management?',
        answerMd: 'Broad ACS answer',
        inheritToDescendants: true,
        distance: 2,
        sourceConceptId: 'acs'
      },
      {
        questionPromptId: 'management',
        promptMd: 'What is the immediate management?',
        answerMd: 'STEMI-specific answer',
        inheritToDescendants: true,
        distance: 1,
        sourceConceptId: 'stemi'
      }
    ]
  });

  assert.equal(pool.length, 1);
  assert.equal(pool[0].answerMd, 'STEMI-specific answer');
  assert.equal(pool[0].sourceConceptId, 'stemi');
  assert.equal(pool[0].sourceType, 'ancestor_concept');
});

test('non-inheritable and inactive questions are excluded', () => {
  const pool = resolveQuestionPool({
    ancestorConceptQuestions: [
      {
        questionPromptId: 'not-inherited',
        promptMd: 'Do not inherit me',
        answerMd: 'No',
        inheritToDescendants: false,
        distance: 1
      }
    ],
    primaryConceptQuestions: [
      {
        questionPromptId: 'inactive',
        promptMd: 'Inactive question',
        answerMd: 'No',
        isActive: false
      },
      {
        questionPromptId: 'active',
        promptMd: 'Active question',
        answerMd: 'Yes'
      }
    ]
  });

  assert.deepEqual(pool.map((question) => question.questionPromptId), ['active']);
});

test('review selection defaults to three questions and snapshots display order', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    questionPromptId: id,
    promptMd: id,
    answerMd: id,
    sourceType: 'concept',
    sourceConceptId: 'concept'
  }));

  const picked = pickReviewQuestions(pool, { rng: () => 0 });

  assert.equal(picked.length, 3);
  assert.deepEqual(picked.map((question) => question.displayOrder), [0, 1, 2]);
  assert.equal(new Set(picked.map((question) => question.questionPromptId)).size, 3);
});

test('review selection never displays more than four questions', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ questionPromptId: id }));
  const picked = pickReviewQuestions(pool, { count: 99, rng: () => 0.5 });
  assert.equal(picked.length, 4);
});

test('case selection avoids the immediately previous Case when another Case exists', () => {
  const selected = pickCase(
    [
      { id: 'case-a', isActive: true },
      { id: 'case-b', isActive: true }
    ],
    { lastCompletedCaseId: 'case-a', rng: () => 0 }
  );

  assert.ok(selected);
  assert.equal(selected.id, 'case-b');
});

test('case selection may repeat when it is the only active Case', () => {
  const selected = pickCase(
    [
      { id: 'case-a', isActive: true },
      { id: 'case-b', isActive: false }
    ],
    { lastCompletedCaseId: 'case-a', rng: () => 0 }
  );

  assert.ok(selected);
  assert.equal(selected.id, 'case-a');
});
