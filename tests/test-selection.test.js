import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FAST_TEST_EXCLUSIONS,
  discoverMaintainedNodeTests,
  isMaintainedNodeTestPath,
  selectFastNodeTests,
} from '../scripts/test-selection.mjs';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

test('maintained Node-test discovery accepts the repository convention and Node-standard JavaScript test basenames', () => {
  assert.equal(isMaintainedNodeTestPath('test/example.test.js'), true);
  assert.equal(isMaintainedNodeTestPath('tests/example.test.mjs'), true);
  assert.equal(isMaintainedNodeTestPath('tools/example.test.cjs'), true);
  assert.equal(isMaintainedNodeTestPath('test/example-test.js'), true);
  assert.equal(isMaintainedNodeTestPath('test/example_test.mjs'), true);
  assert.equal(isMaintainedNodeTestPath('tests/test-example.cjs'), true);
  assert.equal(isMaintainedNodeTestPath('checks/test.js'), true);
  assert.equal(isMaintainedNodeTestPath('test/current-schema.js'), false);
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
    assert.deepEqual(selectFastNodeTests(discovered).selected, expected);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fast selection fails loudly when an exclusion is missing', () => {
  assert.throws(
    () => selectFastNodeTests(['test/existing.test.js'], ['test/missing.test.js']),
    /exclusion does not exist in maintained discovery: test\/missing\.test\.js/,
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

test('Checkpoint 2A real configuration has zero exclusions and zero maintained-file coverage reduction', async () => {
  assert.deepEqual(FAST_TEST_EXCLUSIONS, []);
  const complete = await discoverMaintainedNodeTests(repositoryRoot);
  const selection = selectFastNodeTests(complete, FAST_TEST_EXCLUSIONS);
  assert.ok(complete.length > 0);
  assert.deepEqual(selection.selected, complete);
  assert.deepEqual(selection.excluded, []);
  assert.deepEqual(selection.selected.filter((file) => !complete.includes(file)), []);
});

test('package scripts keep npm test complete and add the selector-owned fast command', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.test, 'node --test');
  assert.equal(packageJson.scripts['test:fast'], 'node scripts/test-fast.mjs');
});

test('workflow remains orchestration-only and does not own Node test paths or fast selection', () => {
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  assert.equal(/\.test\.(?:cjs|mjs|js)/.test(workflow), false);
  assert.equal(workflow.includes('test:fast'), false);
  assert.equal(workflow.includes('FAST_TEST_EXCLUSIONS'), false);
});
