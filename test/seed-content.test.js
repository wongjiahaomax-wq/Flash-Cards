import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';

test('representative seed covers inherited, child, Case-only, and multi-image content', () => {
  const sql = buildSeedSql();

  assert.match(sql, /'seed-stemi'/);
  assert.match(sql, /'seed-anterior-stemi'.*'seed-stemi'/);
  assert.match(sql, /'seed-caseq-anterior-a-describe'/);
  assert.match(sql, /'seed-caseq-anterior-b-describe'/);
  assert.match(sql, /'seed-caseq-anterior-c-conduction'/);
  assert.match(sql, /'seed-cq-stemi-reperfusion'.*1, 1/);
  assert.match(sql, /'seed-prompt-describe-ecg'/);
  assert.match(sql, /'seed-anterior-a'.*'seed-prompt-describe-ecg'/);
  assert.match(sql, /'seed-anterior-b'.*'seed-prompt-describe-ecg'/);
  assert.match(sql, /'seed-pityriasis-rosea'.*'seed-asset-pityriasis-herald'.*0/);
  assert.match(sql, /'seed-pityriasis-rosea'.*'seed-asset-pityriasis-trunk'.*1/);
});

test('seed stores R2 keys and does not turn external attribution URLs into image sources', () => {
  const sql = buildSeedSql();
  assert.match(sql, /'seed\/anterior-stemi-a\.png'/);
  assert.doesNotMatch(sql, /https?:\/\//);
});
