import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('reusable image question reactivation revalidates dormant opt-ins', () => {
  const source = fs.readFileSync(new URL('../src/lib/server/db/asset-questions.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export async function setAssetQuestionActive'), source.indexOf('function automaticGroupName'));
  assert.match(body, /if \(input\.isActive && !row\.isActive\)/);
  assert.match(body, /stimulusOptionAssetQuestions\.assetQuestionId/);
  assert.match(body, /ensurePromptMayBeSpecificInGroup/);
});

test('database guard blocks invalid reusable-question reactivation', () => {
  const sql = fs.readFileSync(new URL('../drizzle/0010_reusable_image_reactivation_guard.sql', import.meta.url), 'utf8');
  assert.match(sql, /asset_questions_reactivation_cross_group_guard/);
  assert.match(sql, /BEFORE UPDATE OF `is_active` ON `asset_questions`/);
  assert.match(sql, /other_group\.id <> target_group\.id/);
  assert.match(sql, /RAISE\(ABORT/);
});

test('removing reusable image usage validates production option and Asset identity first', () => {
  const source = fs.readFileSync(new URL('../src/lib/server/db/asset-questions.js', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('export async function removeAssetQuestionOptIn'), source.indexOf('export async function updateAssetQuestionAnswer'));
  assert.match(body, /requireProductionOptionIdentity/);
  assert.match(body, /question\.assetId !== option\.assetId/);
  assert.match(body, /delete\(stimulusOptionAssetQuestions\)/);
});
