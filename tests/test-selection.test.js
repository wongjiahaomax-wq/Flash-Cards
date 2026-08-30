import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runFastNodeTests } from '../scripts/test-fast.mjs';
import {
  FAST_TEST_EXCLUSIONS,
  discoverMaintainedNodeTests,
  isMaintainedNodeTestPath,
  selectFastNodeTests,
} from '../scripts/test-selection.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const APPROVED_FAST_TEST_EXCLUSIONS = [
  'tools/slide-import-review/tests/build.test.js',
  'tools/slide-import-review/tests/core.test.js',
  'tools/slide-import-review/tests/review-fixes.test.js',
  'tools/slide-import-review/tests/source-coverage.test.js',
  'test/ecg-batch-01-asset-rename.test.js',
  'test/production-taxonomy-operator.test.js',
];

/** @param {string} root @param {readonly string[]} files */
function writeEmptyTests(root, files) {
  for (const file of files) {
    const absolute = path.join(root, ...file.split('/'));
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, '');
  }
}

test('maintained Node-test discovery accepts ordinary Node-standard basenames without treating fast-test tooling as tests', () => {
  assert.equal(isMaintainedNodeTestPath('test/example.test.js'), true);
  assert.equal(isMaintainedNodeTestPath('tests/example.test.mjs'), true);
  assert.equal(isMaintainedNodeTestPath('tools/example.test.cjs'), true);
  assert.equal(isMaintainedNodeTestPath('test/example-test.js'), true);
  assert.equal(isMaintainedNodeTestPath('test/example_test.mjs'), true);
  assert.equal(isMaintainedNodeTestPath('tests/test-example.cjs'), true);
  assert.equal(isMaintainedNodeTestPath('checks/test.js'), true);
  assert.equal(isMaintainedNodeTestPath('test/current-schema.js'), false);
  assert.equal(isMaintainedNodeTestPath('scripts/test-fast.mjs'), false);
  assert.equal(isMaintainedNodeTestPath('scripts/test-selection.mjs'), false);
  assert.equal(isMaintainedNodeTestPath('node_modules/pkg/example.test.js'), false);
  assert.equal(isMaintainedNodeTestPath('.svelte-kit/output/example.test.js'), false);
});

test('new ordinary Node-standard tests enter fast selection without an allow-list change', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-test-selection-'));
  try {
    for (const directory of ['checks', 'src', 'test', 'tests', 'node_modules/pkg']) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    fs.writeFileSync(path.join(root, 'src', 'new-contract.test.js'), '');
    fs.writeFileSync(path.join(root, 'tests', 'new-contract-test.mjs'), '');
    fs.writeFileSync(path.join(root, 'checks', 'new_contract_test.cjs'), '');
    fs.writeFileSync(path.join(root, 'checks', 'test-new-contract.js'), '');
    fs.writeFileSync(path.join(root, 'checks', 'test.js'), '');
    fs.writeFileSync(path.join(root, 'test', 'helper.js'), '');
    fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'ignored.test.js'), '');

    const discovered = await discoverMaintainedNodeTests(root);
    const expected = [
      'checks/new_contract_test.cjs',
      'checks/test-new-contract.js',
      'checks/test.js',
      'src/new-contract.test.js',
      'tests/new-contract-test.mjs',
    ].sort();
    assert.deepEqual(discovered, expected);
    assert.deepEqual(selectFastNodeTests(discovered, []).selected, expected);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fast runner uses explicit deterministic selection, fast reporter identity, and preserves child exit status', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-test-fast-runner-'));
  try {
    fs.writeFileSync(path.join(root, 'z.test.js'), '');
    fs.writeFileSync(path.join(root, 'a-test.mjs'), '');
    writeEmptyTests(root, FAST_TEST_EXCLUSIONS);
    /** @type {{ command: string, args: string[], options: any }[]} */
    const calls = [];
    /** @param {string} command @param {string[]} args @param {any} options */
    function mockSpawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 7 };
    }

    const status = await runFastNodeTests({
      root,
      argv: ['--test-reporter=spec'],
      spawn: /** @type {any} */ (mockSpawn),
    });

    assert.equal(status, 7);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, process.execPath);
    assert.deepEqual(calls[0].args, [
      '--test',
      '--test-reporter=spec',
      'a-test.mjs',
      'z.test.js',
    ]);
    assert.equal(calls[0].options.cwd, root);
    assert.equal(calls[0].options.shell, false);
    assert.equal(calls[0].options.stdio, 'inherit');
    assert.equal(calls[0].options.env.CI_NODE_TEST_CHECK_ID, 'testFast');
    assert.equal(calls[0].options.env.CI_NODE_TEST_REPRO_COMMAND, 'npm run test:fast');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fast runner refuses an empty selection instead of falling back to implicit Node discovery', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-test-fast-empty-'));
  try {
    writeEmptyTests(root, FAST_TEST_EXCLUSIONS);
    await assert.rejects(
      () => runFastNodeTests({
        root,
        spawn: /** @type {any} */ (() => {
          throw new Error('spawn must not run');
        }),
      }),
      /selection resolved to zero maintained tests/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('test-fast tooling stays inert when Node executes it as a test child', () => {
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'scripts', 'test-fast.mjs')], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: 'child-v8' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('fast selection fails loudly when an exclusion is missing', () => {
  assert.throws(
    () => selectFastNodeTests(['test/existing.test.js'], ['test/missing.test.js']),
    /exclusion does not exist in maintained discovery: test\/missing\.test\.js/,
  );
});

test('fast selection fails loudly when exclusions contain duplicates', () => {
  assert.throws(
    () => selectFastNodeTests(['test/existing.test.js'], ['test/existing.test.js', 'test/existing.test.js']),
    /exclusions must not contain duplicate paths/,
  );
});

test('fast selection deterministically accounts for every discovered maintained test', () => {
  const selection = selectFastNodeTests(
    ['test/z.test.js', 'test/a.test.js', 'test/z.test.js'],
    ['test/z.test.js'],
  );
  assert.deepEqual(selection.complete, ['test/a.test.js', 'test/z.test.js']);
  assert.deepEqual(selection.selected, ['test/a.test.js']);
  assert.deepEqual(selection.excluded, ['test/z.test.js']);
  assert.deepEqual([...selection.selected, ...selection.excluded].sort(), selection.complete);
});

test('Checkpoint 2D excludes exactly the six approved specialized tests while complete discovery retains all of them', async () => {
  assert.deepEqual(FAST_TEST_EXCLUSIONS, APPROVED_FAST_TEST_EXCLUSIONS);
  assert.equal(new Set(FAST_TEST_EXCLUSIONS).size, 6);

  const complete = await discoverMaintainedNodeTests(repositoryRoot);
  const selection = selectFastNodeTests(complete, FAST_TEST_EXCLUSIONS);
  const expectedExcluded = [...APPROVED_FAST_TEST_EXCLUSIONS].sort();

  assert.ok(complete.length > 6);
  assert.deepEqual(selection.complete, complete);
  assert.deepEqual(selection.excluded, expectedExcluded);
  assert.equal(selection.selected.length, complete.length - 6);
  assert.deepEqual([...selection.selected, ...selection.excluded].sort(), complete);
  for (const file of APPROVED_FAST_TEST_EXCLUSIONS) {
    assert.equal(complete.includes(file), true, `complete npm test discovery must retain ${file}`);
    assert.equal(selection.selected.includes(file), false, `fast selection must omit ${file}`);
  }
});

test('package scripts keep npm test complete, keep selector-owned fast execution, and keep slide-review ownership of all four tooling tests', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.test, 'node --test');
  assert.equal(packageJson.scripts['test:fast'], 'node scripts/test-fast.mjs');
  assert.equal(packageJson.scripts['slide-review:test'], 'node --test tools/slide-import-review/tests/*.test.js');
});

test('workflow remains orchestration-only and does not own Node test paths or fast selection', () => {
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.equal(/\.test\.(?:cjs|mjs|js)/.test(workflow), false);
  assert.equal(workflow.includes('test:fast'), false);
  assert.equal(workflow.includes('FAST_TEST_EXCLUSIONS'), false);
});
