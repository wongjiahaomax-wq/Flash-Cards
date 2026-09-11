import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { discoverMaintainedNodeTests, isMaintainedNodeTestPath } from './test-selection.mjs';
import { nodeTestArgsForPresentation, parseTestPresentationArgs } from './test-presentation.mjs';

const NODE_TEST_OPTIONS_WITH_SEPARATE_VALUES = new Set([
  '--test-concurrency',
  '--test-coverage-branches',
  '--test-coverage-exclude',
  '--test-coverage-functions',
  '--test-coverage-include',
  '--test-coverage-lines',
  '--test-name-pattern',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-shard',
  '--test-skip-pattern',
  '--test-timeout',
]);

/**
 * Identify maintained repository test targets without treating a supported
 * Node test option's separate value as a positional target.
 *
 * This is deliberately a small option-aware scanner, not a general Node CLI
 * parser. Equals-form options carry their value in the same token and need no
 * special handling here.
 *
 * @param {readonly string[]} nodeArgs
 */
export function hasExplicitMaintainedNodeTarget(nodeArgs) {
  let skipNext = false;
  for (const arg of nodeArgs) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (NODE_TEST_OPTIONS_WITH_SEPARATE_VALUES.has(arg)) {
      skipNext = true;
      continue;
    }
    if (isMaintainedNodeTestPath(arg)) return true;
  }
  return false;
}

/**
 * @param {{ argv?: string[], cwd?: string, env?: NodeJS.ProcessEnv, spawn?: typeof spawnSync }} [options]
 */
export async function runNodeTests(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const spawn = options.spawn ?? spawnSync;
  const { presentation, nodeArgs } = parseTestPresentationArgs(argv);
  if (!hasExplicitMaintainedNodeTarget(nodeArgs)) {
    const maintainedTests = await discoverMaintainedNodeTests(cwd);
    if (!maintainedTests.length) {
      throw new Error('Complete Node test discovery resolved to zero maintained tests; refusing to fall back to implicit Node discovery.');
    }
    nodeArgs.push(...maintainedTests);
  }
  const args = ['--test', ...nodeTestArgsForPresentation(nodeArgs, presentation, env)];
  const result = spawn(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
    env,
  });
  if (result.error) throw result.error;
  return Number.isInteger(result.status) ? result.status : 1;
}

const invokedDirectly = !process.env.NODE_TEST_CONTEXT
  && process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    process.exitCode = await runNodeTests();
  } catch (error) {
    console.error(`Node test runner failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
