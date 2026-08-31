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
  ciReproCommand,
  ciValidationPlan,
  isCiNodeTestCheck,
} from '../scripts/validate-ci.mjs';
import {
  CI_SPECIALIZED_CHECK_IDS,
  resolveValidationCheckIds,
  validationCheckSatisfies,
  validationCommand,
  VALIDATION_MODE_CHECK_IDS,
} from '../scripts/validation-contract.mjs';
import { changedFilesFromFeatureDiff } from '../scripts/validation-git.mjs';
import {
  FAST_TEST_EXCLUSIONS,
  discoverMaintainedNodeTests,
  selectFastNodeTests,
} from '../scripts/test-selection.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const ECG_CHECK = 'ecgAssetRenameOperatorTest';
const TAXONOMY_CHECK = 'productionTaxonomyOperatorTest';
const OPERATOR_CHECKS = [ECG_CHECK, TAXONOMY_CHECK];
const SLIDE_REVIEW_TESTS = [
  'tools/slide-import-review/tests/build.test.js',
  'tools/slide-import-review/tests/core.test.js',
  'tools/slide-import-review/tests/review-fixes.test.js',
  'tools/slide-import-review/tests/source-coverage.test.js',
];
const SLIDE_REVIEW_PRODUCTION_CONTRACT_PATHS = [
  'src/lib/server/import/content-package.js',
  'src/lib/server/import/reviewed-content-package.js',
  'src/lib/server/storage/media.js',
];
const ECG_TEST = 'test/ecg-batch-01-asset-rename.test.js';
const TAXONOMY_TEST = 'test/production-taxonomy-operator.test.js';

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

test('Checkpoint 2D fast selection omits exactly the six specialized tests while complete discovery retains them', async () => {
  assert.equal(FAST_TEST_EXCLUSIONS.length, 6);
  const complete = await discoverMaintainedNodeTests(repositoryRoot);
  const selection = selectFastNodeTests(complete, FAST_TEST_EXCLUSIONS);

  assert.deepEqual(selection.excluded, [...FAST_TEST_EXCLUSIONS].sort());
  assert.equal(selection.selected.length, complete.length - 6);
  for (const file of FAST_TEST_EXCLUSIONS) {
    assert.equal(complete.includes(file), true, `complete discovery: ${file}`);
    assert.equal(selection.selected.includes(file), false, `fast omission: ${file}`);
  }
});

test('unrelated Draft resolves to base fast validation only with no specialized owner', () => {
  const plan = ciValidationPlan({
    mode: 'fast',
    changedFiles: ['src/lib/components/example.js'],
  });
  assert.deepEqual(plan.checkIds, ['diff', 'testFast', 'svelte']);
  assert.deepEqual(plan.classification.specializedRequiredChecks, []);
  for (const checkId of CI_SPECIALIZED_CHECK_IDS) assert.equal(plan.checkIds.includes(checkId), false);
});

test('ECG operator paths have exact central ownership including the imported target manifest', () => {
  for (const file of [
    'scripts/rename-ecg-batch-01-assets.mjs',
    'scripts/ecg-batch-01-asset-rename-targets.mjs',
    ECG_TEST,
  ]) {
    const report = classifyChangedFiles([file]);
    assert.deepEqual(report.specializedRequiredChecks, [ECG_CHECK], file);
    assert.equal(report.specializedRequiredChecks.includes(TAXONOMY_CHECK), false, file);
  }
});

test('taxonomy operator script and dedicated test have exact central ownership', () => {
  for (const file of [
    'scripts/apply-agreed-taxonomy.mjs',
    TAXONOMY_TEST,
  ]) {
    const report = classifyChangedFiles([file]);
    assert.deepEqual(report.specializedRequiredChecks, [TAXONOMY_CHECK], file);
    assert.equal(report.specializedRequiredChecks.includes(ECG_CHECK), false, file);
  }
});

test('ECG-related Draft adds the named ECG operator check once', () => {
  const plan = ciValidationPlan({
    mode: 'fast',
    changedFiles: ['scripts/rename-ecg-batch-01-assets.mjs'],
  });
  assert.deepEqual(plan.classification.specializedRequiredChecks, [ECG_CHECK]);
  assert.deepEqual(plan.checkIds, ['diff', 'testFast', 'svelte', ECG_CHECK]);
  assert.equal(plan.checkIds.filter((id) => id === ECG_CHECK).length, 1);
  assert.equal(FAST_TEST_EXCLUSIONS.includes(ECG_TEST), true);
});

test('taxonomy-related Draft adds the named taxonomy operator check once', () => {
  const plan = ciValidationPlan({
    mode: 'fast',
    changedFiles: ['scripts/apply-agreed-taxonomy.mjs'],
  });
  assert.deepEqual(plan.classification.specializedRequiredChecks, [TAXONOMY_CHECK]);
  assert.deepEqual(plan.checkIds, ['diff', 'testFast', 'svelte', TAXONOMY_CHECK]);
  assert.equal(plan.checkIds.filter((id) => id === TAXONOMY_CHECK).length, 1);
  assert.equal(FAST_TEST_EXCLUSIONS.includes(TAXONOMY_TEST), true);
});

test('Draft changing both operator families adds both named checks without duplicates', () => {
  const plan = ciValidationPlan({
    mode: 'fast',
    changedFiles: [
      'scripts/rename-ecg-batch-01-assets.mjs',
      TAXONOMY_TEST,
    ],
  });
  assert.deepEqual(plan.classification.specializedRequiredChecks, OPERATOR_CHECKS);
  assert.deepEqual(plan.checkIds, ['diff', 'testFast', 'svelte', ...OPERATOR_CHECKS]);
  assert.equal(plan.checkIds.length, new Set(plan.checkIds).size);
});

test('full test explicitly satisfies both operator checks while testFast does not', () => {
  for (const checkId of OPERATOR_CHECKS) {
    assert.equal(validationCheckSatisfies('test', checkId), true, checkId);
    assert.equal(validationCheckSatisfies('testFast', checkId), false, checkId);
    assert.deepEqual(resolveValidationCheckIds(['test'], [checkId]), ['test'], checkId);
  }
});

test('operator-related full validation uses complete full base without redundant narrow checks', () => {
  for (const changedFiles of [
    ['scripts/rename-ecg-batch-01-assets.mjs'],
    ['scripts/apply-agreed-taxonomy.mjs'],
    ['scripts/rename-ecg-batch-01-assets.mjs', 'scripts/apply-agreed-taxonomy.mjs'],
  ]) {
    const plan = ciValidationPlan({ mode: 'full', changedFiles });
    assert.deepEqual(plan.checkIds, VALIDATION_MODE_CHECK_IDS.full, changedFiles.join(', '));
    for (const checkId of OPERATOR_CHECKS) assert.equal(plan.checkIds.includes(checkId), false);
  }
});

test('named operator checks own the dedicated direct Node test commands', () => {
  assert.deepEqual(validationCommand(ECG_CHECK), {
    id: ECG_CHECK,
    label: 'Run ECG Batch 01 Asset rename operator tests',
    command: 'node',
    args: ['--test', ECG_TEST],
  });
  assert.deepEqual(validationCommand(TAXONOMY_CHECK), {
    id: TAXONOMY_CHECK,
    label: 'Run production taxonomy operator tests',
    command: 'node',
    args: ['--test', TAXONOMY_TEST],
  });
});

test('slide-review Draft adds both specialized slide-review owners while generic fast omits all four files', () => {
  for (const file of SLIDE_REVIEW_TESTS) assert.equal(FAST_TEST_EXCLUSIONS.includes(file), true, file);
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

test('slide-review production dependencies require the excluded test owner without an unnecessary build', () => {
  assert.equal(validationCheckSatisfies('test', 'slideReviewTest'), true);
  assert.equal(validationCheckSatisfies('testFast', 'slideReviewTest'), false);

  for (const file of SLIDE_REVIEW_PRODUCTION_CONTRACT_PATHS) {
    const classification = classifyChangedFiles([file]);
    assert.deepEqual(classification.specializedRequiredChecks, ['slideReviewTest'], file);
    assert.equal(classification.specializedRequiredChecks.includes('slideReviewBuild'), false, file);

    const fastPlan = ciValidationPlan({ mode: 'fast', changedFiles: [file] });
    assert.deepEqual(fastPlan.checkIds, ['diff', 'testFast', 'svelte', 'slideReviewTest'], file);
    assert.equal(fastPlan.checkIds.filter((id) => id === 'slideReviewTest').length, 1, file);

    const fullPlan = ciValidationPlan({ mode: 'full', changedFiles: [file] });
    assert.deepEqual(fullPlan.checkIds, VALIDATION_MODE_CHECK_IDS.full, file);
    assert.equal(fullPlan.checkIds.includes('slideReviewTest'), false, file);
    assert.equal(fullPlan.checkIds.includes('slideReviewBuild'), false, file);
  }
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
  assert.equal(validationCheckSatisfies('test', 'slideReviewTest'), true);
  assert.equal(validationCheckSatisfies('testFast', 'slideReviewTest'), false);
  assert.deepEqual(
    resolveValidationCheckIds(['test'], ['slideReviewTest', 'slideReviewBuild']),
    ['test', 'slideReviewBuild'],
  );
});

test('Draft changing all three specialized families adds every owner exactly once', () => {
  const plan = ciValidationPlan({
    mode: 'fast',
    changedFiles: [
      'tools/slide-import-review/scripts/finalize.mjs',
      'scripts/rename-ecg-batch-01-assets.mjs',
      'scripts/apply-agreed-taxonomy.mjs',
    ],
  });
  assert.deepEqual(plan.classification.specializedRequiredChecks, CI_SPECIALIZED_CHECK_IDS);
  assert.deepEqual(plan.checkIds, ['diff', 'testFast', 'svelte', ...CI_SPECIALIZED_CHECK_IDS]);
  assert.equal(plan.checkIds.length, new Set(plan.checkIds).size);
});

test('full validation across all three specialized families deduplicates Node owners but keeps slide-review build', () => {
  const plan = ciValidationPlan({
    mode: 'full',
    changedFiles: [
      'tools/slide-import-review/scripts/finalize.mjs',
      'scripts/rename-ecg-batch-01-assets.mjs',
      'scripts/apply-agreed-taxonomy.mjs',
    ],
  });
  assert.deepEqual(plan.checkIds, [...VALIDATION_MODE_CHECK_IDS.full, 'slideReviewBuild']);
  for (const checkId of [...OPERATOR_CHECKS, 'slideReviewTest']) {
    assert.equal(plan.checkIds.includes(checkId), false, checkId);
  }
});

test('agent reporting and CI planning consume one specialized requirement authority', () => {
  const changedFiles = [
    'scripts/rename-ecg-batch-01-assets.mjs',
    'scripts/apply-agreed-taxonomy.mjs',
    'tools/slide-import-review/scripts/finalize.mjs',
  ];
  const agentClassification = classifyChangedFiles(changedFiles);
  const ciPlan = ciValidationPlan({ mode: 'fast', changedFiles });
  assert.deepEqual(ciPlan.classification, agentClassification);
  assert.deepEqual(agentClassification.specializedRequiredChecks, CI_SPECIALIZED_CHECK_IDS);
  for (const checkId of agentClassification.specializedRequiredChecks) {
    assert.equal(agentClassification.requiredChecks.includes(checkId), true);
  }

  const classifierSource = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'agent-checks-lib.mjs'), 'utf8');
  const agentRunnerSource = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'agent-checks.mjs'), 'utf8');
  const ciRunnerSource = fs.readFileSync(path.join(repositoryRoot, 'scripts', 'validate-ci.mjs'), 'utf8');
  assert.equal(agentRunnerSource.includes("from './agent-checks-lib.mjs'"), true);
  assert.equal(ciRunnerSource.includes("from './agent-checks-lib.mjs'"), true);
  for (const ownedPath of [
    'rename-ecg-batch-01-assets',
    'ecg-batch-01-asset-rename-targets',
    'apply-agreed-taxonomy',
    'production-taxonomy-operator',
    'tools\\/slide-import-review',
  ]) {
    assert.equal(classifierSource.includes(ownedPath), true, ownedPath);
    assert.equal(ciRunnerSource.includes(ownedPath), false, ownedPath);
  }
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
      ...CI_SPECIALIZED_CHECK_IDS,
    ], file);
  }
});

test('validation infrastructure fail-safe preserves full base while deduplicating complete Node-owned checks', () => {
  const plan = ciValidationPlan({
    mode: 'full',
    changedFiles: ['scripts/validation-contract.mjs'],
  });
  assert.deepEqual(plan.classification.specializedRequiredChecks, CI_SPECIALIZED_CHECK_IDS);
  assert.deepEqual(plan.checkIds, [
    ...VALIDATION_MODE_CHECK_IDS.full,
    'slideReviewBuild',
  ]);
  for (const checkId of [...OPERATOR_CHECKS, 'slideReviewTest']) {
    assert.equal(plan.checkIds.includes(checkId), false, checkId);
  }
});

test('unclassified important paths preserve base fast while conservatively adding specialized checks', () => {
  const classification = classifyChangedFiles(['tools/new-validation-helper.mjs']);
  assert.deepEqual(classification.unclassifiedImportant, ['tools/new-validation-helper.mjs']);
  assert.deepEqual(classification.specializedRequiredChecks, CI_SPECIALIZED_CHECK_IDS);
  assert.deepEqual(
    ciValidationPlan({ mode: 'fast', changedFiles: ['tools/new-validation-helper.mjs'] }).checkIds,
    ['diff', 'testFast', 'svelte', ...CI_SPECIALIZED_CHECK_IDS],
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

test('all specialized Node checks keep structured reporter identity without altering base Node-check environments', () => {
  /** @type {Array<[string, string[], string]>} */
  const specialized = [
    [ECG_CHECK, ['--test', ECG_TEST], `node --test ${ECG_TEST}`],
    [TAXONOMY_CHECK, ['--test', TAXONOMY_TEST], `node --test ${TAXONOMY_TEST}`],
    ['slideReviewTest', ['run', 'slide-review:test'], 'npm run slide-review:test'],
  ];
  for (const [checkId, args, repro] of specialized) {
    assert.equal(isCiNodeTestCheck(checkId), true, checkId);
    assert.deepEqual(ciCommandArgs(checkId, args), args, checkId);
    const env = ciCommandEnvironment(checkId, { ...process.env, NODE_OPTIONS: '--trace-warnings' });
    assert.equal(env.CI_NODE_TEST_CHECK_ID, checkId);
    assert.equal(env.CI_NODE_TEST_REPRO_COMMAND, repro);
    assert.match(env.NODE_OPTIONS ?? '', /--trace-warnings/);
    assert.match(env.NODE_OPTIONS ?? '', /--test-reporter=\.\/scripts\/ci-test-reporter\.mjs/);
    const command = checkId === 'slideReviewTest' ? 'npm' : 'node';
    assert.equal(ciReproCommand(checkId, command, args), repro);
  }

  assert.deepEqual(
    ciCommandArgs('test', ['test']),
    ['test', '--', '--test-reporter=./scripts/ci-test-reporter.mjs'],
  );
  const baseEnv = { ...process.env };
  assert.deepEqual(ciCommandEnvironment('test', baseEnv), baseEnv);
  assert.deepEqual(ciCommandEnvironment('testFast', baseEnv), baseEnv);
  assert.equal(isCiNodeTestCheck('test'), true);
  assert.equal(isCiNodeTestCheck('testFast'), true);
});

test('workflow remains orchestration-only while fetching enough history for a true PR feature diff', () => {
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.equal(workflow.includes('fetch-depth: 0'), true);
  for (const forbidden of [
    'tools/slide-import-review',
    'slideReviewTest',
    'slideReviewBuild',
    'rename-ecg-batch-01-assets',
    'ecg-batch-01-asset-rename',
    'apply-agreed-taxonomy',
    'production-taxonomy-operator',
    ECG_CHECK,
    TAXONOMY_CHECK,
    'FAST_TEST_EXCLUSIONS',
    'classifyChangedFiles',
  ]) {
    assert.equal(workflow.includes(forbidden), false, forbidden);
  }
  assert.equal(/\.test\.(?:cjs|mjs|js)/.test(workflow), false);
  assert.equal(workflow.includes('CI_PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}'), true);
  assert.equal(workflow.includes('CI_PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}'), true);
});

test('Checkpoint 2D preserves the base validation contracts and invalid configuration still fails loudly', () => {
  assert.equal(FAST_TEST_EXCLUSIONS.length, 6);
  assert.deepEqual(VALIDATION_MODE_CHECK_IDS.fast, ['diff', 'testFast', 'svelte']);
  assert.deepEqual(VALIDATION_MODE_CHECK_IDS.full, ['diff', 'db', 'test', 'svelte', 'build', 'authSmoke']);
  assert.throws(
    () => resolveValidationCheckIds(['diff'], ['notARealCheck']),
    /Unknown validation check: notARealCheck/,
  );
});
