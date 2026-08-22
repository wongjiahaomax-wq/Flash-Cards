import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveInvocation } from './validate.mjs';
import { validationCommandsForMode } from './validation-contract.mjs';

const NODE_TEST_DIAGNOSTIC = /^(not ok|  error:|  code:|  failureType:|  location:|  stack:|    at )/;

/** @param {unknown} value */
export function escapeGithubCommandData(value) {
  return String(value ?? '')
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

/** @param {string} output */
export function extractNodeTestDiagnostic(output) {
  const diagnostic = String(output ?? '')
    .split(/\r?\n/)
    .filter((line) => NODE_TEST_DIAGNOSTIC.test(line))
    .join('\n')
    .trim();
  return diagnostic || 'npm test failed; see the grouped Node test output.';
}

/**
 * @param {string[]} argv
 * @returns {{ diffBase: string, diffHead: string }}
 */
export function parseCiArgs(argv) {
  let diffBase = 'HEAD^1';
  let diffHead = 'HEAD';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--diff-base') {
      diffBase = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--diff-head') {
      diffHead = argv[index + 1] ?? '';
      index += 1;
    } else {
      throw new Error(`Unknown CI validation argument: ${arg}`);
    }
  }
  if (!diffBase || !diffHead) throw new Error('CI diff base/head must be non-empty.');
  return { diffBase, diffHead };
}

/**
 * CI uses the same full-mode check IDs as local validate:full, while keeping
 * PR-checkout diff semantics and Node-test annotations CI-specific.
 * @param {{ diffBase?: string, diffHead?: string }} [options]
 */
export function runCiValidation(options = {}) {
  const diffBase = options.diffBase ?? 'HEAD^1';
  const diffHead = options.diffHead ?? 'HEAD';
  const checks = validationCommandsForMode('full', {
    diffArgs: ['diff', '--check', diffBase, diffHead],
  });

  for (const { id, label, command, args } of checks) {
    console.log(`::group::${label}`);
    const invocation = resolveInvocation(command, args);
    const captureOutput = id === 'test';
    const result = spawnSync(invocation.executable, invocation.args, captureOutput ? {
      encoding: 'utf8',
      shell: false,
    } : {
      stdio: 'inherit',
      shell: false,
    });

    let captured = '';
    if (captureOutput) {
      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';
      process.stdout.write(stdout);
      process.stderr.write(stderr);
      captured = `${stdout}\n${stderr}`;
    }
    console.log('::endgroup::');

    if (result.error) {
      console.error(`::error title=${label} failed::${escapeGithubCommandData(result.error.message)}`);
      return 1;
    }
    if (result.status !== 0) {
      const detail = id === 'test'
        ? extractNodeTestDiagnostic(captured)
        : `${command} ${args.join(' ')} exited with ${result.status}.`;
      const title = id === 'test' ? 'Node test failure' : `${label} failed`;
      console.error(`::error title=${title}::${escapeGithubCommandData(detail)}`);
      return result.status ?? 1;
    }
  }

  console.log('Repository CI validation passed.');
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    const options = parseCiArgs(process.argv.slice(2));
    process.exitCode = runCiValidation(options);
  } catch (error) {
    console.error(`::error title=CI validation configuration error::${escapeGithubCommandData(error instanceof Error ? error.message : error)}`);
    process.exitCode = 2;
  }
}
