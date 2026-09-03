import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CONTENT_TABLES } from '../scripts/local-replica-lib.mjs';

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('PR G analytics schema is registered with Drizzle migration tooling', () => {
  const drizzleConfig = source('drizzle.config.js');
  assert.match(drizzleConfig, /fsrs-analytics-schema\.js/);
});

test('PR G learner analytics/deletion tables remain excluded from production-to-local replica content', () => {
  const mirroredNames = new Set(CONTENT_TABLES.map((table) => table.name));
  for (const table of ['learner_system_monthly_buckets', 'learner_account_deletions']) {
    assert.equal(
      mirroredNames.has(table),
      false,
      `${table} is learner-owned runtime/history state and must never be mirrored from Production`
    );
  }
});

test('PR G does not resurrect legacy Review persistence', () => {
  const migration = source('drizzle/0025_learner_fsrs_admin_analytics_deletion.sql');
  const analytics = source('src/lib/server/db/fsrs-admin-analytics.ts');
  const deletion = source('src/lib/server/db/learner-account-deletion.ts');
  const combined = `${migration}\n${analytics}\n${deletion}`;

  assert.doesNotMatch(combined, /CREATE TABLE\s+`?(reviews|review_questions|review_assets)`?/i);
  assert.doesNotMatch(combined, /INSERT INTO\s+`?(reviews|review_questions|review_assets)`?/i);
});
