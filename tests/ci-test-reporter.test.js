import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import ciTestReporter, {
  agentFailureRecord,
  agentReproRecord,
  formatTestFailure,
  githubFailureAnnotation,
} from '../scripts/ci-test-reporter.mjs';
import {
  CI_TEST_REPORTER,
  ciCommandArgs,
  ciReproCommand,
  formatCiAgentFailureSummary,
} from '../scripts/validate-ci.mjs';

/** @param {any[]} events */
async function collect(events) {
  async function* source() {
    for (const event of events) yield event;
  }
  let output = '';
  for await (const chunk of ciTestReporter(source())) output += chunk;
  return output;
}

function failureData() {
  const cause = /** @type {Error & { code: string, expected: unknown, actual: unknown, operator: string }} */ (
    new Error('expected values to match')
  );
  cause.name = 'AssertionError';
  cause.code = 'ERR_ASSERTION';
  cause.expected = { enabled: true };
  cause.actual = { enabled: false };
  cause.operator = 'deepStrictEqual';
  cause.stack = 'AssertionError: expected values to match\n    at TestContext.<anonymous> (/workspace/tests/example.test.js:42:7)\n    at Test.run (node:internal/test_runner/test:1000:1)';
  const wrapper = /** @type {Error & { code: string, failureType: string, cause: Error }} */ (
    new Error('expected values to match')
  );
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
  assert.match(output, /=== CI AGENT SUMMARY ===/);
  assert.match(output, /CI_ERROR\|check=test\|file=tests\/example\.test\.js\|line=42\|name=classifier rejects invalid input\|code=ERR_ASSERTION\|message=expected values to match/);
  assert.match(output, /CI_REPRO\|check=test\|command=npm test -- tests\/example\.test\.js/);
  assert.match(output, /CI_STATUS\|check=test\|status=failed\|failed=1/);
  assert.ok(output.indexOf('=== Node test failures') > output.indexOf('Tests: 4 total'));
  assert.ok(output.indexOf('=== CI AGENT SUMMARY ===') > output.indexOf('=== Node test failures'));
});

test('real nested node:test failure emits one real failure instead of a duplicate suite failure', () => {
  const fixture = path.join(process.cwd(), 'tests', `.ci-reporter-nested-${process.pid}-${Date.now()}.test.mjs`);
  try {
    fs.writeFileSync(fixture, [
      "import { describe, it } from 'node:test';",
      "import assert from 'node:assert/strict';",
      "describe('outer suite', () => {",
      "  it('nested failure', () => assert.equal(1, 2));",
      '});',
      '',
    ].join('\n'));

    const result = spawnSync(process.execPath, [
      '--test',
      `--test-reporter=${CI_TEST_REPORTER}`,
      fixture,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const output = String(result.stdout ?? '');
    assert.match(output, /Tests: 1 total, 0 passed, 1 failed/);
    assert.equal((output.match(/^CI_ERROR\|/gm) ?? []).length, 1);
    assert.match(output, /CI_ERROR\|check=test\|.*name=nested failure/);
    assert.equal(output.includes('name=outer suite'), false);
    assert.match(output, /CI_STATUS\|check=test\|status=failed\|failed=1/);
  } finally {
    fs.rmSync(fixture, { force: true });
  }
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

test('agent records keep failure lookup and reproduction deterministic', () => {
  const failure = failureData();
  assert.equal(
    agentFailureRecord(failure),
    'CI_ERROR|check=test|file=tests/example.test.js|line=42|name=classifier rejects invalid input|code=ERR_ASSERTION|message=expected values to match',
  );
  assert.equal(
    agentReproRecord(failure),
    'CI_REPRO|check=test|command=npm test -- tests/example.test.js',
  );

  failure.name = 'classifier | invalid input';
  assert.match(agentFailureRecord(failure), /name=classifier %7C invalid input/);
});

test('CI wrapper failure footer is stable and avoids replacing structured test errors with a generic one', () => {
  assert.equal(
    formatCiAgentFailureSummary({
      id: 'svelte',
      command: 'npm',
      args: ['run', 'check'],
      status: 2,
      message: 'npm run check exited with 2.',
    }),
    [
      '=== CI AGENT SUMMARY ===',
      'CI_ERROR|check=svelte|message=npm run check exited with 2.',
      'CI_REPRO|check=svelte|command=npm run check',
      'CI_STATUS|check=svelte|status=failed|exit=2',
    ].join('\n'),
  );

  const testFooter = formatCiAgentFailureSummary({
    id: 'test',
    command: 'npm',
    args: ['test'],
    status: 1,
    message: 'npm test failed; see structured failures above.',
    detailedErrorsAlreadyReported: true,
  });
  assert.equal(testFooter.includes('CI_ERROR|'), false);
  assert.match(testFooter, /CI_REPRO\|check=test\|command=npm test/);
  assert.match(testFooter, /CI_STATUS\|check=test\|status=failed\|exit=1/);
});

test('diff CI repro uses actual PR SHAs and never advertises synthetic merge parents locally', () => {
  assert.equal(
    ciReproCommand('diff', 'git', ['diff', '--check', 'HEAD^1', 'HEAD'], {
      diffBaseSha: 'base123',
      diffHeadSha: 'head456',
    }),
    'git diff --check base123 head456',
  );
  assert.equal(
    ciReproCommand('diff', 'git', ['diff', '--check', 'HEAD^1', 'HEAD']),
    'npm run agent:checks',
  );
  assert.equal(
    ciReproCommand('svelte', 'npm', ['run', 'check']),
    'npm run check',
  );
});
