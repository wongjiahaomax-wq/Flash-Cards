import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolveFastNodeTestSelection } from './test-selection.mjs';
import {
  hasExplicitTestReporter,
  nodeTestArgsForPresentation,
  parseTestPresentationArgs,
} from './test-presentation.mjs';

/**
 * @param {{ argv?: string[], root?: string, spawn?: typeof spawnSync, env?: NodeJS.ProcessEnv }} [options]
 */
export async function runFastNodeTests(options = {}) {
  const root = options.root ?? process.cwd();
  const argv = options.argv ?? process.argv.slice(2);
  const spawn = options.spawn ?? spawnSync;
  const env = options.env ?? process.env;
  const selection = await resolveFastNodeTestSelection(root);
  const { presentation, nodeArgs } = parseTestPresentationArgs(argv);
  const detailedSelection = presentation !== 'local' || hasExplicitTestReporter(nodeArgs, env);

  if (!detailedSelection) {
    console.log(
      `Fast Node test selection: ${selection.selected.length} selected, ${selection.excluded.length} excluded from ${selection.complete.length} maintained tests.`,
    );
  } else {
    console.log(
      `Fast Node test selection: complete=${selection.complete.length}, selected=${selection.selected.length}, excluded=${selection.excluded.length}`,
    );
    if (selection.excluded.length) {
      console.log(`Fast Node test exclusions:\n${selection.excluded.map((file) => `- ${file}`).join('\n')}`);
    }
  }
  if (!selection.selected.length) {
    throw new Error('Fast Node test selection resolved to zero maintained tests; refusing to fall back to implicit Node discovery.');
  }

  const childEnv = {
    ...env,
    CI_NODE_TEST_CHECK_ID: env.CI_NODE_TEST_CHECK_ID ?? 'testFast',
    CI_NODE_TEST_REPRO_COMMAND: env.CI_NODE_TEST_REPRO_COMMAND ?? 'npm run test:fast',
  };
  const testArgs = nodeTestArgsForPresentation([...nodeArgs, ...selection.selected], presentation, childEnv);
  const result = spawn(process.execPath, ['--test', ...testArgs], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: childEnv,
  });
  if (result.error) throw result.error;
  return Number.isInteger(result.status) ? result.status : 1;
}

const invokedDirectly = !process.env.NODE_TEST_CONTEXT
  && process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    process.exitCode = await runFastNodeTests();
  } catch (error) {
    console.error(`Fast Node test runner failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
