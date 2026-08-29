import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveInvocation } from './validate.mjs';
import { VALIDATION_MODE_CHECK_IDS, validationCommandsForMode } from './validation-contract.mjs';

const NODE_TEST_DIAGNOSTIC = /^(not ok|  error:|  code:|  failureType:|  location:|  stack:|    at )/;
export const CI_TEST_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
export const CI_TEST_REPORTER = './scripts/ci-test-reporter.mjs';

/** @param {unknown} value */
export function escapeGithubCommandData(value) {
  return String(value ?? '')
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

/**
 * Legacy compatibility helper retained for tooling tests from the previous
 * TAP-based implementation. The active CI path no longer parses test text.
 * @param {string} output
 */
export function extractNodeTestDiagnostic(output) {
  const diagnostic = String(output ?? '')
    .split(/\r?\n/)
    .filter((line) => NODE_TEST_DIAGNOSTIC.test(line))
    .join('\n')
    .trim();
  return diagnostic || 'npm test failed; see the grouped Node test output.';
}

/** @param {string} mode */
function assertCiValidationMode(mode) {
  if (!mode) {
    throw new Error(`CI validation mode must be non-empty. Expected one of: ${Object.keys(VALIDATION_MODE_CHECK_IDS).join(', ')}.`);
  }
  if (!Object.hasOwn(VALIDATION_MODE_CHECK_IDS, mode)) {
    throw new Error(`Unknown CI validation mode: ${mode}. Expected one of: ${Object.keys(VALIDATION_MODE_CHECK_IDS).join(', ')}.`);
  }
}

/**
 * @param {string[]} argv
 * @returns {{ mode: string, diffBase: string, diffHead: string }}
 */
export function parseCiArgs(argv) {
  let mode = 'full';
  let diffBase = 'HEAD^1';
  let diffHead = 'HEAD';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      mode = argv[index + 1] ?? '';
      assertCiValidationMode(mode);
      index += 1;
    } else if (arg === '--diff-base') {
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
  return { mode, diffBase, diffHead };
}

/**
 * CI uses the shared repository validation mode definitions while keeping
 * PR-checkout diff semantics CI-specific.
 * @param {{ mode?: string, diffBase?: string, diffHead?: string }} [options]
 */
export function ciValidationCommands(options = {}) {
  const mode = options.mode ?? 'full';
  const diffBase = options.diffBase ?? 'HEAD^1';
  const diffHead = options.diffHead ?? 'HEAD';
  return validationCommandsForMode(mode, {
    diffArgs: ['diff', '--check', diffBase, diffHead],
  });
}

/** @param {string} id @param {string[]} args */
export function ciCommandArgs(id, args) {
  if (id !== 'test') return [...args];
  return [...args, '--', `--test-reporter=${CI_TEST_REPORTER}`];
}

/**
 * CI keeps PR-checkout diff semantics and GitHub grouping CI-specific while
 * reusing the repository validation contract. Node-test diagnostics are
 * produced by a custom reporter that consumes structured node:test events.
 * @param {{ mode?: string, diffBase?: string, diffHead?: string }} [options]
 */
export function runCiValidation(options = {}) {
  const mode = options.mode ?? 'full';
  const checks = ciValidationCommands(options);

  console.log(`Repository CI validation mode: ${mode}`);
  for (const { id, label, command, args } of checks) {
    console.log(`::group::${label}`);
    const invocation = resolveInvocation(command, ciCommandArgs(id, args));
    const result = spawnSync(invocation.executable, invocation.args, {
      stdio: 'inherit',
      shell: false,
    });
    console.log('::endgroup::');

    if (result.error) {
      console.error(`::error title=${label} failed::${escapeGithubCommandData(result.error.message)}`);
      return 1;
    }
    if (result.status !== 0) {
      const detail = id === 'test'
        ? 'npm test failed; see the structured Node test failure summary above.'
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
