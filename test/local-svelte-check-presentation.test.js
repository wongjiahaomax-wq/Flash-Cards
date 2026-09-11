// @ts-nocheck
import assert from 'node:assert/strict';
import { writeSync } from 'node:fs';
import test from 'node:test';

import { runLocalSvelteCheck } from '../scripts/check-local.mjs';

function fakeSpawn(machineOutput, status = 0) {
  return (_executable, _args, options) => {
    writeSync(/** @type {number} */ (options.stdio[1]), machineOutput);
    return { status };
  };
}

function captureConsole(method, callback) {
  const original = console[method];
  const lines = [];
  console[method] = (...args) => lines.push(args.join(' '));
  try {
    return { value: callback(), output: lines.join('\n') };
  } finally {
    console[method] = original;
  }
}

test('local Svelte check captures the complete machine stream and reports compact counts', () => {
  const result = captureConsole('log', () => runLocalSvelteCheck({
    argv: [],
    env: {},
    spawn: fakeSpawn('1700000000000 START "/workspace"\n1700000000001 COMPLETED 1 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS\n')
  }));

  assert.equal(result.value, 0);
  assert.equal(result.output, '✓ Svelte — 0 errors, 0 warnings');
});

test('incomplete successful Svelte machine output fails closed', () => {
  const result = captureConsole('error', () => runLocalSvelteCheck({
    argv: [],
    env: {},
    spawn: fakeSpawn('1700000000000 START "/workspace"\n')
  }));

  assert.equal(result.value, 1);
  assert.match(result.output, /structured diagnostics incomplete/);
  assert.match(result.output, /COMPLETED missing/);
  assert.match(result.output, /Verbose reproduction: npm run check:verbose/);
});
