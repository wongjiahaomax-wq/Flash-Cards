import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCaseFastReviewSummary,
  buildCaseQuestionAudit,
  usedReusableQuestions
} from '../src/lib/admin-case-question-audit.js';

function fixture() {
  return {
    questions: [
      { questionPromptId: 'prompt-case', promptMd: 'Case prompt', answerMd: 'Case answer', isActive: true },
      { questionPromptId: 'prompt-inactive-case', promptMd: 'Inactive', answerMd: 'Inactive', isActive: false }
    ],
    attached: [
      { assetId: 'asset-fixed', originalFilename: 'Fixed photo', imageUrl: '/media/fixed', altText: 'Fixed image', isActive: true },
      { assetId: 'asset-fixed-old', originalFilename: 'Old image', imageUrl: null, altText: '', isActive: false }
    ],
    stimulusGroups: [
      {
        id: 'group-ecg',
        name: 'ECG alternatives',
        isActive: true,
        questions: [
          { questionPromptId: 'prompt-set', promptMd: 'Set prompt', answerMd: 'Set answer', isActive: true },
          { questionPromptId: 'prompt-set-old', promptMd: 'Old set', answerMd: 'Old set', isActive: false }
        ],
        options: [
          { id: 'option-a', assetId: 'asset-a', originalFilename: 'ECG A', imageUrl: '/media/a', altText: 'ECG A', isActive: true, assetIsActive: true },
          { id: 'option-b', assetId: 'asset-b', originalFilename: 'ECG B', imageUrl: '/media/b', altText: 'ECG B', isActive: true, assetIsActive: true },
          { id: 'option-old', assetId: 'asset-old', originalFilename: 'Old ECG', imageUrl: '/media/old', altText: 'Old ECG', isActive: false, assetIsActive: true }
        ],
        optionQuestions: [
          { stimulusGroupOptionId: 'option-a', questionPromptId: 'prompt-image', promptMd: 'Image prompt', answerMd: 'Image answer', isActive: true },
          { stimulusGroupOptionId: 'option-old', questionPromptId: 'prompt-old-image', promptMd: 'Old image prompt', answerMd: 'Old image answer', isActive: true }
        ]
      },
      {
        id: 'group-old',
        name: 'Inactive alternatives',
        isActive: false,
        questions: [{ questionPromptId: 'prompt-inactive-set', promptMd: 'Inactive set', answerMd: 'Inactive set', isActive: true }],
        options: [{ id: 'option-inactive-set', assetId: 'asset-inactive-set', originalFilename: 'Inactive set image', isActive: true, assetIsActive: true }],
        optionQuestions: []
      }
    ],
    reusableImageQuestions: [
      {
        assetId: 'asset-fixed', stimulusOptionId: null, total: 1, used: 0, available: 1,
        questions: [{ id: 'asset-question-fixed', questionPromptId: 'prompt-fixed-reusable', promptMd: 'Available only', answerMd: 'Available answer', usedInCase: false }]
      },
      {
        assetId: 'asset-a', stimulusOptionId: 'option-a', total: 2, used: 1, available: 1,
        questions: [
          { id: 'asset-question-used', questionPromptId: 'prompt-reusable', promptMd: 'Reusable prompt', answerMd: 'Reusable answer', usedInCase: true },
          { id: 'asset-question-unused', questionPromptId: 'prompt-unused', promptMd: 'Unused prompt', answerMd: 'Unused answer', usedInCase: false }
        ]
      },
      {
        assetId: 'asset-b', stimulusOptionId: 'option-b', total: 1, used: 0, available: 1,
        questions: [{ id: 'asset-question-b', questionPromptId: 'prompt-b', promptMd: 'Available B', answerMd: 'Available B', usedInCase: false }]
      },
      {
        assetId: 'asset-old', stimulusOptionId: 'option-old', total: 1, used: 1, available: 0,
        questions: [{ id: 'asset-question-old', questionPromptId: 'prompt-old', promptMd: 'Old reusable', answerMd: 'Old reusable', usedInCase: true }]
      }
    ]
  };
}

test('Case audit maps whole-Case, exact-image, reusable, and set-wide sources', () => {
  const rows = buildCaseQuestionAudit(fixture());
  assert.deepEqual(rows.map((row) => [row.sourceType, row.sourceLabel, row.sourceName]), [
    ['case', 'CASE-WIDE', 'This whole Case'],
    ['group', 'SET-WIDE', 'ECG alternatives'],
    ['option', 'IMAGE-SPECIFIC', 'ECG A'],
    ['reusable', 'REUSABLE', 'ECG A']
  ]);
  assert.equal(rows[2].preview.type, 'image');
  assert.equal(rows[2].preview.image.assetId, 'asset-a');
  assert.equal(rows[3].preview.image.assetId, 'asset-a');
  assert.equal(rows[1].preview.type, 'set');
  assert.deepEqual(rows[1].preview.images.map((image) => image.assetId), ['asset-a', 'asset-b']);
});

test('available-but-unused reusable questions are excluded from the Case audit', () => {
  const rows = buildCaseQuestionAudit(fixture());
  assert.equal(rows.some((row) => row.promptMd === 'Unused prompt'), false);
  assert.equal(rows.some((row) => row.promptMd === 'Available only'), false);
});

test('inactive and non-participating relationships are excluded', () => {
  const rows = buildCaseQuestionAudit(fixture());
  const prompts = rows.map((row) => row.promptMd);
  assert.equal(prompts.includes('Inactive'), false);
  assert.equal(prompts.includes('Old set'), false);
  assert.equal(prompts.includes('Old image prompt'), false);
  assert.equal(prompts.includes('Old reusable'), false);
  assert.equal(prompts.includes('Inactive set'), false);
});

test('audit ordering is deterministic and preserves existing order inside scopes', () => {
  const value = fixture();
  value.questions.unshift({ questionPromptId: 'prompt-case-0', promptMd: 'First Case prompt', answerMd: 'First Case answer', isActive: true });
  value.stimulusGroups[0].questions.push({ questionPromptId: 'prompt-set-2', promptMd: 'Second set prompt', answerMd: 'Second set answer', isActive: true });
  const rows = buildCaseQuestionAudit(value);
  assert.deepEqual(rows.map((row) => row.promptMd), [
    'First Case prompt',
    'Case prompt',
    'Set prompt',
    'Second set prompt',
    'Image prompt',
    'Reusable prompt'
  ]);
});

test('duplicate records from one valid relationship are emitted once', () => {
  const value = fixture();
  value.stimulusGroups[0].optionQuestions.push({ ...value.stimulusGroups[0].optionQuestions[0] });
  value.reusableImageQuestions[1].questions.push({ ...value.reusableImageQuestions[1].questions[0] });
  const rows = buildCaseQuestionAudit(value);
  assert.equal(rows.filter((row) => row.promptMd === 'Image prompt').length, 1);
  assert.equal(rows.filter((row) => row.promptMd === 'Reusable prompt').length, 1);
});

test('used reusable helper and fast completeness counts use only current participants', () => {
  const value = fixture();
  assert.equal(usedReusableQuestions(value.reusableImageQuestions[1]).length, 1);
  assert.deepEqual(buildCaseFastReviewSummary(value), {
    fixedImages: 1,
    alternativeSets: 1,
    alternativeImages: 2,
    caseWideQuestions: 1,
    caseSpecificImageQuestions: 1,
    reusableImageQuestionsUsed: 1,
    setWideQuestions: 1,
    allQuestions: 4
  });
});
