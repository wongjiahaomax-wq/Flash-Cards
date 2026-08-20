import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { pickReviewQuestions, resolveQuestionPool } from '../src/lib/server/learning/questions.js';

const base = { questionPromptId: 'image-finding', promptMd: 'What does this image show?', answerMd: 'Reusable answer', isActive: true };
const asset = { ...base, sourceAssetQuestionId: 'aq-1', stimulusGroupId: 'group-a', stimulusOptionId: 'option-a' };

function pool(overrides = {}) {
  return resolveQuestionPool({ assetQuestions: [asset], ...overrides });
}

test('explicit reusable Asset question resolves with Asset provenance', () => {
  const resolved = pool();
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].sourceType, 'asset');
  assert.equal(resolved[0].sourceAssetQuestionId, 'aq-1');
  assert.equal(resolved[0].stimulusGroupId, 'group-a');
  assert.equal(resolved[0].stimulusOptionId, 'option-a');
});

test('reusable Asset question is absent unless explicitly supplied by the selected option loader', () => {
  assert.deepEqual(resolveQuestionPool({}), []);
});

test('inactive reusable Asset question is excluded', () => {
  assert.deepEqual(resolveQuestionPool({ assetQuestions: [{ ...asset, isActive: false }] }), []);
});

test('reusable Asset question requires canonical provenance and selected option context', () => {
  assert.throws(() => resolveQuestionPool({ assetQuestions: [{ ...base, stimulusGroupId: 'group-a', stimulusOptionId: 'option-a' }] }), /missing reusable Asset question context/);
});

test('Case-specific exact-option question overrides reusable Asset question with the same Prompt', () => {
  const resolved = pool({ stimulusOptionQuestions: [{ ...base, answerMd: 'Context answer', stimulusGroupId: 'group-a', stimulusOptionId: 'option-a' }] });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].sourceType, 'stimulus_option');
  assert.equal(resolved[0].answerMd, 'Context answer');
});

test('reusable Asset question overrides broader group and Case knowledge', () => {
  const resolved = pool({
    stimulusGroupQuestions: [{ ...base, answerMd: 'Group answer', stimulusGroupId: 'group-a' }],
    caseQuestions: [{ ...base, answerMd: 'Case answer' }]
  });
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].sourceType, 'asset');
  assert.equal(resolved[0].answerMd, 'Reusable answer');
});

test('deduplication still returns one question per Prompt ID', () => {
  const resolved = pool({
    caseQuestions: [{ ...base, answerMd: 'Case answer' }],
    studyConceptQuestions: [{ ...base, answerMd: 'Topic answer', sourceConceptId: 'topic-a' }]
  });
  assert.equal(resolved.length, 1);
  assert.equal(new Set(resolved.map((question) => question.questionPromptId)).size, 1);
});

test('cross-group Prompt ambiguity includes reusable Asset questions', () => {
  assert.throws(() => resolveQuestionPool({
    assetQuestions: [asset],
    stimulusOptionQuestions: [{ ...base, stimulusGroupId: 'group-b', stimulusOptionId: 'option-b' }]
  }), /multiple selected Stimulus Groups/);
});

test('same-group exact option may override reusable Asset question safely', () => {
  assert.doesNotThrow(() => pool({ stimulusOptionQuestions: [{ ...base, stimulusGroupId: 'group-a', stimulusOptionId: 'option-a' }] }));
});

test('reusable Asset questions participate in stimulus-specific coverage', () => {
  const selected = pickReviewQuestions([
    { ...pool()[0], questionPromptId: 'image-finding' },
    { questionPromptId: 'case-1', sourceType: 'case' },
    { questionPromptId: 'case-2', sourceType: 'case' }
  ], { mode: 'fixed', count: 2, rng: () => 0, groupCoverage: [{ groupId: 'group-a', mode: 'minimum', minimum: 1 }] });
  assert.equal(selected.length, 2);
  assert.ok(selected.some((question) => question.questionPromptId === 'image-finding'));
});

test('All mode still returns the whole deduplicated pool including reusable image questions', () => {
  const selected = pickReviewQuestions([...pool(), { questionPromptId: 'case-1', sourceType: 'case' }], { mode: 'all', rng: () => 0 });
  assert.equal(selected.length, 2);
});

test('Automatic mode retains the existing four-question ceiling when coverage does not require more', () => {
  const questions = [asset, ...['a', 'b', 'c', 'd', 'e'].map((id) => ({ questionPromptId: id, promptMd: id, answerMd: id }))];
  const resolved = resolveQuestionPool({ assetQuestions: [asset], caseQuestions: questions.slice(1) });
  assert.equal(pickReviewQuestions(resolved, { count: 99, rng: () => 0.5 }).length, 4);
});

test('migration stores canonical answers outside question_prompts and adds explicit opt-in/provenance', () => {
  const sql = fs.readFileSync(new URL('../drizzle/0009_reusable_image_questions.sql', import.meta.url), 'utf8');
  assert.match(sql, /CREATE TABLE `asset_questions`/);
  assert.match(sql, /`answer_md` text NOT NULL/);
  assert.match(sql, /CREATE TABLE `stimulus_option_asset_questions`/);
  assert.match(sql, /source_asset_question_id/);
  assert.match(sql, /source_type` in \('case', 'concept', 'ancestor_concept', 'stimulus_group', 'asset', 'stimulus_option', 'tag_shared'\)/);
});

test('migration enforces Asset identity and unique per-option opt-in', () => {
  const sql = fs.readFileSync(new URL('../drizzle/0009_reusable_image_questions.sql', import.meta.url), 'utf8');
  assert.match(sql, /PRIMARY KEY \(`stimulus_group_option_id`, `asset_question_id`\)/);
  assert.match(sql, /stimulus_option_asset_questions_asset_match_insert/);
  assert.match(sql, /sgo`.`asset_id` = `aq`.`asset_id/);
});

test('migration preserves historical Review snapshots while adding nullable provenance', () => {
  const sql = fs.readFileSync(new URL('../drizzle/0009_reusable_image_questions.sql', import.meta.url), 'utf8');
  assert.match(sql, /SELECT[\s\S]*`source_stimulus_option_id`, NULL,[\s\S]*`prompt_snapshot_md`, `answer_snapshot_md`/);
});

test('migration blocks Preview-owned Assets or Prompts from backing reusable image questions', () => {
  const sql = fs.readFileSync(new URL('../drizzle/0009_reusable_image_questions.sql', import.meta.url), 'utf8');
  assert.match(sql, /asset_questions_reject_preview_content_insert/);
  assert.match(sql, /preview_session_id` IS NOT NULL/);
});

test('fixed-image reuse path preserves caption and uses one-option selection', () => {
  const source = fs.readFileSync(new URL('../src/lib/server/db/asset-questions.js', import.meta.url), 'utf8');
  assert.match(source, /selectionCount: 1/);
  assert.match(source, /captionMd: fixed\.captionMd/);
  assert.match(source, /db\.batch/);
  assert.match(source, /db\.delete\(caseAssets\)/);
});

test('removing one reuse deletes only the opt-in relationship', () => {
  const source = fs.readFileSync(new URL('../src/lib/server/db/asset-questions.js', import.meta.url), 'utf8');
  const removeBody = source.slice(source.indexOf('export async function removeAssetQuestionOptIn'), source.indexOf('export async function updateAssetQuestionAnswer'));
  assert.match(removeBody, /delete\(stimulusOptionAssetQuestions\)/);
  assert.doesNotMatch(removeBody, /delete\(assetQuestions\)|update\(assetQuestions\)/);
});

test('canonical answer editing updates Asset Question rather than Question Prompt', () => {
  const source = fs.readFileSync(new URL('../src/lib/server/db/asset-questions.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export async function updateAssetQuestionAnswer'), source.indexOf('export async function setAssetQuestionActive'));
  assert.match(body, /update\(assetQuestions\)/);
  assert.doesNotMatch(body, /update\(questionPrompts\)/);
});

test('Import Package v1 implementation is not coupled to reusable Asset Question tables', () => {
  const source = fs.readFileSync(new URL('../src/lib/server/import/content-package.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /assetQuestions|asset_questions|stimulusOptionAssetQuestions/);
});
