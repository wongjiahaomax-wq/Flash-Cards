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
/** @typedef {{ root?: string, base?: string | null, diffArgs?: string[] }} ValidationRunOptions */

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

  for (const { command, args } of commands) {
    console.log(`\n> ${command} ${args.join(' ')}`);
    const invocation = resolveInvocation(command, args);
    const result = spawn(invocation.executable, invocation.args, { stdio: 'inherit', shell: false });
    if (result.error) {
      console.error(`Failed to start ${command}: ${result.error.message}`);
      return 1;
    }
    if (result.status !== 0) {
      console.error(`Validation stopped: ${command} exited with ${result.status}.`);
      return result.status ?? 1;
    }
  }

  console.log(`\nvalidate:${mode} passed.`);
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exitCode = runValidation(process.argv[2] ?? '');
