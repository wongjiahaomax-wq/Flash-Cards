import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import localTestReporter, { boundedPreview } from '../scripts/local-test-reporter.mjs';
import { runNodeTests } from '../scripts/test-runner.mjs';
import {
  CI_TEST_REPORTER,
  LOCAL_TEST_REPORTER,
  hasExplicitTestReporter,
  nodeTestArgsForPresentation,
  parseTestPresentationArgs,
} from '../scripts/test-presentation.mjs';

async function collectReporter(events) {
  async function* source() {
    for (const event of events) yield event;
  }
  let output = '';
  for await (const chunk of localTestReporter(source())) output += chunk;
  return output;
}

function failureData(index, overrides = {}) {
  const cause = /** @type {Error & { code: string, expected: unknown, actual: unknown, operator: string }} */ (
    new Error(overrides.message ?? `failure ${index}`)
  );
  cause.name = 'AssertionError';
  cause.code = 'ERR_ASSERTION';
  cause.expected = overrides.expected ?? { expected: 'x'.repeat(1800) };
  cause.actual = overrides.actual ?? { actual: 'y'.repeat(1800) };
  cause.operator = 'deepStrictEqual';
  cause.stack = [
    `AssertionError: failure ${index}`,
    `    at first (/workspace/tests/failure-${index}.test.js:10:2)`,
    `    at second (/workspace/tests/failure-${index}.test.js:11:2)`,
    `    at third (/workspace/tests/failure-${index}.test.js:12:2)`,
    `    at fourth (/workspace/tests/failure-${index}.test.js:13:2)`,
  ].join('\n');
  const wrapper = /** @type {Error & { cause: Error }} */ (new Error(cause.message));
  wrapper.cause = cause;
  return {
    name: overrides.name ?? `failure ${index}`,
    file: path.join(process.cwd(), 'tests', `failure-${index}.test.js`),
    line: 10,
    column: 2,
    details: { type: 'test', error: wrapper },
  };
}

test('local presentation does not confuse CI reporter metadata with CI context', () => {
  const metadataOnly = {
    ...process.env,
    CI_NODE_TEST_CHECK_ID: 'testFast',
    CI_NODE_TEST_REPRO_COMMAND: 'npm run test:fast',
  };
  assert.deepEqual(
    nodeTestArgsForPresentation(['tests/example.test.js'], 'local', metadataOnly),
    [`--test-reporter=${LOCAL_TEST_REPORTER}`, 'tests/example.test.js'],
  );
  assert.equal(hasExplicitTestReporter([], metadataOnly), false);
});

test('explicit caller and CI presentation outrank the local compact default without double reporter injection', () => {
  assert.deepEqual(
    nodeTestArgsForPresentation(['tests/example.test.js'], 'ci', {}),
    [`--test-reporter=${CI_TEST_REPORTER}`, 'tests/example.test.js'],
  );
  assert.deepEqual(
    nodeTestArgsForPresentation([`--test-reporter=${CI_TEST_REPORTER}`, 'tests/example.test.js'], 'local', {}),
    [`--test-reporter=${CI_TEST_REPORTER}`, 'tests/example.test.js'],
  );
  assert.deepEqual(
    nodeTestArgsForPresentation(['tests/example.test.js'], 'local', {
      NODE_OPTIONS: `--trace-warnings --test-reporter=${CI_TEST_REPORTER}`,
    }),
    ['tests/example.test.js'],
  );
  assert.deepEqual(nodeTestArgsForPresentation(['tests/example.test.js'], 'verbose', {}), ['tests/example.test.js']);
});

test('test runner preserves focused arguments and selects one presentation owner', () => {
  const calls = [];
  const status = runNodeTests({
    argv: ['tests/example.test.js'],
    env: { CI_NODE_TEST_CHECK_ID: 'local-metadata-only' },
    spawn(executable, args, options) {
      calls.push({ executable, args, options });
      return { status: 0 };
    },
  });
  assert.equal(status, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['--test', `--test-reporter=${LOCAL_TEST_REPORTER}`, 'tests/example.test.js']);

  const ciCalls = [];
  runNodeTests({
    argv: ['--presentation=ci', 'tests/example.test.js'],
    env: {},
    spawn(executable, args) {
      ciCalls.push({ executable, args });
      return { status: 0 };
    },
  });
  assert.deepEqual(ciCalls[0].args, ['--test', `--test-reporter=${CI_TEST_REPORTER}`, 'tests/example.test.js']);
});

test('presentation parser keeps ordinary Node arguments and rejects unknown modes', () => {
  assert.deepEqual(parseTestPresentationArgs(['--test-name-pattern=foo', 'tests/a.test.js']), {
    presentation: 'local',
    nodeArgs: ['--test-name-pattern=foo', 'tests/a.test.js'],
  });
  assert.deepEqual(parseTestPresentationArgs(['--presentation=verbose', 'tests/a.test.js']), {
    presentation: 'verbose',
    nodeArgs: ['tests/a.test.js'],
  });
  assert.throws(() => parseTestPresentationArgs(['--presentation=other']), /Unknown test presentation: other/);
});

test('local reporter is nearly silent on success', async () => {
  const output = await collectReporter([
    { type: 'test:pass', data: { name: 'success one', details: { type: 'test' } } },
    { type: 'test:pass', data: { name: 'success two', details: { type: 'test' } } },
    { type: 'test:summary', data: { counts: { tests: 2, passed: 2, failed: 0, skipped: 0, todo: 0, cancelled: 0 }, duration_ms: 1250 } },
  ]);
  assert.equal(output, '✓ Node tests — 2 passed, 0 failed (1.25s)\n');
  assert.equal(output.includes('success one'), false);
});

test('local reporter bounds cascading failures and large assertion payloads while preserving exact aggregate count', async () => {
  const failures = Array.from({ length: 37 }, (_, index) => failureData(index + 1));
  const events = failures.map((data) => ({ type: 'test:fail', data }));
  events.push({
    type: 'test:summary',
    data: { counts: { tests: 37, passed: 0, failed: 37, skipped: 0, todo: 0, cancelled: 0 }, duration_ms: 20 },
  });
  const output = await collectReporter(events);
  assert.match(output, /^✗ Node tests — 37 failures/m);
  assert.match(output, /32 additional failures omitted from detailed output\./);
  for (let index = 1; index <= 5; index += 1) assert.match(output, new RegExp(`failure ${index}`));
  assert.equal(output.includes('\n6. tests/failure-6.test.js'), false);
  assert.match(output, /Additional failing identities \(up to 10\):/);
  assert.match(output, /characters omitted/);
  assert.equal((output.match(/    at /g) ?? []).length <= 15, true, 'at most three stack frames for five detailed failures');
  assert.match(output, /Focused reproduction:\nnpm test -- tests\/failure-1\.test\.js/);
  assert.match(output, /Verbose reproduction:\nnpm run test:verbose -- tests\/failure-1\.test\.js/);
});

test('bounded preview reports truncation explicitly', () => {
  assert.equal(boundedPreview('abcdef', 4), 'abcd\n… 2 characters omitted');
});
