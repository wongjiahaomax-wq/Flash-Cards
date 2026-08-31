import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { findRepositoryRoot } from './agent-doctor-lib.mjs';
import { validationCommandsForMode } from './validation-contract.mjs';
import { localDiffCheck } from './validation-git.mjs';

/** @typedef {'fast' | 'full'} ValidationMode */
/** @typedef {[string, string[]]} ValidationCommand */
/** @typedef {{ status: number | null, error?: Error }} ValidationResult */
/** @typedef {(command: string, args: string[], options: { stdio: 'inherit', shell: false }) => ValidationResult} ValidationSpawn */
/** @typedef {{ npm_execpath?: string, [key: string]: string | undefined }} NpmExecutionEnv */
/** @typedef {{ root?: string, base?: string | null, diffArgs?: string[], compact?: boolean }} ValidationRunOptions */

export const LOCAL_COMPACT_TEST_REPORTER = './scripts/ci-test-reporter.mjs';

/** @param {ValidationMode} mode @returns {ValidationCommand[]} */
function commandView(mode) {
  return validationCommandsForMode(mode).map(({ command, args }) => [command, args]);
}

/**
 * Backward-compatible derived command view. The manually maintained authority is
 * VALIDATION_MODE_CHECK_IDS in validation-contract.mjs.
 * @type {Readonly<Record<ValidationMode, ValidationCommand[]>>}
 */
export const VALIDATION_MODES = Object.freeze({
  fast: commandView('fast'),
  full: commandView('full'),
});

/**
 * Resolve logical commands without relying on Windows `.cmd` child-process wrappers.
 * npm exposes its CLI entrypoint through `npm_execpath` for npm-run scripts.
 * @param {string} command
 * @param {string[]} args
 * @param {NpmExecutionEnv} [env]
 * @returns {{ executable: string, args: string[] }}
 */
export function resolveInvocation(command, args, env = process.env) {
  if (command === 'node') return { executable: process.execPath, args };
  if (command === 'npm' && env.npm_execpath) {
    return { executable: process.execPath, args: [env.npm_execpath, ...args] };
  }
  return { executable: command, args };
}

/** @param {string[]} argv */
export function parseValidationArgs(argv) {
  const mode = argv[0] ?? '';
  let compact = false;
  for (const arg of argv.slice(1)) {
    if (arg === '--compact') compact = true;
    else throw new Error(`Unknown validation argument: ${arg}`);
  }
  return { mode, compact };
}

/**
 * Compact mode changes presentation only. It keeps the shared validation check
 * selection intact while reducing successful Node-test and Vite build chatter.
 * Canonical npm commands remain unchanged for normal developer use and repro.
 * @param {string} id
 * @param {string[]} args
 * @param {boolean} compact
 */
export function localValidationCommandArgs(id, args, compact) {
  if (!compact) return [...args];
  if (id === 'test' || id === 'testFast') {
    return [...args, '--', `--test-reporter=${LOCAL_COMPACT_TEST_REPORTER}`];
  }
  if (id === 'build') {
    return [...args, '--', '--logLevel', 'warn'];
  }
  return [...args];
}

/** @type {ValidationSpawn} */
const defaultSpawn = (command, args, options) => spawnSync(command, args, options);

/** @param {string} mode @param {ValidationSpawn} [spawn] @param {ValidationRunOptions} [options] */
export function runValidation(mode, spawn = defaultSpawn, options = {}) {
  if (mode !== 'fast' && mode !== 'full') {
    console.error(`Unknown validation mode: ${mode}. Use fast or full.`);
    return 2;
  }

  let diffArgs = options.diffArgs;
  if (!diffArgs) {
    const root = options.root ?? findRepositoryRoot();
    if (!root) {
      console.error('Unable to resolve repository root for local diff validation. Run this command from inside the Flash-Cards checkout.');
      return 1;
    }
    try {
      const diff = localDiffCheck(root, options.base ?? null);
      diffArgs = diff.args;
      console.log(`Local diff base: ${diff.baseRef} (merge-base ${diff.mergeBase.slice(0, 12)})`);
    } catch (error) {
      console.error(`Unable to resolve local validation diff: ${error instanceof Error ? error.message : error}`);
      return 1;
    }
  }

  const commands = validationCommandsForMode(mode, { diffArgs });
  const compact = options.compact ?? false;

  for (const { id, command, args } of commands) {
    console.log(`\n> ${command} ${args.join(' ')}${compact ? '  [compact output]' : ''}`);
    const invocation = resolveInvocation(command, localValidationCommandArgs(id, args, compact));
    const result = spawn(invocation.executable, invocation.args, { stdio: 'inherit', shell: false });
    if (result.error) {
      console.error(`Failed to start ${command}: ${result.error.message}`);
      return 1;
    }
    if (result.status !== 0) {
      console.error(`Validation stopped: ${command} exited with ${result.status}.`);
      if (compact) console.error(`Verbose reproduction: ${command} ${args.join(' ')}`);
      return result.status ?? 1;
    }
  }

  console.log(`\nvalidate:${mode}${compact ? ' --compact' : ''} passed.`);
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    const { mode, compact } = parseValidationArgs(process.argv.slice(2));
    process.exitCode = runValidation(mode, defaultSpawn, { compact });
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 2;
  }
}
