import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { nodeTestArgsForPresentation, parseTestPresentationArgs } from './test-presentation.mjs';

/**
 * @param {{ argv?: string[], cwd?: string, env?: NodeJS.ProcessEnv, spawn?: typeof spawnSync }} [options]
 */
export function runNodeTests(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const spawn = options.spawn ?? spawnSync;
  const { presentation, nodeArgs } = parseTestPresentationArgs(argv);
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
    process.exitCode = runNodeTests();
  } catch (error) {
    console.error(`Node test runner failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
