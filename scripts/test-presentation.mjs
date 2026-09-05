export const LOCAL_TEST_REPORTER = './scripts/local-test-reporter.mjs';
export const CI_TEST_REPORTER = './scripts/ci-test-reporter.mjs';

/** @typedef {'local' | 'ci' | 'verbose'} TestPresentation */

/** @param {unknown} value */
function shellWords(value) {
  return String(value ?? '').match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
}

/** @param {string[]} argv @param {NodeJS.ProcessEnv} [env] */
export function hasExplicitTestReporter(argv, env = process.env) {
  if (argv.some((arg) => arg === '--test-reporter' || arg.startsWith('--test-reporter='))) return true;
  return shellWords(env.NODE_OPTIONS).some((arg) => arg === '--test-reporter' || arg.startsWith('--test-reporter='));
}

/**
 * @param {string[]} argv
 * @returns {{ presentation: TestPresentation, nodeArgs: string[] }}
 */
export function parseTestPresentationArgs(argv) {
  /** @type {TestPresentation} */
  let presentation = 'local';
  const nodeArgs = [];
  for (const arg of argv) {
    if (arg.startsWith('--presentation=')) {
      const value = arg.slice('--presentation='.length);
      if (value !== 'local' && value !== 'ci' && value !== 'verbose') {
        throw new Error(`Unknown test presentation: ${value}`);
      }
      presentation = value;
    } else {
      nodeArgs.push(arg);
    }
  }
  return { presentation, nodeArgs };
}

/**
 * Reporter precedence: an explicit caller-provided reporter wins; otherwise
 * CI/automation can request the CI reporter; otherwise local use is compact.
 * CI_NODE_TEST_* variables are metadata only and deliberately do not select
 * presentation.
 * @param {string[]} nodeArgs
 * @param {TestPresentation} presentation
 * @param {NodeJS.ProcessEnv} [env]
 */
export function nodeTestArgsForPresentation(nodeArgs, presentation, env = process.env) {
  const args = [...nodeArgs];
  if (presentation === 'verbose' || hasExplicitTestReporter(args, env)) return args;
  const reporter = presentation === 'ci' ? CI_TEST_REPORTER : LOCAL_TEST_REPORTER;
  return [`--test-reporter=${reporter}`, ...args];
}
