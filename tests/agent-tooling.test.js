import test from 'node:test';
import assert from 'node:assert/strict';
import { branchStatus, nodeMajorStatus, overallDoctorStatus, parseNodeMajor, wranglerVersionStatus } from '../scripts/agent-doctor-lib.mjs';
import { resolveInvocation, runValidation, VALIDATION_MODES } from '../scripts/validate.mjs';

test('Node major parsing and compatibility are deterministic', () => {
  assert.equal(parseNodeMajor('v22.18.0'), 22);
  assert.equal(nodeMajorStatus('v22.18.0', 22).ok, true);
  assert.equal(nodeMajorStatus('v24.0.0', 22).ok, false);
  assert.equal(nodeMajorStatus('invalid', null).ok, false);
});

test('Wrangler comparison requires exact repository version', () => {
  assert.equal(wranglerVersionStatus('4.125.0', '4.125.0').ok, true);
  assert.equal(wranglerVersionStatus('4.125.0', '4.124.0').ok, false);
});

test('branch state distinguishes feature, main, detached, and unreadable Git state', () => {
  assert.deepEqual(branchStatus('agent/example'), {
    branch: 'agent/example',
    level: 'ok',
    message: null,
  });

  const main = branchStatus('main');
  assert.equal(main.level, 'warning');
  assert.match(main.message, /feature branch/);

  const detached = branchStatus('');
  assert.equal(detached.level, 'warning');
  assert.match(detached.message, /detached/);

  const unreadable = branchStatus(null, false);
  assert.equal(unreadable.level, 'error');
  assert.match(unreadable.message, /could not be read/);

  assert.equal(overallDoctorStatus([{ level: 'warning' }]), 'warning');
  assert.equal(overallDoctorStatus([{ level: 'error' }]), 'error');
});

test('validation modes preserve the intended contracts', () => {
  assert.deepEqual(VALIDATION_MODES.fast, [
    ['git', ['diff', '--check']], ['npm', ['test']], ['npm', ['run', 'check']],
  ]);
  assert.deepEqual(VALIDATION_MODES.full.at(-1), ['node', ['scripts/local-auth-smoke.mjs']]);
  assert.equal(VALIDATION_MODES.full.some(([, args]) => args.includes('build')), true);
  assert.equal(VALIDATION_MODES.full.some(([, args]) => args.includes('db:check')), true);
});

test('npm and Node invocations use deterministic Node entrypoints where available', () => {
  assert.deepEqual(resolveInvocation('npm', ['test'], { npm_execpath: '/npm/npm-cli.js' }), {
    executable: process.execPath,
    args: ['/npm/npm-cli.js', 'test'],
  });
  assert.deepEqual(resolveInvocation('node', ['script.mjs'], {}), {
    executable: process.execPath,
    args: ['script.mjs'],
  });
  assert.deepEqual(resolveInvocation('git', ['diff'], {}), {
    executable: 'git',
    args: ['diff'],
  });
});

test('validation stops and propagates the first failing exit code', () => {
  let calls = 0;
  const status = runValidation('fast', () => ({ status: ++calls === 2 ? 7 : 0 }));
  assert.equal(status, 7);
  assert.equal(calls, 2);
});
