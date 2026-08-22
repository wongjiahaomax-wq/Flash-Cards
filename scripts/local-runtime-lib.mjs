import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(scriptDir, '..');
export const localXdgConfigHome = join(repoRoot, '.wrangler', 'xdg-config');
export const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
export const viteCli = join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
export const defaultLocalPreviewPort = 8787;

export async function ensureLocalXdgConfigHome() {
  await mkdir(localXdgConfigHome, { recursive: true });
}

export function createLocalRuntimeEnv(baseEnv = process.env, overrides = {}) {
  return {
    ...baseEnv,
    XDG_CONFIG_HOME: localXdgConfigHome,
    ...overrides
  };
}

export function resolveLocalPreviewPort(env = process.env) {
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

export function localPreviewOrigin(port) {
  return `http://localhost:${port}`;
}

export function createLocalDevPlan(baseEnv = process.env) {
  return {
    command: process.execPath,
    args: [viteCli, 'dev'],
    cwd: repoRoot,
    env: createLocalRuntimeEnv(baseEnv)
  };
}

export function createLocalPreviewPlan(baseEnv = process.env) {
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

export async function runForeground(command, args, { cwd = repoRoot, env = process.env } = {}) {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit'
  });

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
