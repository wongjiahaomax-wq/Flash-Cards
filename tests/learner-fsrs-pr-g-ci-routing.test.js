import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { ciValidationPlan } from '../scripts/validate-ci.mjs';
import { FAST_TEST_EXCLUSIONS, isMaintainedNodeTestPath } from '../scripts/test-selection.mjs';

const PR_G_WORKFLOW = '.github/workflows/learner-fsrs-pr-g-analytics-deletion.yml';
const PR_G_REGRESSION_TESTS = [
  'test/learner-fsrs-pr-g.test.js',
  'test/learner-fsrs-pr-g-source-contract.test.js',
  'test/learner-fsrs-pr-g-verification-guard.test.js',
];
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

test('PR G heavy acceptance routing excludes non-behavior changes and retains material runtime/schema paths', () => {
  const paths = pullRequestPaths(source(PR_G_WORKFLOW));

  for (const document of PR_G_AUTHORITY_DOCS) {
    assert.equal(workflowSelectsPath(paths, document), false, document);
  }
  assert.equal(workflowSelectsPath(paths, 'src/routes/admin/+layout.svelte'), false);

  for (const materialPath of [
    'drizzle/0025_learner_fsrs_admin_analytics_deletion.sql',
    'src/hooks.server.js',
    'src/lib/server/db/index.js',
    'src/lib/server/db/learner-account-deletion.ts',
    'src/routes/admin/learner-analytics/+page.server.js',
  ]) {
    assert.equal(workflowSelectsPath(paths, materialPath), true, materialPath);
  }
});

test('FSRS authority docs retain cheap ordinary Draft validation while PR G regressions stay in the fast suite', () => {
  const authorityDoc = 'docs/LEARNER_FSRS_RUNTIME_CUTOVER_STATUS.md';
  const plan = ciValidationPlan({ mode: 'fast', changedFiles: [authorityDoc] });

  assert.deepEqual(plan.checkIds, ['diff', 'testFast', 'svelte']);
  for (const regressionTest of PR_G_REGRESSION_TESTS) {
    assert.equal(isMaintainedNodeTestPath(regressionTest), true, regressionTest);
    assert.equal(FAST_TEST_EXCLUSIONS.includes(regressionTest), false, regressionTest);
  }
});

test('PR G workflow keeps unique specialized acceptance commands without duplicating ordinary Node/full validation', () => {
  const workflow = source(PR_G_WORKFLOW);
  const ordinaryCi = source('.github/workflows/ci.yml');

  for (const required of [
    'npm run db:check',
    'npm run fsrs:account-deletion-benchmark',
    'npm run fsrs:account-deletion-d1-smoke',
    'npm run fsrs:pr-g-acceptance-d1',
    'npm run runtime:smoke',
  ]) {
    assert.equal(workflow.includes(required), true, required);
  }

  assert.doesNotMatch(workflow, /node --test .*learner-fsrs-pr-g/);
  assert.equal(workflow.includes('npm run validate:full'), false);
  assert.match(ordinaryCi, /VALIDATION_MODE: \$\{\{ github\.event\.pull_request\.draft && 'fast' \|\| 'full' \}\}/);
  assert.match(ordinaryCi, /node scripts\/validate-ci\.mjs --mode/);
});

test('PR G workflow uses repository CI install and superseded-run cancellation conventions', () => {
  const workflow = source(PR_G_WORKFLOW);

  assert.match(workflow, /cache-dependency-path: package-lock\.json/);
  assert.match(workflow, /npm ci --prefer-offline --no-audit --no-fund/);
  assert.match(workflow, /group: \$\{\{ github\.workflow \}\}-pr-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
});
