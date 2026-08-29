import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import ciTestReporter, { formatTestFailure, githubFailureAnnotation } from '../scripts/ci-test-reporter.mjs';
import { CI_TEST_REPORTER, ciCommandArgs } from '../scripts/validate-ci.mjs';

async function collect(events) {
  async function* source() {
    for (const event of events) yield event;
  }
  let output = '';
  for await (const chunk of ciTestReporter(source())) output += chunk;
  return output;
}

function failureData() {
  const cause = new Error('expected values to match');
  cause.name = 'AssertionError';
  cause.code = 'ERR_ASSERTION';
  cause.expected = { enabled: true };
  cause.actual = { enabled: false };
  cause.operator = 'deepStrictEqual';
  cause.stack = 'AssertionError: expected values to match\n    at TestContext.<anonymous> (/workspace/tests/example.test.js:42:7)\n    at Test.run (node:internal/test_runner/test:1000:1)';
  const wrapper = new Error('expected values to match');
  wrapper.code = 'ERR_TEST_FAILURE';
  wrapper.failureType = 'testCodeFailure';
  wrapper.cause = cause;
  return {
    name: 'classifier rejects invalid input',
    file: path.join(process.cwd(), 'tests', 'example.test.js'),
    line: 42,
    column: 1,
    details: { type: 'test', error: wrapper },
  };
}

test('CI invokes npm test with the structured reporter without changing the shared test command', () => {
  assert.deepEqual(ciCommandArgs('test', ['test']), [
    'test',
    '--',
    `--test-reporter=${CI_TEST_REPORTER}`,
  ]);
  assert.deepEqual(ciCommandArgs('svelte', ['run', 'check']), ['run', 'check']);
});

test('CI reporter emits compact event-driven progress and collects failures at the end', async () => {
  const failure = failureData();
  const output = await collect([
    { type: 'test:pass', data: { name: 'success one', details: { type: 'test' } } },
    { type: 'test:pass', data: { name: 'skipped', skip: true, details: { type: 'test' } } },
    { type: 'test:fail', data: { name: 'todo failure', todo: true, details: { type: 'test', error: new Error('later') } } },
    { type: 'test:fail', data: failure },
    { type: 'test:summary', data: { file: '/tmp/one.test.js', counts: { tests: 1 } } },
    { type: 'test:summary', data: { success: false, counts: { tests: 4, passed: 1, failed: 1, skipped: 1, todo: 1, cancelled: 0 }, duration_ms: 1250 } },
  ]);

  assert.match(output, /^\.STF\nTests: 4 total, 1 passed, 1 failed, 1 skipped, 1 todo, 0 cancelled in 1\.25s/m);
  assert.equal(output.includes('success one'), false);
  assert.equal(output.includes('TAP version'), false);
  assert.match(output, /=== Node test failures \(1\) ===/);
  assert.match(output, /classifier rejects invalid input/);
  assert.match(output, /location: tests\/example\.test\.js:42:1/);
  assert.match(output, /failureType: testCodeFailure/);
  assert.match(output, /error: AssertionError \[ERR_ASSERTION\]: expected values to match/);
  assert.match(output, /expected:[\s\S]*enabled: true/);
  assert.match(output, /actual:[\s\S]*enabled: false/);
  assert.match(output, /stack:[\s\S]*example\.test\.js:42:7/);
  assert.match(output, /::error title=Node test failure,file=tests\/example\.test\.js,line=42,col=1::/);
  assert.ok(output.indexOf('=== Node test failures') > output.indexOf('Tests: 4 total'));
});

test('failure formatting unwraps Node test errors and keeps assertion details', () => {
  const failure = failureData();
  const formatted = formatTestFailure(failure);
  assert.match(formatted, /operator: deepStrictEqual/);
  assert.match(formatted, /expected:[\s\S]*enabled: true/);
  assert.match(formatted, /actual:[\s\S]*enabled: false/);
  const annotation = githubFailureAnnotation(failure);
  assert.match(annotation, /^::error title=Node test failure,file=tests\/example\.test\.js,line=42,col=1::/);
  assert.equal(annotation.includes('\n'), false);
});
