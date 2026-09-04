import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CONTENT_TABLES, FORBIDDEN_PRODUCTION_TABLES } from '../scripts/local-replica-lib.mjs';
import { ciValidationPlan } from '../scripts/validate-ci.mjs';
import { FAST_TEST_EXCLUSIONS, isMaintainedNodeTestPath } from '../scripts/test-selection.mjs';

const PR_G_SOURCE_CONTRACT_TEST = 'test/learner-fsrs-pr-g-source-contract.test.js';
const PR_G_AUTHORITY_DOCS = [
  'docs/DOCUMENTATION_INDEX.md',
  'docs/V1_DATA_MODEL.md',
  'docs/LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md',
  'docs/LEARNER_FSRS_STUDY_AND_RETENTION_PLAN.md',
  'docs/LEARNER_FSRS_TECHNICAL_DESIGN_AND_PR119_REUSE_PLAN.md',
  'docs/LEARNER_FSRS_IMPLEMENTATION_READINESS_CONTRACT.md',
  'docs/LEARNER_FSRS_PR_G_EVIDENCE.md',
];

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

/** @param {string} workflow */
function pullRequestPaths(workflow) {
  const paths = [];
  let inPullRequest = false;
  let inPaths = false;

  for (const line of workflow.split(/\r?\n/)) {
    if (line === '  pull_request:') {
      inPullRequest = true;
      inPaths = false;
      continue;
    }
    if (!inPullRequest) continue;
    if (line === '    paths:') {
      inPaths = true;
      continue;
    }
    if (!inPaths) {
      if (line && !line.startsWith('    ')) break;
      continue;
    }

    const pathMatch = line.match(/^      - ['"](.+)['"]$/);
    if (pathMatch) {
      paths.push(pathMatch[1]);
      continue;
    }
    if (line.trim() === '') continue;
    if (!line.startsWith('      ')) break;
  }

  assert.ok(paths.length > 0, 'PR G workflow must keep an explicit pull_request.paths contract');
  return paths;
}

/** @param {string} pattern @param {string} path */
function githubPathMatches(pattern, path) {
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      expression += '.*';
      index += 1;
    } else if (char === '*') {
      expression += '[^/]*';
    } else if (char === '?') {
      expression += '[^/]';
    } else {
      expression += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  expression += '$';
  return new RegExp(expression).test(path);
}

/** @param {string[]} patterns @param {string} path */
function workflowSelectsPath(patterns, path) {
  return patterns.some((pattern) => githubPathMatches(pattern, path));
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

test('PR G locks the pinned Better Auth identity-root and indexed non-FK verification cleanup boundary', () => {
  const packageJson = JSON.parse(source('package.json'));
  const adminRoute = source('src/routes/admin/learner-analytics/+page.server.js');
  const auth = source('src/lib/server/auth.js');
  const authConfig = source('src/lib/server/auth-config.js');
  const deletion = source('src/lib/server/db/learner-account-deletion.ts');
  const migration = source('drizzle/0025_learner_fsrs_admin_analytics_deletion.sql');
  const hooks = source('src/hooks.server.js');
  const d1Acceptance = source('scripts/learner-fsrs-pr-g-acceptance-d1.mjs');
  const d1AcceptanceWorker = source('scripts/learner-fsrs-pr-g-acceptance-d1-worker.js');

  assert.equal(packageJson.dependencies['better-auth'], '1.6.25');
  assert.match(auth, /getBetterAuthBaseOptions/);
  assert.match(adminRoute, /removeUserWithBetterAuth/);
  assert.match(authConfig, /auth\.api\.removeUser/);
  assert.match(d1AcceptanceWorker, /removeUserWithBetterAuth/);
  assert.match(d1AcceptanceWorker, /betterAuth\(/);
  assert.match(d1AcceptanceWorker, /plugins:\s*\[admin\(\)\]/);
  assert.match(d1Acceptance, /TARGET_VERIFICATION_ROWS\s*=\s*2_500/);
  assert.match(d1Acceptance, /UNRELATED_VERIFICATION_ROWS\s*=\s*5_000/);
  assert.match(d1Acceptance, /verificationBatchRows, \[1_000, 1_000, 500\]/);
  assert.match(d1Acceptance, /verification_value_idx/);

  assert.match(deletion, /phase:\s*'auth_sessions'/);
  assert.match(deletion, /table:\s*'session',\s*userColumn:\s*'userId'/);
  assert.match(deletion, /phase:\s*'auth_accounts'/);
  assert.match(deletion, /table:\s*'account',\s*userColumn:\s*'userId'/);
  assert.doesNotMatch(deletion, /DELETE FROM session WHERE userId = \?/);
  assert.match(hooks, /learner_account_deletions/);
  assert.match(deletion, /phase:\s*'auth_verifications'/);
  assert.match(deletion, /table:\s*'verification',\s*userColumn:\s*'value'/);
  assert.match(migration, /CREATE INDEX `verification_value_idx`\s+ON `verification` \(`value`\)/);
  assert.match(migration, /EXISTS \(SELECT 1 FROM `session` x WHERE x\.`userId` = OLD\.`id`\)/);
  assert.match(migration, /EXISTS \(SELECT 1 FROM `verification` x WHERE x\.`value` = OLD\.`id`\)/);
  assert.match(migration, /EXISTS \(SELECT 1 FROM `account` x WHERE x\.`userId` = OLD\.`id`\)/);
  assert.match(migration, /account_learner_account_deletion_guard/);
});

test('PR G D1 acceptance benchmark covers monthly write overhead, long-lived volume, and Admin aggregation cost', () => {
  const packageJson = JSON.parse(source('package.json'));
  const workflow = source('.github/workflows/learner-fsrs-pr-g-analytics-deletion.yml');
  const benchmark = source('scripts/learner-fsrs-pr-g-acceptance-d1-worker.js');

  assert.equal(packageJson.scripts['fsrs:pr-g-acceptance-d1'], 'node scripts/learner-fsrs-pr-g-acceptance-d1.mjs');
  assert.match(workflow, /npm run fsrs:pr-g-acceptance-d1/);
  assert.match(benchmark, /baselineWriteMs/);
  assert.match(benchmark, /monthlyBucketWriteMs/);
  assert.match(benchmark, /longRunningFixture/);
  assert.match(benchmark, /adminSystemAggregationMs/);
  assert.match(benchmark, /adminCohortAggregationMs/);
});

test('PR G heavy acceptance routing excludes authority-doc-only changes and retains material runtime/schema paths', () => {
  const workflow = source('.github/workflows/learner-fsrs-pr-g-analytics-deletion.yml');
  const paths = pullRequestPaths(workflow);

  for (const document of PR_G_AUTHORITY_DOCS) {
    assert.equal(workflowSelectsPath(paths, document), false, document);
  }

  for (const materialPath of [
    'drizzle/0025_learner_fsrs_admin_analytics_deletion.sql',
    'src/hooks.server.js',
    'src/lib/server/db/learner-account-deletion.ts',
    'src/routes/admin/learner-analytics/+page.server.js',
  ]) {
    assert.equal(workflowSelectsPath(paths, materialPath), true, materialPath);
  }
});

test('FSRS authority docs remain covered by cheap ordinary Draft source-contract validation', () => {
  const authorityDoc = 'docs/LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md';
  const plan = ciValidationPlan({ mode: 'fast', changedFiles: [authorityDoc] });

  assert.deepEqual(plan.checkIds, ['diff', 'testFast', 'svelte']);
  assert.equal(isMaintainedNodeTestPath(PR_G_SOURCE_CONTRACT_TEST), true);
  assert.equal(FAST_TEST_EXCLUSIONS.includes(PR_G_SOURCE_CONTRACT_TEST), false);
});

test('PR G workflow keeps critical specialized acceptance commands without duplicating full repository validation', () => {
  const workflow = source('.github/workflows/learner-fsrs-pr-g-analytics-deletion.yml');
  const ordinaryCi = source('.github/workflows/ci.yml');

  for (const required of [
    'test/learner-fsrs-pr-g.test.js',
    'test/learner-fsrs-pr-g-verification-guard.test.js',
    PR_G_SOURCE_CONTRACT_TEST,
    'npm run fsrs:account-deletion-benchmark',
    'npm run fsrs:account-deletion-d1-smoke',
    'npm run fsrs:pr-g-acceptance-d1',
    'npm run runtime:smoke',
  ]) {
    assert.equal(workflow.includes(required), true, required);
  }

  assert.equal(workflow.includes('npm run validate:full'), false);
  assert.match(ordinaryCi, /VALIDATION_MODE: \$\{\{ github\.event\.pull_request\.draft && 'fast' \|\| 'full' \}\}/);
  assert.match(ordinaryCi, /node scripts\/validate-ci\.mjs --mode/);
});

test('PR G workflow uses repository CI install and superseded-run cancellation conventions', () => {
  const workflow = source('.github/workflows/learner-fsrs-pr-g-analytics-deletion.yml');

  assert.match(workflow, /cache-dependency-path: package-lock\.json/);
  assert.match(workflow, /npm ci --prefer-offline --no-audit --no-fund/);
  assert.match(workflow, /group: \$\{\{ github\.workflow \}\}-pr-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
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
