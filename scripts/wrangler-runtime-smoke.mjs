import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const wranglerConfigPath = join(repoRoot, 'wrangler.jsonc');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const readinessBody = 'wrangler-runtime-smoke-ok';
const startupTimeoutMs = 20_000;

function extractCompatibilityDate(configText) {
  const matches = [...configText.matchAll(/"compatibility_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/g)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one compatibility_date in wrangler.jsonc; found ${matches.length}.`);
  }
  return matches[0][1];
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Unable to reserve a local port for Wrangler runtime smoke.');
  }
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

function appendOutput(current, chunk) {
  const next = current + chunk.toString();
  return next.length > 64_000 ? next.slice(-64_000) : next;
}

async function stopProcessTree(child) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolveStop) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.once('error', () => resolveStop());
      killer.once('exit', () => resolveStop());
    });
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }
}

async function main() {
  const compatibilityDate = extractCompatibilityDate(await readFile(wranglerConfigPath, 'utf8'));
  const workDir = await mkdtemp(join(tmpdir(), 'flash-cards-wrangler-smoke-'));
  const port = await reservePort();
  const workerPath = join(workDir, 'worker.mjs');
  const smokeConfigPath = join(workDir, 'wrangler-smoke.json');

  await writeFile(workerPath, `export default {\n  fetch() {\n    return new Response('${readinessBody}');\n  }\n};\n`);
  await writeFile(smokeConfigPath, `${JSON.stringify({
    name: 'flash-cards-runtime-smoke',
    main: './worker.mjs',
    compatibility_date: compatibilityDate,
    workers_dev: false
  }, null, 2)}\n`);

  const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };
  for (const key of [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_API_KEY',
    'CLOUDFLARE_EMAIL',
    'CLOUDFLARE_ACCOUNT_ID'
  ]) {
    delete env[key];
  }

  let stdout = '';
  let stderr = '';
  const child = spawn(process.execPath, [
    wranglerCli,
    'dev',
    '--local',
    '--config',
    smokeConfigPath,
    '--ip',
    '127.0.0.1',
    '--port',
    String(port)
  ], {
    cwd: workDir,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => { stdout = appendOutput(stdout, chunk); });
  child.stderr.on('data', (chunk) => { stderr = appendOutput(stderr, chunk); });

  let exitState = null;
  child.once('exit', (code, signal) => { exitState = { code, signal }; });

  try {
    const deadline = Date.now() + startupTimeoutMs;
    while (Date.now() < deadline) {
      if (exitState) {
        throw new Error(`Wrangler exited before the Worker became ready (code=${exitState.code}, signal=${exitState.signal ?? 'none'}).`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`);
        if (response.ok && await response.text() === readinessBody) {
          console.log(`Wrangler runtime smoke passed for compatibility_date ${compatibilityDate}.`);
          return;
        }
      } catch {
        // The local socket is expected to refuse connections until workerd is ready.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error(`Wrangler did not become ready within ${startupTimeoutMs}ms.`);
  } catch (error) {
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n--- stderr ---\n');
    if (output) console.error(output);
    throw error;
  } finally {
    await stopProcessTree(child);
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Wrangler runtime smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
