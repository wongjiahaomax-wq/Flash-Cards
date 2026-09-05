import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseSvelteMachineOutput } from './ci-svelte-diagnostics.mjs';

const OUTPUT_LIMIT = 6000;
const ERROR_LIMIT = 10;
const MESSAGE_LIMIT = 600;

/** @param {unknown} value @param {number} limit */
function bounded(value, limit) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n… ${text.length - limit} characters omitted`;
}

/** @param {string[]} args @param {NodeJS.ProcessEnv} env */
function npmInvocation(args, env) {
  if (env.npm_execpath) return { executable: process.execPath, args: [env.npm_execpath, ...args] };
  return { executable: 'npm', args };
}

/** @param {any} diagnostic */
export function formatLocalSvelteDiagnostic(diagnostic) {
  const identity = [diagnostic.source, diagnostic.code]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join(' ');
  const suffix = identity ? ` [${identity}]` : '';
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}${suffix}\n   ${bounded(diagnostic.message, MESSAGE_LIMIT)}`;
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, spawn?: typeof spawnSync }} [options]
 */
export function runLocalSvelteCheck(options = {}) {
  const env = options.env ?? process.env;
  const spawn = options.spawn ?? spawnSync;
  const invocation = npmInvocation(['run', 'check:ci'], env);
  const result = spawn(invocation.executable, invocation.args, {
    cwd: process.cwd(),
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: false,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;

  const stdout = String(result.stdout ?? '');
  const stderr = String(result.stderr ?? '');
  const parsed = parseSvelteMachineOutput(stdout);
  const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const reportedErrors = parsed.completion?.errors ?? errors.length;
  const warnings = parsed.completion?.warnings ?? parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;

  if (result.status === 0) {
    if (parsed.protocolStarted && parsed.completion) {
      console.log(`✓ Svelte — ${reportedErrors} errors, ${warnings} warnings`);
    } else {
      console.log('✓ Svelte — passed (structured summary unavailable)');
    }
    return 0;
  }

  console.error(`✗ Svelte — ${reportedErrors || errors.length} error${reportedErrors === 1 ? '' : 's'}, ${warnings} warnings`);
  const visible = errors.slice(0, ERROR_LIMIT);
  for (let index = 0; index < visible.length; index += 1) {
    console.error(`\n${index + 1}. ${formatLocalSvelteDiagnostic(visible[index])}`);
  }
  const omitted = Math.max(0, reportedErrors - visible.length);
  if (omitted) console.error(`\n${omitted} additional Svelte error${omitted === 1 ? '' : 's'} omitted.`);

  const incomplete = !parsed.protocolStarted
    || !parsed.completion
    || parsed.malformedDiagnosticRecords > 0
    || (parsed.completion && parsed.completion.errors !== errors.length);
  if (incomplete) {
    console.error('\nCompact Svelte diagnostics were incomplete; bounded original output follows.');
    const fallback = [stderr, stdout].filter(Boolean).join('\n').trim();
    if (fallback) console.error(bounded(fallback, OUTPUT_LIMIT));
  }
  console.error('\nVerbose reproduction: npm run check:verbose');
  return Number.isInteger(result.status) ? result.status : 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    process.exitCode = runLocalSvelteCheck();
  } catch (error) {
    console.error(`Svelte check runner failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
