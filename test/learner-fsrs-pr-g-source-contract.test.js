import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CONTENT_TABLES } from '../scripts/local-replica-lib.mjs';

/** @param {string} path */
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

test('PR G locks the pinned Better Auth identity-root and non-FK verification cleanup boundary', () => {
  const packageJson = JSON.parse(source('package.json'));
  const adminRoute = source('src/routes/admin/learner-analytics/+page.server.js');
  const deletion = source('src/lib/server/db/learner-account-deletion.ts');
  const migration = source('drizzle/0025_learner_fsrs_admin_analytics_deletion.sql');

  assert.equal(packageJson.dependencies['better-auth'], '1.6.25');
  assert.match(adminRoute, /auth\.api\.removeUser/);
  assert.match(deletion, /phase:\s*'auth_verifications'/);
  assert.match(deletion, /table:\s*'verification',\s*userColumn:\s*'value'/);
  assert.match(migration, /EXISTS \(SELECT 1 FROM `verification` x WHERE x\.`value` = OLD\.`id`\)/);
});

test('PR G does not resurrect legacy Review persistence', () => {
  const migration = source('drizzle/0025_learner_fsrs_admin_analytics_deletion.sql');
  const analytics = source('src/lib/server/db/fsrs-admin-analytics.ts');
  const deletion = source('src/lib/server/db/learner-account-deletion.ts');
  const combined = `${migration}\n${analytics}\n${deletion}`;

  assert.doesNotMatch(combined, /CREATE TABLE\s+`?(reviews|review_questions|review_assets)`?/i);
  assert.doesNotMatch(combined, /INSERT INTO\s+`?(reviews|review_questions|review_assets)`?/i);
});
