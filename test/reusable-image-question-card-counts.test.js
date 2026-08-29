import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { reusableSummaryForContext } from '../src/lib/admin-case-question-audit.js';
import { buildCaseImageQuestionSummaries } from '../src/lib/server/db/case-image-question-summaries.js';

const questions = [
  { id: 'aq-1', assetId: 'asset-a', promptMd: 'Q1', answerMd: 'A1' },
  { id: 'aq-2', assetId: 'asset-a', promptMd: 'Q2', answerMd: 'A2' },
  { id: 'aq-3', assetId: 'asset-a', promptMd: 'Q3', answerMd: 'A3' }
];

/**
 * @param {{ assetId: string, stimulusOptionId: string | null }} context
 * @param {{ id: string, assetId: string, promptMd: string, answerMd: string }[]} [activeQuestions]
 * @param {{ stimulusOptionId: string, assetQuestionId: string }[]} [optIns]
 */
function summary(context, activeQuestions = questions, optIns = []) {
  return buildCaseImageQuestionSummaries([context], activeQuestions, optIns)[0];
}

test('fixed image shows active reusable questions as available with no used opt-ins', () => {
  const result = summary({ assetId: 'asset-a', stimulusOptionId: null });
  assert.deepEqual({ total: result.total, used: result.used, available: result.available }, { total: 3, used: 0, available: 3 });
});

test('alternative option distinguishes used and available reusable questions', () => {
  const result = summary(
    { assetId: 'asset-a', stimulusOptionId: 'option-a' },
    questions,
    [{ stimulusOptionId: 'option-a', assetQuestionId: 'aq-1' }]
  );
  assert.deepEqual({ total: result.total, used: result.used, available: result.available }, { total: 3, used: 1, available: 2 });
  assert.equal(result.questions.find((question) => question.id === 'aq-1')?.usedInCase, true);
});

test('asset with zero active reusable questions reports zero counts', () => {
  const result = summary({ assetId: 'asset-empty', stimulusOptionId: 'option-empty' }, questions, []);
  assert.deepEqual({ total: result.total, used: result.used, available: result.available }, { total: 0, used: 0, available: 0 });
});

test('removing an opt-in changes used to available without changing canonical questions', () => {
  const context = { assetId: 'asset-a', stimulusOptionId: 'option-a' };
  const before = summary(context, questions, [{ stimulusOptionId: 'option-a', assetQuestionId: 'aq-1' }]);
  const after = summary(context, questions, []);
  assert.deepEqual({ total: before.total, used: before.used, available: before.available }, { total: 3, used: 1, available: 2 });
  assert.deepEqual({ total: after.total, used: after.used, available: after.available }, { total: 3, used: 0, available: 3 });
  assert.deepEqual(after.questions.map((question) => question.id), questions.map((question) => question.id));
});

test('archive and reactivation preserve dormant opt-in semantics', () => {
  const context = { assetId: 'asset-a', stimulusOptionId: 'option-a' };
  const dormantOptIn = [{ stimulusOptionId: 'option-a', assetQuestionId: 'aq-1' }];
  const archived = summary(context, questions.filter((question) => question.id !== 'aq-1'), dormantOptIn);
  const reactivated = summary(context, questions, dormantOptIn);
  assert.deepEqual({ total: archived.total, used: archived.used, available: archived.available }, { total: 2, used: 0, available: 2 });
  assert.deepEqual({ total: reactivated.total, used: reactivated.used, available: reactivated.available }, { total: 3, used: 1, available: 2 });
});

test('DB loader excludes inactive Asset Questions and inactive Prompts from visible counts', () => {
  const source = fs.readFileSync(new URL('../src/lib/server/db/case-image-question-summaries.js', import.meta.url), 'utf8');
  assert.ok(source.includes('eq(assetQuestions.isActive, true)'));
  assert.ok(source.includes('eq(questionPrompts.isActive, true)'));
  assert.ok(source.includes('isNull(questionPrompts.previewSessionId)'));
  assert.ok(source.includes('isNull(assets.previewSessionId)'));
});

test('DB loader orders reusable Asset Questions by creation time then ID', () => {
  const source = fs.readFileSync(new URL('../src/lib/server/db/case-image-question-summaries.js', import.meta.url), 'utf8');
  assert.ok(source.includes('.orderBy(asc(assetQuestions.createdAt), asc(assetQuestions.id))'));
});

test('fixed-image reuse still uses established transparent one-option conversion path', () => {
  const source = fs.readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
  assert.ok(source.includes('await optInAssetQuestion(db, { caseId, optionId, assetQuestionId:'));
  assert.ok(source.includes('await optInFixedAssetQuestion(db, { caseId, assetId:'));
});

test('option cards show Case-specific Q/A pairs while keeping reusable counts independent', () => {
  const images = fs.readFileSync(new URL('../src/lib/components/case-editor/CaseImagesAdvanced.svelte', import.meta.url), 'utf8');
  const counts = fs.readFileSync(new URL('../src/lib/components/ImageQuestionCounts.svelte', import.meta.url), 'utf8');
  assert.ok(images.includes('<ImageQuestionCounts caseSpecificCount={0} {reusable} />'));
  assert.ok(images.includes('<ImageQuestionCounts caseSpecificCount={imageQuestions.length} caseSpecificQuestions={imageQuestions} {reusable} />'));
  assert.ok(counts.includes('Case-specific Image Questions'));
  assert.ok(counts.includes('Reusable Image Questions'));
  assert.ok(counts.includes('question.promptMd'));
  assert.ok(counts.includes('question.answerMd'));
  assert.ok(counts.includes('qa-label answer'));
});

test('Compact review distinguishes inactive Alternative Sets, options, and Assets', () => {
  const review = fs.readFileSync(new URL('../src/lib/components/ImageQuestionReview.svelte', import.meta.url), 'utf8');
  const inactiveSetSummary = reusableSummaryForContext(
    {
      stimulusGroups: [{ id: 'group-a', isActive: false, options: [{ id: 'option-a' }] }],
      reusableImageQuestions: [{ assetId: 'asset-a', stimulusOptionId: 'option-a', total: 0, used: 0, available: 0, questions: [] }]
    },
    'asset-a',
    'option-a'
  );
  assert.equal(inactiveSetSummary.groupActive, false);
  assert.ok(review.includes("'INACTIVE · '"));
  assert.ok(review.includes('groupActive ?? reusable?.groupActive ?? true'));
  assert.ok(review.includes('effectiveGroupActive && asset.isActive !== false && asset.assetIsActive !== false'));
  assert.ok(review.includes('class:inactive-review={!currentParticipant}'));
  assert.ok(review.includes('excluded from the current learner-participating Case audit'));
});

test('Manage questions waits for the editor DOM, then reveals and focuses it', () => {
  const images = fs.readFileSync(new URL('../src/lib/components/case-editor/CaseImagesAdvanced.svelte', import.meta.url), 'utf8');
  assert.match(images, /import \{[^}]*\btick\b[^}]*\} from 'svelte'/);
  assert.ok(images.includes('await tick()'));
  assert.ok(images.includes("scrollIntoView({ behavior: 'smooth', block: 'start' })"));
  assert.ok(images.includes('tabindex="-1"'));
});

test('Manage questions exposes reusable used/available actions while collapsed cards remain compact', () => {
  const manager = fs.readFileSync(new URL('../src/lib/components/ReusableImageQuestionManager.svelte', import.meta.url), 'utf8');
  assert.ok(manager.includes('Used in this Case'));
  assert.ok(manager.includes('Available to reuse'));
  assert.ok(manager.includes('Remove from this Case'));
  assert.ok(manager.includes('Reuse in this Case'));
  assert.ok(manager.includes('Create a Reusable Image Question'));
});

test('Preview rendering cannot expose production reusable-question mutation controls', () => {
  const manager = fs.readFileSync(new URL('../src/lib/components/ReusableImageQuestionManager.svelte', import.meta.url), 'utf8');
  assert.ok(manager.includes('{#if !previewMode}'));
  assert.ok(manager.includes('action="?/createReusableImageQuestion"'));
  assert.ok(manager.includes('{#if !previewMode && optionId}'));
  assert.ok(manager.includes('action="?/removeAssetQuestionReuse"'));
  const previewServer = fs.readFileSync(new URL('../src/routes/preview-admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
  assert.equal(/createAssetQuestion|optInAssetQuestion|optInFixedAssetQuestion|removeAssetQuestionOptIn|updateAssetQuestionAnswer/.test(previewServer), false);
});
