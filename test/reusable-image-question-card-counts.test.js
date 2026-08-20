import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildCaseImageQuestionSummaries } from '../src/lib/server/db/case-image-question-summaries.js';

const questions = [
  { id: 'aq-1', assetId: 'asset-a', promptMd: 'Q1', answerMd: 'A1' },
  { id: 'aq-2', assetId: 'asset-a', promptMd: 'Q2', answerMd: 'A2' },
  { id: 'aq-3', assetId: 'asset-a', promptMd: 'Q3', answerMd: 'A3' }
];

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
  assert.match(source, /eq\(assetQuestions\.isActive, true\)/);
  assert.match(source, /eq\(questionPrompts\.isActive, true\)/);
  assert.match(source, /isNull\(questionPrompts\.previewSessionId\)/);
  assert.match(source, /isNull\(assets\.previewSessionId\)/);
});

test('fixed-image reuse still uses established transparent one-option conversion path', () => {
  const source = fs.readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
  assert.match(source, /if \(optionId\)[\s\S]*optInAssetQuestion/);
  assert.match(source, /else \{[\s\S]*optInFixedAssetQuestion/);
});

test('collapsed cards keep Case-specific and reusable counts independent and show no answers', () => {
  const page = fs.readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
  const counts = fs.readFileSync(new URL('../src/lib/components/ImageQuestionCounts.svelte', import.meta.url), 'utf8');
  assert.match(page, /ImageQuestionCounts caseSpecificCount=\{0\}/);
  assert.match(page, /ImageQuestionCounts caseSpecificCount=\{imageQuestions\.length\}/);
  assert.match(counts, /Case-specific Image Questions/);
  assert.match(counts, /Reusable Image Questions/);
  assert.doesNotMatch(counts, /answerMd|Canonical answer|Answer:/);
});

test('Manage questions exposes reusable used/available actions while collapsed cards remain compact', () => {
  const manager = fs.readFileSync(new URL('../src/lib/components/ReusableImageQuestionManager.svelte', import.meta.url), 'utf8');
  assert.match(manager, /Used in this Case/);
  assert.match(manager, /Available to reuse/);
  assert.match(manager, /Remove from this Case/);
  assert.match(manager, /Reuse in this Case/);
  assert.match(manager, /Create a Reusable Image Question/);
});

test('Preview rendering cannot expose production reusable-question mutation controls', () => {
  const manager = fs.readFileSync(new URL('../src/lib/components/ReusableImageQuestionManager.svelte', import.meta.url), 'utf8');
  assert.match(manager, /\{#if !previewMode\}[\s\S]*createReusableImageQuestion/);
  assert.match(manager, /\{#if !previewMode && optionId\}[\s\S]*removeAssetQuestionReuse/);
  const previewServer = fs.readFileSync(new URL('../src/routes/preview-admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
  assert.doesNotMatch(previewServer, /createAssetQuestion|optInAssetQuestion|optInFixedAssetQuestion|removeAssetQuestionOptIn|updateAssetQuestionAnswer/);
});
