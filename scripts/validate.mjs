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
/** @typedef {{ root?: string, base?: string | null, diffArgs?: string[], verbose?: boolean }} ValidationRunOptions */

/** @param {ValidationMode} mode @returns {ValidationCommand[]} */
function commandView(mode) {
  return validationCommandsForMode(mode).map(({ command, args }) => [command, args]);
}

export const VALIDATION_MODES = Object.freeze({
  fast: commandView('fast'),
  full: commandView('full'),
});

/** @param {string} command @param {string[]} args @param {NpmExecutionEnv} [env] */
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
  let verbose = false;
  for (const arg of argv.slice(1)) {
    if (arg === '--verbose') verbose = true;
    else if (arg === '--compact') verbose = false; // backward-compatible no-op: compact is now the default.
    else throw new Error(`Unknown validation argument: ${arg}`);
  }
  return { mode, verbose };
}

/**
 * Map shared logical checks onto explicit verbose aliases without changing
 * validation selection or ordering.
 * @param {string} id
 * @param {string[]} args
 * @param {boolean} verbose
 */
export function localValidationCommandArgs(id, args, verbose) {
  if (!verbose) return [...args];
  if (id === 'test') return ['run', 'test:verbose'];
  if (id === 'testFast') return ['run', 'test:fast:verbose'];
  if (id === 'svelte') return ['run', 'check:verbose'];
  if (id === 'build') return ['run', 'build:verbose'];
  if (id === 'slideReviewTest') return ['run', 'slide-review:test:verbose'];
  if (args[0] === 'test') {
    const separator = args.indexOf('--');
    const focused = separator >= 0 ? args.slice(separator + 1) : args.slice(1);
    return ['run', 'test:verbose', '--', ...focused];
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
  const verbose = options.verbose ?? false;

  for (const { id, command, args } of commands) {
    const selectedArgs = localValidationCommandArgs(id, args, verbose);
    console.log(`\n> ${command} ${selectedArgs.join(' ')}${verbose ? '  [verbose output]' : ''}`);
    const invocation = resolveInvocation(command, selectedArgs);
    const result = spawn(invocation.executable, invocation.args, { stdio: 'inherit', shell: false });
    if (result.error) {
      console.error(`Failed to start ${command}: ${result.error.message}`);
      return 1;
    }
    if (result.status !== 0) {
      console.error(`Validation stopped: ${command} exited with ${result.status}.`);
      if (!verbose) {
        const verboseArgs = localValidationCommandArgs(id, args, true);
        console.error(`Verbose reproduction: ${command} ${verboseArgs.join(' ')}`);
      }
      return result.status ?? 1;
    }
  }

  console.log(`\nvalidate:${mode}${verbose ? ' --verbose' : ''} passed.`);
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    const { mode, verbose } = parseValidationArgs(process.argv.slice(2));
    process.exitCode = runValidation(mode, defaultSpawn, { verbose });
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 2;
  }
}
