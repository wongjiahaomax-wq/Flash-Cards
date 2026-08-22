import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** @typedef {Record<string, string | undefined>} Environment */
/** @typedef {{ code: number | null, signal: NodeJS.Signals | null }} ChildExit */

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(scriptDir, '..');
export const localXdgConfigHome = join(repoRoot, '.wrangler', 'xdg-config');
export const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
export const viteCli = join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
export const defaultLocalPreviewPort = 8787;

export async function ensureLocalXdgConfigHome() {
  await mkdir(localXdgConfigHome, { recursive: true });
}

/**
 * @param {Environment} [baseEnv]
 * @param {Environment} [overrides]
 * @returns {Environment}
 */
export function createLocalRuntimeEnv(baseEnv = /** @type {Environment} */ (process.env), overrides = {}) {
  return {
    ...baseEnv,
    XDG_CONFIG_HOME: localXdgConfigHome,
    ...overrides
  };
}

/** @param {Environment} [env] */
export function resolveLocalPreviewPort(env = /** @type {Environment} */ (process.env)) {
  const raw = String(env.LOCAL_PREVIEW_PORT ?? '').trim();
  if (!raw) return defaultLocalPreviewPort;
  if (!/^\d+$/.test(raw)) {
    throw new Error('LOCAL_PREVIEW_PORT must be an integer between 1 and 65535.');
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('LOCAL_PREVIEW_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

/** @param {number} port */
export function localPreviewOrigin(port) {
  return `http://localhost:${port}`;
}

/** @param {Environment} [baseEnv] */
export function createLocalDevPlan(baseEnv = /** @type {Environment} */ (process.env)) {
  return {
    command: process.execPath,
    args: [viteCli, 'dev'],
    cwd: repoRoot,
    env: createLocalRuntimeEnv(baseEnv)
  };
}

/** @param {Environment} [baseEnv] */
export function createLocalPreviewPlan(baseEnv = /** @type {Environment} */ (process.env)) {
  const port = resolveLocalPreviewPort(baseEnv);
  const origin = localPreviewOrigin(port);
  const env = createLocalRuntimeEnv(baseEnv, { BETTER_AUTH_URL: origin });
  return {
    port,
    origin,
    env,
    build: {
      command: process.execPath,
      args: [viteCli, 'build']
    },
    migrate: {
      command: process.execPath,
      args: [wranglerCli, 'd1', 'migrations', 'apply', 'DB', '--local']
    },
    serve: {
      command: process.execPath,
      args: [
        wranglerCli,
        'dev',
        '--local',
        '--port',
        String(port),
        '--var',
        `BETTER_AUTH_URL:${origin}`
      ]
    }
  };
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Environment }} [options]
 * @returns {Promise<ChildExit>}
 */
export async function runForeground(
  command,
  args,
  { cwd = repoRoot, env = /** @type {Environment} */ (process.env) } = {}
) {
  // Materializing the child environment from process.env satisfies the repository's
  // augmented Node ProcessEnv type while the caller-facing plan stays a generic,
  // testable record. Explicit child overrides (XDG/auth) remain authoritative.
  const childEnv = { ...process.env, ...env };
  const child = spawn(command, args, {
    cwd,
    env: childEnv,
    stdio: 'inherit'
  });

  /** @param {NodeJS.Signals} signal */
  const forwardSignal = (signal) => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill(signal);
      } catch {
        // If the child has already exited, its exit event below remains authoritative.
      }
    }
  };
  const onSigint = () => forwardSignal('SIGINT');
  const onSigterm = () => forwardSignal('SIGTERM');
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);

  try {
    return await new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolveExit({ code, signal }));
    });
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

/** @param {ChildExit} result */
export function applyChildExit(result) {
  if (result.signal) {
    try {
      process.kill(process.pid, result.signal);
      return;
    } catch {
      process.exitCode = 1;
      return;
    }
  }
  process.exitCode = result.code ?? 1;
}
