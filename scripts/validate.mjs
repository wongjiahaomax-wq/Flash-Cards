import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** @typedef {'fast' | 'full'} ValidationMode */
/** @typedef {[string, string[]]} ValidationCommand */
/** @typedef {{ status: number | null, error?: Error }} ValidationResult */
/** @typedef {(command: string, args: string[], options: { stdio: 'inherit', shell: false }) => ValidationResult} ValidationSpawn */
/** @typedef {{ npm_execpath?: string }} NpmExecutionEnv */

/** @type {Readonly<Record<ValidationMode, ValidationCommand[]>>} */
export const VALIDATION_MODES = Object.freeze({
  fast: [
    ['git', ['diff', '--check']],
    ['npm', ['test']],
    ['npm', ['run', 'check']],
  ],
  full: [
    ['git', ['diff', '--check']],
    ['npm', ['run', 'db:check']],
    ['npm', ['test']],
    ['npm', ['run', 'check']],
    ['npm', ['run', 'build']],
    ['node', ['scripts/local-auth-smoke.mjs']],
  ],
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

/** @param {string} mode @param {ValidationSpawn} [spawn] */
export function runValidation(mode, spawn = defaultSpawn) {
  if (mode !== 'fast' && mode !== 'full') {
    console.error(`Unknown validation mode: ${mode}. Use fast or full.`);
    return 2;
  }
  const commands = VALIDATION_MODES[mode];

  for (const [command, args] of commands) {
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
