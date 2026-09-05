import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { runLocalBuild } from '../scripts/build-local.mjs';
import { runLocalSvelteCheck } from '../scripts/check-local.mjs';
import localTestReporter, { boundedPreview } from '../scripts/local-test-reporter.mjs';
import { runNodeTests } from '../scripts/test-runner.mjs';
import {
  CI_TEST_REPORTER,
  LOCAL_TEST_REPORTER,
  hasExplicitTestReporter,
  nodeTestArgsForPresentation,
  parseTestPresentationArgs,
} from '../scripts/test-presentation.mjs';

const SVELTE_START = '1 START "/workspace"';

/** @param {any[]} events */
async function collectReporter(events) {
  async function* source() {
    for (const event of events) yield event;
  }
  let output = '';
  for await (const chunk of localTestReporter(source())) output += chunk;
  return output;
}

/**
 * @template T
 * @param {() => T} callback
 */
function captureConsole(callback) {
  /** @type {string[]} */
  const lines = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (...values) => lines.push(values.join(' '));
  console.warn = (...values) => lines.push(values.join(' '));
  console.error = (...values) => lines.push(values.join(' '));
  try {
    return { value: callback(), output: lines.join('\n') };
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

/** @param {number} timestamp @param {Record<string, any>} payload */
function machineRecord(timestamp, payload) {
  return `${timestamp} ${JSON.stringify(payload)}`;
}

/** @param {'ERROR' | 'WARNING'} type @param {number} index */
function svelteDiagnosticRecord(type, index) {
  return machineRecord(index + 1, {
    type,
    filename: `src/${type.toLowerCase()}-${index}.svelte`,
    start: { line: index, character: 0 },
    end: { line: index, character: 1 },
    message: `${type.toLowerCase()} ${index}`,
    code: type === 'ERROR' ? 2307 : 'warning-code',
    source: 'svelte',
  });
}

/**
 * @param {number} parsedErrors
 * @param {number} parsedWarnings
 * @param {number} [reportedErrors]
 * @param {number} [reportedWarnings]
 */
function svelteMachineOutput(
  parsedErrors,
  parsedWarnings,
  reportedErrors = parsedErrors,
  reportedWarnings = parsedWarnings,
) {
  const records = [SVELTE_START];
  for (let index = 1; index <= parsedErrors; index += 1) records.push(svelteDiagnosticRecord('ERROR', index));
  for (let index = 1; index <= parsedWarnings; index += 1) records.push(svelteDiagnosticRecord('WARNING', parsedErrors + index));
  const files = Math.max(1, parsedErrors + parsedWarnings);
  const filesWithProblems = Math.min(files, reportedErrors + reportedWarnings);
  records.push(`999 COMPLETED ${files} FILES ${reportedErrors} ERRORS ${reportedWarnings} WARNINGS ${filesWithProblems} FILES_WITH_PROBLEMS`);
  return records.join('\n');
}

/**
 * @param {number} index
 * @param {{ message?: string, expected?: unknown, actual?: unknown, name?: string }} [overrides]
 */
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
    nodeTestArgsForPresentation(['tests/example.test.js'], 'ci', { ...process.env }),
    [`--test-reporter=${CI_TEST_REPORTER}`, 'tests/example.test.js'],
  );
  assert.deepEqual(
    nodeTestArgsForPresentation([`--test-reporter=${CI_TEST_REPORTER}`, 'tests/example.test.js'], 'local', { ...process.env }),
    [`--test-reporter=${CI_TEST_REPORTER}`, 'tests/example.test.js'],
  );
  assert.deepEqual(
    nodeTestArgsForPresentation(['tests/example.test.js'], 'local', {
      ...process.env,
      NODE_OPTIONS: `--trace-warnings --test-reporter=${CI_TEST_REPORTER}`,
    }),
    ['tests/example.test.js'],
  );
  assert.deepEqual(nodeTestArgsForPresentation(['tests/example.test.js'], 'verbose', { ...process.env }), ['tests/example.test.js']);
});

test('test runner preserves focused arguments and selects one presentation owner', () => {
  /** @type {Array<{ executable: string, args: string[], options: any }>} */
  const calls = [];
  /** @param {string} executable @param {string[]} args @param {any} options */
  function mockSpawn(executable, args, options) {
    calls.push({ executable, args, options });
    return { status: 0 };
  }
  const status = runNodeTests({
    argv: ['tests/example.test.js'],
    env: { ...process.env, CI_NODE_TEST_CHECK_ID: 'local-metadata-only' },
    spawn: /** @type {any} */ (mockSpawn),
  });
  assert.equal(status, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['--test', `--test-reporter=${LOCAL_TEST_REPORTER}`, 'tests/example.test.js']);

  /** @type {Array<{ executable: string, args: string[] }>} */
  const ciCalls = [];
  /** @param {string} executable @param {string[]} args */
  function mockCiSpawn(executable, args) {
    ciCalls.push({ executable, args });
    return { status: 0 };
  }
  runNodeTests({
    argv: ['--presentation=ci', 'tests/example.test.js'],
    env: { ...process.env },
    spawn: /** @type {any} */ (mockCiSpawn),
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
  /** @type {any[]} */
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

test('local Svelte orchestration reports warnings-only success from a complete machine stream', () => {
  const stdout = svelteMachineOutput(0, 2);
  const { value: status, output } = captureConsole(() => runLocalSvelteCheck({
    argv: [],
    env: {},
    spawn: /** @type {any} */ (() => ({ status: 0, stdout, stderr: '' })),
  }));
  assert.equal(status, 0);
  assert.equal(output, '✓ Svelte — 0 errors, 2 warnings');
});

test('local Svelte orchestration renders an ordinary structured failure and verbose repro', () => {
  const stdout = svelteMachineOutput(1, 0);
  const { value: status, output } = captureConsole(() => runLocalSvelteCheck({
    argv: [],
    env: {},
    spawn: /** @type {any} */ (() => ({ status: 1, stdout, stderr: '' })),
  }));
  assert.equal(status, 1);
  assert.match(output, /✗ Svelte — 1 error, 0 warnings/);
  assert.match(output, /src\/error-1\.svelte:2:1 \[svelte 2307\]/);
  assert.match(output, /Verbose reproduction: npm run check:verbose/);
  assert.doesNotMatch(output, /diagnostics were incomplete/);
});

test('local Svelte orchestration bounds cascading failures at ten parsed errors', () => {
  const stdout = svelteMachineOutput(12, 0);
  const { output } = captureConsole(() => runLocalSvelteCheck({
    argv: [],
    env: {},
    spawn: /** @type {any} */ (() => ({ status: 1, stdout, stderr: '' })),
  }));
  assert.match(output, /✗ Svelte — 12 errors, 0 warnings/);
  assert.match(output, /2 additional Svelte errors omitted\./);
  assert.equal((output.match(/\n\d+\. src\/error-/g) ?? []).length, 10);
  assert.doesNotMatch(output, /diagnostics were incomplete/);
});

test('local Svelte orchestration uses parsed counts when completion reports more errors than were decoded', () => {
  const stdout = svelteMachineOutput(5, 0, 12, 0);
  const { output } = captureConsole(() => runLocalSvelteCheck({
    argv: [],
    env: {},
    spawn: /** @type {any} */ (() => ({ status: 1, stdout, stderr: '' })),
  }));
  assert.match(output, /✗ Svelte — 5 parsed errors, 0 parsed warnings/);
  assert.doesNotMatch(output, /additional Svelte errors omitted/);
  assert.match(output, /parsedErrors=5, reportedErrors=12/);
});

test('local Svelte orchestration uses parsed counts and parsed omission bounds when completion under-reports errors', () => {
  const stdout = svelteMachineOutput(12, 0, 5, 0);
  const { output } = captureConsole(() => runLocalSvelteCheck({
    argv: [],
    env: {},
    spawn: /** @type {any} */ (() => ({ status: 1, stdout, stderr: '' })),
  }));
  assert.match(output, /✗ Svelte — 12 parsed errors, 0 parsed warnings/);
  assert.match(output, /2 additional Svelte errors omitted\./);
  assert.match(output, /parsedErrors=12, reportedErrors=5/);
});

test('local Svelte orchestration reports malformed records without trusting completion totals', () => {
  const stdout = [
    SVELTE_START,
    svelteDiagnosticRecord('ERROR', 1),
    '3 {"type":"ERROR","filename":"src/broken.svelte",',
    '999 COMPLETED 2 FILES 2 ERRORS 0 WARNINGS 2 FILES_WITH_PROBLEMS',
  ].join('\n');
  const { output } = captureConsole(() => runLocalSvelteCheck({
    argv: [],
    env: {},
    spawn: /** @type {any} */ (() => ({ status: 1, stdout, stderr: '' })),
  }));
  assert.match(output, /✗ Svelte — 1 parsed error, 0 parsed warnings/);
  assert.match(output, /malformedRecords=1/);
  assert.match(output, /parsedErrors=1, reportedErrors=2/);
});

test('local Svelte orchestration fails safely when START and COMPLETED are absent', () => {
  const stdout = 'svelte-kit sync prelude\nchecker terminated before protocol';
  const { value: status, output } = captureConsole(() => runLocalSvelteCheck({
    argv: [],
    env: {},
    spawn: /** @type {any} */ (() => ({ status: 2, stdout, stderr: '' })),
  }));
  assert.equal(status, 2);
  assert.match(output, /START missing, COMPLETED missing/);
  assert.match(output, /checker terminated before protocol/);
});

test('local Svelte orchestration surfaces setup failure output and preserves its exit status', () => {
  const { value: status, output } = captureConsole(() => runLocalSvelteCheck({
    argv: [],
    env: {},
    spawn: /** @type {any} */ (() => ({ status: 6, stdout: '', stderr: 'svelte-kit sync setup failed' })),
  }));
  assert.equal(status, 6);
  assert.match(output, /svelte-kit sync setup failed/);
  assert.match(output, /Verbose reproduction: npm run check:verbose/);
});

test('explicit machine-verbose Svelte presentation bypasses compact capture and preserves child status', () => {
  /** @type {Array<{ executable: string, args: string[], options: any }>} */
  const calls = [];
  const { value: status, output } = captureConsole(() => runLocalSvelteCheck({
    argv: ['--output', 'machine-verbose'],
    env: {},
    spawn: /** @type {any} */ ((executable, args, options) => {
      calls.push({ executable, args, options });
      return { status: 3 };
    }),
  }));
  assert.equal(status, 3);
  assert.equal(output, '');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, 'npm');
  assert.deepEqual(calls[0].args, ['run', 'check:ci']);
  assert.equal(calls[0].options.stdio, 'inherit');
});

test('compact local Svelte presentation preserves a nonstandard child failure status', () => {
  const stdout = svelteMachineOutput(1, 0);
  const { value: status } = captureConsole(() => runLocalSvelteCheck({
    argv: [],
    env: {},
    spawn: /** @type {any} */ (() => ({ status: 7, stdout, stderr: '' })),
  }));
  assert.equal(status, 7);
});

test('local build forwards appended Vite arguments through the quiet presentation wrapper', () => {
  /** @type {Array<{ executable: string, args: string[], options: any }>} */
  const calls = [];
  const { value: status } = captureConsole(() => runLocalBuild({
    argv: ['--mode', 'staging'],
    env: {},
    spawn: /** @type {any} */ ((executable, args, options) => {
      calls.push({ executable, args, options });
      return { status: 0, stdout: '', stderr: '' };
    }),
  }));
  assert.equal(status, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, 'npm');
  assert.deepEqual(calls[0].args, ['run', 'build:quiet', '--', '--mode', 'staging']);
});

test('local build failure repro preserves appended Vite arguments', () => {
  const { value: status, output } = captureConsole(() => runLocalBuild({
    argv: ['--mode', 'staging'],
    env: {},
    spawn: /** @type {any} */ (() => ({ status: 4, stdout: '', stderr: 'build failed' })),
  }));
  assert.equal(status, 4);
  assert.match(output, /Verbose reproduction: npm run build:verbose -- --mode staging/);
});
