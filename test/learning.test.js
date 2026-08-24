import test from 'node:test';
import assert from 'node:assert/strict';

import { pickCase } from '../src/lib/server/learning/cases.js';
import { resolveQuestionPoolForMode } from '../src/lib/server/learning/question-pool-mode.ts';
import { pickReviewQuestions, resolveQuestionPool } from '../src/lib/server/learning/questions.js';

test('case-specific answers override Study Concept and inherited Concept answers', () => {
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
    studyConceptQuestions: [
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
    studyConceptQuestions: [
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

test('Original questions resolve only Case-owned source inputs', () => {
  const pool = resolveQuestionPoolForMode('core', {
    caseQuestions: [{ questionPromptId: 'case', promptMd: 'Case', answerMd: 'Case answer' }],
    stimulusGroupQuestions: [{ questionPromptId: 'group', promptMd: 'Group', answerMd: 'Group answer', stimulusGroupId: 'group-1' }],
    stimulusOptionQuestions: [{ questionPromptId: 'option', promptMd: 'Option', answerMd: 'Option answer', stimulusGroupId: 'group-1', stimulusOptionId: 'option-1' }],
    studyConceptQuestions: [{ questionPromptId: 'concept', promptMd: 'Concept', answerMd: 'Concept answer', sourceConceptId: 'topic' }],
    ancestorConceptQuestions: [{ questionPromptId: 'ancestor', promptMd: 'Ancestor', answerMd: 'Ancestor answer', sourceConceptId: 'parent', inheritToDescendants: true, distance: 1 }],
    tagSharedQuestions: [{ questionPromptId: 'shared', promptMd: 'Shared', answerMd: 'Shared answer', sourceSharedQuestionId: 'shared-1' }],
    assetQuestions: [{ questionPromptId: 'asset', promptMd: 'Asset', answerMd: 'Asset answer', sourceAssetQuestionId: 'asset-question-1', stimulusGroupId: 'group-1', stimulusOptionId: 'option-1' }]
  });

  assert.deepEqual(
    pool.map((question) => [question.questionPromptId, question.sourceType]),
    [
      ['case', 'case'],
      ['group', 'stimulus_group'],
      ['option', 'stimulus_option']
    ]
  );
});

test('Expanded Learning preserves the existing full resolver behavior', () => {
  const input = {
    caseQuestions: [{ questionPromptId: 'case', promptMd: 'Case', answerMd: 'Case answer' }],
    studyConceptQuestions: [{ questionPromptId: 'concept', promptMd: 'Concept', answerMd: 'Concept answer', sourceConceptId: 'topic' }],
    tagSharedQuestions: [{ questionPromptId: 'shared', promptMd: 'Shared', answerMd: 'Shared answer', sourceSharedQuestionId: 'shared-1' }]
  };

  assert.deepEqual(resolveQuestionPoolForMode('expanded', input), resolveQuestionPool(input));
});

test('Original filtering happens before precedence so reusable duplicates cannot erase a Core Prompt', () => {
  const input = {
    caseQuestions: [{ questionPromptId: 'finding', promptMd: 'What is the finding?', answerMd: 'Case answer' }],
    assetQuestions: [{ questionPromptId: 'finding', promptMd: 'What is the finding?', answerMd: 'Reusable Asset answer', sourceAssetQuestionId: 'asset-question-1', stimulusGroupId: 'group-1', stimulusOptionId: 'option-1' }]
  };

  const original = resolveQuestionPoolForMode('core', input);
  const expanded = resolveQuestionPoolForMode('expanded', input);

  assert.equal(original.length, 1);
  assert.equal(original[0].sourceType, 'case');
  assert.equal(original[0].answerMd, 'Case answer');
  assert.equal(expanded.length, 1);
  assert.equal(expanded[0].sourceType, 'asset');
  assert.equal(expanded[0].answerMd, 'Reusable Asset answer');
});

test('Original mode cannot use a reusable Asset Question to satisfy stimulus coverage', () => {
  const input = {
    caseQuestions: [{ questionPromptId: 'case', promptMd: 'Case', answerMd: 'Case answer' }],
    assetQuestions: [{ questionPromptId: 'asset', promptMd: 'Asset', answerMd: 'Asset answer', sourceAssetQuestionId: 'asset-question-1', stimulusGroupId: 'group-1', stimulusOptionId: 'option-1' }]
  };
  /** @type {{ groupId: string, mode: 'none'|'minimum'|'all', minimum: number }[]} */
  const coverage = [{ groupId: 'group-1', mode: 'minimum', minimum: 1 }];

  const original = resolveQuestionPoolForMode('core', input);
  assert.throws(
    () => pickReviewQuestions(original, { mode: 'all', rng: () => 0, groupCoverage: coverage }),
    /requires at least 1 specific questions, but only 0 are eligible/
  );

  const expanded = resolveQuestionPoolForMode('expanded', input);
  assert.equal(pickReviewQuestions(expanded, { mode: 'all', rng: () => 0, groupCoverage: coverage }).length, 2);
});

test('Original all mode returns the complete Core set', () => {
  const pool = resolveQuestionPoolForMode('core', {
    caseQuestions: [
      { questionPromptId: 'one', promptMd: 'One', answerMd: 'One' },
      { questionPromptId: 'two', promptMd: 'Two', answerMd: 'Two' }
    ],
    stimulusGroupQuestions: [{ questionPromptId: 'three', promptMd: 'Three', answerMd: 'Three', stimulusGroupId: 'group-1' }],
    stimulusOptionQuestions: [{ questionPromptId: 'four', promptMd: 'Four', answerMd: 'Four', stimulusGroupId: 'group-1', stimulusOptionId: 'option-1' }],
    studyConceptQuestions: [{ questionPromptId: 'five', promptMd: 'Five', answerMd: 'Five', sourceConceptId: 'topic' }]
  });

  const picked = pickReviewQuestions(pool, { mode: 'all', rng: () => 0 });
  assert.equal(picked.length, 4);
  assert.deepEqual(new Set(picked.map((question) => question.sourceType)), new Set(['case', 'stimulus_group', 'stimulus_option']));
});

test('automatic and fixed question counts remain orthogonal to question pool mode', () => {
  const pool = resolveQuestionPoolForMode('core', {
    caseQuestions: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ questionPromptId: id, promptMd: id, answerMd: id }))
  });

  assert.equal(pickReviewQuestions(pool, { mode: 'automatic', count: 99, rng: () => 0 }).length, 4);
  assert.equal(pickReviewQuestions(pool, { mode: 'fixed', count: 2, rng: () => 0 }).length, 2);
});

test('review selection defaults to three questions and snapshots display order', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
    questionPromptId: id,
    promptMd: id,
    answerMd: id
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
