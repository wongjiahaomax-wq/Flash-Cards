import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

/**
 * Capture the machine stream through files instead of pipes. The pinned
 * svelte-check writer uses asynchronous stdout writes and can exit before a
 * synchronous piped child capture receives those records.
 * @param {typeof spawnSync} spawn
 * @param {{ executable: string, args: string[] }} invocation
 * @param {NodeJS.ProcessEnv} env
 */
function spawnCaptured(spawn, invocation, env) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'flash-cards-svelte-check-'));
  const stdoutPath = join(temporaryDirectory, 'stdout.log');
  const stderrPath = join(temporaryDirectory, 'stderr.log');
  let stdoutFd = null;
  let stderrFd = null;
  try {
    stdoutFd = openSync(stdoutPath, 'w');
    stderrFd = openSync(stderrPath, 'w');
    const result = spawn(invocation.executable, invocation.args, {
      cwd: process.cwd(),
      stdio: ['inherit', stdoutFd, stderrFd],
      shell: false,
      env,
    });
    closeSync(stdoutFd);
    stdoutFd = null;
    closeSync(stderrFd);
    stderrFd = null;
    const capturedResult = /** @type {{ stdout?: string | Buffer | null, stderr?: string | Buffer | null }} */ (result);
    return {
      result,
      stdout: capturedResult.stdout !== undefined && capturedResult.stdout !== null
        ? String(capturedResult.stdout)
        : readFileSync(stdoutPath, 'utf8'),
      stderr: capturedResult.stderr !== undefined && capturedResult.stderr !== null
        ? String(capturedResult.stderr)
        : readFileSync(stderrPath, 'utf8'),
    };
  } finally {
    if (stdoutFd !== null) closeSync(stdoutFd);
    if (stderrFd !== null) closeSync(stderrFd);
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

/** @param {string[]} argv */
export function requestsMachineVerbose(argv) {
  return argv.some((arg, index) => (
    arg === '--output=machine-verbose'
    || (arg === '--output' && argv[index + 1] === 'machine-verbose')
  ));
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
 * The existing CI wrapper explicitly requests svelte-check machine output by
 * forwarding --output machine-verbose to the logical `npm run check` command.
 * Preserve that caller-selected presentation instead of letting the new local
 * default intercept it.
 * @param {{ argv?: string[], env?: NodeJS.ProcessEnv, spawn?: typeof spawnSync }} [options]
 */
export function runLocalSvelteCheck(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const spawn = options.spawn ?? spawnSync;
  const invocation = npmInvocation(['run', 'check:ci'], env);

  if (requestsMachineVerbose(argv)) {
    const result = spawn(invocation.executable, invocation.args, {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false,
      env,
    });
    if (result.error) throw result.error;
    return Number.isInteger(result.status) ? result.status : 1;
  }

  if (argv.length > 0) {
    throw new Error(`Unknown local Svelte check argument: ${argv[0]}`);
  }

  const captured = spawnCaptured(spawn, invocation, env);
  const { result } = captured;
  if (result.error) throw result.error;

  const { stdout, stderr } = captured;
  const parsed = parseSvelteMachineOutput(stdout);
  const errors = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const warningDiagnostics = parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning');
  const completionErrorMismatch = Boolean(parsed.completion && parsed.completion.errors !== errors.length);
  const completionWarningMismatch = Boolean(parsed.completion && parsed.completion.warnings !== warningDiagnostics.length);
  const incomplete = !parsed.protocolStarted
    || !parsed.completion
    || parsed.malformedDiagnosticRecords > 0
    || Boolean(parsed.failure)
    || completionErrorMismatch
    || completionWarningMismatch;
  const displayErrors = incomplete ? errors.length : (parsed.completion?.errors ?? errors.length);
  const displayWarnings = incomplete ? warningDiagnostics.length : (parsed.completion?.warnings ?? warningDiagnostics.length);

  if (result.status === 0 && !incomplete) {
    console.log(`✓ Svelte — ${displayErrors} errors, ${displayWarnings} warnings`);
    return 0;
  }

  if (result.status === 0 && incomplete) {
    console.error('✗ Svelte — structured diagnostics incomplete; validation status unavailable');
  } else {
    const countQualifier = incomplete ? ' parsed' : '';
    console.error(`✗ Svelte — ${displayErrors}${countQualifier} error${displayErrors === 1 ? '' : 's'}, ${displayWarnings}${countQualifier} warning${displayWarnings === 1 ? '' : 's'}`);
  }
  const visible = errors.slice(0, ERROR_LIMIT);
  for (let index = 0; index < visible.length; index += 1) {
    console.error(`\n${index + 1}. ${formatLocalSvelteDiagnostic(visible[index])}`);
  }
  const omitted = Math.max(0, errors.length - visible.length);
  if (omitted) console.error(`\n${omitted} additional Svelte error${omitted === 1 ? '' : 's'} omitted.`);

  if (incomplete) {
    const reasons = [];
    if (!parsed.protocolStarted) reasons.push('START missing');
    if (!parsed.completion) reasons.push('COMPLETED missing');
    if (parsed.malformedDiagnosticRecords > 0) reasons.push(`malformedRecords=${parsed.malformedDiagnosticRecords}`);
    if (parsed.failure) reasons.push('FAILURE record present');
    if (completionErrorMismatch && parsed.completion) {
      reasons.push(`parsedErrors=${errors.length}`);
      reasons.push(`reportedErrors=${parsed.completion.errors}`);
    }
    if (completionWarningMismatch && parsed.completion) {
      reasons.push(`parsedWarnings=${warningDiagnostics.length}`);
      reasons.push(`reportedWarnings=${parsed.completion.warnings}`);
    }
    console.error(`\nCompact Svelte diagnostics were incomplete (${reasons.join(', ')}); bounded original output follows.`);
    const fallback = [stderr, stdout].filter(Boolean).join('\n').trim();
    if (fallback) console.error(bounded(fallback, OUTPUT_LIMIT));
  }
  console.error('\nVerbose reproduction: npm run check:verbose');
  return Number.isInteger(result.status) && result.status !== 0 ? result.status : 1;
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
