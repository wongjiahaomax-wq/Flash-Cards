import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const OUTPUT_LIMIT = 8000;

/** @param {string[]} args @param {NodeJS.ProcessEnv} env */
function npmInvocation(args, env) {
  if (env.npm_execpath) return { executable: process.execPath, args: [env.npm_execpath, ...args] };
  return { executable: 'npm', args };
}

/** @param {unknown} value */
function bounded(value) {
  const text = String(value ?? '');
  if (text.length <= OUTPUT_LIMIT) return text;
  return `${text.slice(0, OUTPUT_LIMIT)}\n… ${text.length - OUTPUT_LIMIT} characters omitted`;
}

/** @param {{ env?: NodeJS.ProcessEnv, spawn?: typeof spawnSync }} [options] */
export function runLocalBuild(options = {}) {
  const env = options.env ?? process.env;
  const spawn = options.spawn ?? spawnSync;
  const invocation = npmInvocation(['run', 'build:quiet'], env);
  const result = spawn(invocation.executable, invocation.args, {
    cwd: process.cwd(),
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
  if (result.status === 0) {
    if (output) console.warn(bounded(output));
    console.log('✓ Build — passed');
    return 0;
  }
  console.error('✗ Build — failed');
  if (output) console.error(bounded(output));
  console.error('\nVerbose reproduction: npm run build:verbose');
  return Number.isInteger(result.status) ? result.status : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    process.exitCode = runLocalBuild();
  } catch (error) {
    console.error(`Build runner failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
