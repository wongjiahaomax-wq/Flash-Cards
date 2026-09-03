import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CONTENT_TABLES, FORBIDDEN_PRODUCTION_TABLES } from '../scripts/local-replica-lib.mjs';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('PR G analytics schema is registered with Drizzle migration tooling', () => {
  const drizzleConfig = source('drizzle.config.js');
  assert.match(drizzleConfig, /fsrs-analytics-schema\.js/);
});

test('PR G long-range trend reads are sourced only from durable monthly buckets', () => {
  const analytics = source('src/lib/server/db/fsrs-admin-analytics.ts');
  const marker = 'export async function getAdminLearnerTrendSeries';
  const offset = analytics.indexOf(marker);
  assert.notEqual(offset, -1, 'Admin long-range trend function must remain present');
  const trendSource = analytics.slice(offset);

  assert.match(trendSource, /learner_system_monthly_buckets/);
  assert.doesNotMatch(trendSource, /learner_optimizer_evidence/);
  assert.doesNotMatch(trendSource, /learner_system_aggregates/);
});

test('PR G learner analytics/deletion tables remain explicitly forbidden from production-to-local replica content', () => {
  const mirroredNames = new Set(CONTENT_TABLES.map((table) => table.name));
  const forbiddenNames = new Set(FORBIDDEN_PRODUCTION_TABLES);
  for (const table of ['learner_system_monthly_buckets', 'learner_account_deletions']) {
    assert.equal(
      mirroredNames.has(table),
      false,
      `${table} is learner-owned runtime/history state and must never be mirrored from Production`
    );
    assert.equal(
      forbiddenNames.has(table),
      true,
      `${table} must stay on the explicit production-replica denylist`
    );
  }
});

test('PR G locks the pinned Better Auth identity-root and non-FK verification cleanup boundary', () => {
  const packageJson = JSON.parse(source('package.json'));
  const adminRoute = source('src/routes/admin/learner-analytics/+page.server.js');
  const deletion = source('src/lib/server/db/learner-account-deletion.ts');
  const migration = source('drizzle/0025_learner_fsrs_admin_analytics_deletion.sql');
  const hooks = source('src/hooks.server.js');

  assert.equal(packageJson.dependencies['better-auth'], '1.6.25');
  assert.match(adminRoute, /auth\.api\.removeUser/);
  assert.match(deletion, /phase:\s*'auth_sessions'/);
  assert.match(deletion, /table:\s*'session',\s*userColumn:\s*'userId'/);
  assert.match(deletion, /phase:\s*'auth_accounts'/);
  assert.match(deletion, /table:\s*'account',\s*userColumn:\s*'userId'/);
  assert.doesNotMatch(deletion, /DELETE FROM session WHERE userId = \?/);
  assert.match(hooks, /learner_account_deletions/);
  assert.match(deletion, /phase:\s*'auth_verifications'/);
  assert.match(deletion, /table:\s*'verification',\s*userColumn:\s*'value'/);
  assert.match(migration, /EXISTS \(SELECT 1 FROM `session` x WHERE x\.`userId` = OLD\.`id`\)/);
  assert.match(migration, /EXISTS \(SELECT 1 FROM `verification` x WHERE x\.`value` = OLD\.`id`\)/);
  assert.match(migration, /EXISTS \(SELECT 1 FROM `account` x WHERE x\.`userId` = OLD\.`id`\)/);
  assert.match(migration, /account_learner_account_deletion_guard/);
});

test('PR G authoritative data-model/index documents include migration 0025 and no longer describe PR G as pending', () => {
  const model = source('docs/V1_DATA_MODEL.md');
  const index = source('docs/DOCUMENTATION_INDEX.md');
  assert.match(model, /0025_learner_fsrs_admin_analytics_deletion\.sql/);
  assert.match(model, /fsrs-analytics-schema\.js/);
  assert.match(model, /learner_system_monthly_buckets/);
  assert.match(model, /auth_sessions/);
  assert.match(model, /auth_accounts/);
  assert.match(index, /0025_learner_fsrs_admin_analytics_deletion\.sql/);
  assert.match(index, /LEARNER_FSRS_PR_G_EVIDENCE\.md/);
  assert.doesNotMatch(index, /PR G Admin\/cohort analytics, account deletion, and automatic optimizer execution remain separately owned/);
});

test('PR G does not resurrect legacy Review persistence', () => {
  const migration = source('drizzle/0025_learner_fsrs_admin_analytics_deletion.sql');
  const analytics = source('src/lib/server/db/fsrs-admin-analytics.ts');
  const deletion = source('src/lib/server/db/learner-account-deletion.ts');
  const combined = `${migration}\n${analytics}\n${deletion}`;

  assert.doesNotMatch(combined, /CREATE TABLE\s+`?(reviews|review_questions|review_assets)`?/i);
  assert.doesNotMatch(combined, /INSERT INTO\s+`?(reviews|review_questions|review_assets)`?/i);
});
