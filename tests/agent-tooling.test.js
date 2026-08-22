import test from 'node:test';
import assert from 'node:assert/strict';
import { branchStatus, nodeMajorStatus, overallDoctorStatus, parseNodeMajor, wranglerVersionStatus } from '../scripts/agent-doctor-lib.mjs';
import { executableFor, runValidation, VALIDATION_MODES } from '../scripts/validate.mjs';

test('Node major parsing and compatibility are deterministic', () => {
  assert.equal(parseNodeMajor('v22.18.0'), 22);
  assert.equal(nodeMajorStatus('v22.18.0', 22).ok, true);
  assert.equal(nodeMajorStatus('v24.0.0', 22).ok, false);
});

test('Wrangler comparison requires exact repository version', () => {
  assert.equal(wranglerVersionStatus('4.125.0', '4.125.0').ok, true);
  assert.equal(wranglerVersionStatus('4.125.0', '4.124.0').ok, false);
});

test('main branch is a warning, not an error', () => {
  assert.match(branchStatus('main').warning, /feature branch/);
  assert.equal(overallDoctorStatus([{ level: 'warning' }]), 'warning');
});

test('validation modes preserve the intended contracts', () => {
  assert.deepEqual(VALIDATION_MODES.fast, [
    ['git', ['diff', '--check']], ['npm', ['test']], ['npm', ['run', 'check']],
  ]);
  assert.deepEqual(VALIDATION_MODES.full.at(-1), ['node', ['scripts/local-auth-smoke.mjs']]);
  assert.equal(VALIDATION_MODES.full.some(([, args]) => args.includes('build')), true);
  assert.equal(VALIDATION_MODES.full.some(([, args]) => args.includes('db:check')), true);
});

test('npm executable is cross-platform', () => {
  assert.equal(executableFor('npm', 'win32'), 'npm.cmd');
  assert.equal(executableFor('npm', 'linux'), 'npm');
});

test('validation stops and propagates the first failing exit code', () => {
  let calls = 0;
  const status = runValidation('fast', () => ({ status: ++calls === 2 ? 7 : 0 }));
  assert.equal(status, 7);
  assert.equal(calls, 2);
});
