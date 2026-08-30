import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChangedFiles } from '../scripts/agent-checks-lib.mjs';
import {
  ciCommandArgs,
  ciCommandEnvironment,
  ciValidationPlan,
} from '../scripts/validate-ci.mjs';
import {
  CI_SPECIALIZED_CHECK_IDS,
  resolveValidationCheckIds,
  VALIDATION_MODE_CHECK_IDS,
} from '../scripts/validation-contract.mjs';
import { changedFilesFromFeatureDiff } from '../scripts/validation-git.mjs';
import { FAST_TEST_EXCLUSIONS } from '../scripts/test-selection.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

/** @param {string} cwd @param {string[]} args */
function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr || result.error?.message || ''}`);
  return String(result.stdout ?? '').trim();
}

function makeDivergedRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-ci-diff-'));
  runGit(root, ['init', '-b', 'main']);
  runGit(root, ['config', 'user.name', 'CI Diff Test']);
  runGit(root, ['config', 'user.email', 'ci-diff@example.invalid']);
  fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
  runGit(root, ['add', 'base.txt']);
  runGit(root, ['commit', '-m', 'base']);

  runGit(root, ['switch', '-c', 'feature']);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'feature.js'), 'export const feature = true;\n');
  runGit(root, ['add', 'src/feature.js']);
  runGit(root, ['commit', '-m', 'feature']);
  const featureHead = runGit(root, ['rev-parse', 'HEAD']);

  runGit(root, ['switch', 'main']);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'upstream.js'), 'export const upstream = true;\n');
  runGit(root, ['add', 'src/upstream.js']);
  runGit(root, ['commit', '-m', 'upstream']);
  const baseHead = runGit(root, ['rev-parse', 'HEAD']);
  return { root, baseHead, featureHead };
}

test('unrelated Draft resolves to base fast validation only', () => {
  const plan = ciValidationPlan({
    mode: 'fast',
    changedFiles: ['src/lib/components/example.js'],
  });
  assert.deepEqual(plan.checkIds, ['diff', 'testFast', 'svelte']);
  assert.deepEqual(plan.classification.specializedRequiredChecks, []);
});

test('slide-review Draft adds both specialized slide-review owners', () => {
  const plan = ciValidationPlan({
    mode: 'fast',
    changedFiles: ['tools/slide-import-review/scripts/finalize.mjs'],
  });
  assert.deepEqual(plan.classification.specializedRequiredChecks, ['slideReviewTest', 'slideReviewBuild']);
  assert.deepEqual(plan.checkIds, [
    'diff',
    'testFast',
    'svelte',
    'slideReviewTest',
    'slideReviewBuild',
  ]);
});

test('slide-review full validation keeps build but complete test satisfies specialized Node coverage', () => {
  const plan = ciValidationPlan({
    mode: 'full',
    changedFiles: ['tools/slide-import-review/src/main.js'],
  });
  assert.deepEqual(plan.checkIds, [
    'diff',
    'db',
    'test',
    'svelte',
    'build',
    'authSmoke',
    'slideReviewBuild',
  ]);
  assert.equal(plan.checkIds.includes('slideReviewTest'), false);
  assert.deepEqual(
    resolveValidationCheckIds(['test'], ['slideReviewTest', 'slideReviewBuild']),
    ['test', 'slideReviewBuild'],
  );
});

test('agent reporting and CI planning consume one specialized requirement authority', () => {
  const changedFiles = ['tools/slide-import-review/scripts/finalize.mjs'];
  const agentClassification = classifyChangedFiles(changedFiles);
  const ciPlan = ciValidationPlan({ mode: 'fast', changedFiles });
  assert.deepEqual(ciPlan.classification, agentClassification);
  assert.deepEqual(agentClassification.specializedRequiredChecks, ['slideReviewTest', 'slideReviewBuild']);
  for (const checkId of agentClassification.specializedRequiredChecks) {
    assert.equal(agentClassification.requiredChecks.includes(checkId), true);
  }

  const classifierSource = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'agent-checks-lib.mjs'), 'utf8');
  const agentRunnerSource = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'agent-checks.mjs'), 'utf8');
  const ciRunnerSource = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'validate-ci.mjs'), 'utf8');
  assert.equal(agentRunnerSource.includes("from './agent-checks-lib.mjs'"), true);
  assert.equal(ciRunnerSource.includes("from './agent-checks-lib.mjs'"), true);
  assert.equal(classifierSource.includes('tools\\/slide-import-review'), true);
  assert.equal(ciRunnerSource.includes('tools\\/slide-import-review'), false);
});

test('validation infrastructure changes preserve base fast and add conservative specialized checks', () => {
  for (const file of [
    'scripts/validation-contract.mjs',
    'scripts/validate-ci.mjs',
    'scripts/validate.mjs',
    'scripts/agent-checks-lib.mjs',
    'scripts/test-selection.mjs',
    'scripts/test-fast.mjs',
    '.github/workflows/ci.yml',
    'package.json',
  ]) {
    const classification = classifyChangedFiles([file]);
    assert.deepEqual(classification.specializedRequiredChecks, CI_SPECIALIZED_CHECK_IDS, file);
    for (const checkId of CI_SPECIALIZED_CHECK_IDS) {
      assert.equal(classification.requiredChecks.includes(checkId), true, `${file}: ${checkId}`);
    }
    const plan = ciValidationPlan({ mode: 'fast', changedFiles: [file] });
    assert.deepEqual(plan.checkIds, [
      'diff',
      'testFast',
      'svelte',
      'slideReviewTest',
      'slideReviewBuild',
    ], file);
  }
});

test('unclassified important paths preserve base fast while conservatively adding specialized checks', () => {
  const classification = classifyChangedFiles(['tools/new-validation-helper.mjs']);
  assert.deepEqual(classification.unclassifiedImportant, ['tools/new-validation-helper.mjs']);
  assert.deepEqual(classification.specializedRequiredChecks, CI_SPECIALIZED_CHECK_IDS);
  assert.deepEqual(
    ciValidationPlan({ mode: 'fast', changedFiles: ['tools/new-validation-helper.mjs'] }).checkIds,
    ['diff', 'testFast', 'svelte', 'slideReviewTest', 'slideReviewBuild'],
  );
});

test('actual CI feature-diff helper excludes unrelated base-branch advancement', () => {
  const { root, baseHead, featureHead } = makeDivergedRepository();
  try {
    assert.deepEqual(changedFilesFromFeatureDiff(root, baseHead, featureHead), ['src/feature.js']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('specialized Node checks keep structured reporter identity without altering base Node-check environments', () => {
  assert.deepEqual(ciCommandArgs('slideReviewTest', ['run', 'slide-review:test']), ['run', 'slide-review:test']);
  const env = ciCommandEnvironment('slideReviewTest', { NODE_OPTIONS: '--trace-warnings' });
  assert.equal(env.CI_NODE_TEST_CHECK_ID, 'slideReviewTest');
  assert.equal(env.CI_NODE_TEST_REPRO_COMMAND, 'npm run slide-review:test');
  assert.match(env.NODE_OPTIONS ?? '', /--trace-warnings/);
  assert.match(env.NODE_OPTIONS ?? '', /--test-reporter=\.\/scripts\/ci-test-reporter\.mjs/);

  assert.deepEqual(
    ciCommandArgs('test', ['test']),
    ['test', '--', '--test-reporter=./scripts/ci-test-reporter.mjs'],
  );
  assert.deepEqual(ciCommandEnvironment('test', {}), {});
  assert.deepEqual(ciCommandEnvironment('testFast', {}), {});
});

test('workflow remains orchestration-only while fetching enough history for a true PR feature diff', () => {
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.equal(workflow.includes('fetch-depth: 0'), true);
  assert.equal(workflow.includes('tools/slide-import-review'), false);
  assert.equal(workflow.includes('slideReviewTest'), false);
  assert.equal(workflow.includes('slideReviewBuild'), false);
  assert.equal(workflow.includes('FAST_TEST_EXCLUSIONS'), false);
  assert.equal(workflow.includes('classifyChangedFiles'), false);
  assert.equal(/\.test\.(?:cjs|mjs|js)/.test(workflow), false);
  assert.equal(workflow.includes('CI_PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}'), true);
  assert.equal(workflow.includes('CI_PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}'), true);
});

test('Checkpoint 2B activates no fast-test exclusions and invalid validation configuration fails loudly', () => {
  assert.deepEqual(FAST_TEST_EXCLUSIONS, []);
  assert.deepEqual(VALIDATION_MODE_CHECK_IDS.fast, ['diff', 'testFast', 'svelte']);
  assert.deepEqual(VALIDATION_MODE_CHECK_IDS.full, ['diff', 'db', 'test', 'svelte', 'build', 'authSmoke']);
  assert.throws(
    () => resolveValidationCheckIds(['diff'], ['notARealCheck']),
    /Unknown validation check: notARealCheck/,
  );
});
