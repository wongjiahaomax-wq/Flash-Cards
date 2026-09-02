import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { removeRuntimeSmokeDirectory } from './wrangler-runtime-smoke-lib.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const wranglerConfigPath = join(repoRoot, 'wrangler.jsonc');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const schedulerPath = join(repoRoot, 'src', 'lib', 'server', 'learning', 'fsrs-scheduler.js');
const startupTimeoutMs = 20_000;
const reviewNow = Date.UTC(2026, 8, 2, 0, 0, 0);

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
    throw new Error('Unable to reserve a local port for FSRS workerd smoke.');
  }
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose()))
  );
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

function moduleSpecifier(fromDirectory, targetPath) {
  const value = relative(fromDirectory, targetPath).replaceAll('\\', '/');
  return value.startsWith('.') ? value : `./${value}`;
}

/** @param {unknown} value */
export function assertFsrsWorkerdResult(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('FSRS workerd smoke returned a non-object payload.');
  }
  const result = /** @type {Record<string, unknown>} */ (value);
  if (result.ok !== true) throw new Error('FSRS workerd smoke did not report success.');
  if (result.schedulerLibraryVersion !== '5.4.2') {
    throw new Error(`Unexpected FSRS library version: ${String(result.schedulerLibraryVersion)}.`);
  }
  if (result.schedulerRevision !== 1) {
    throw new Error(`Unexpected FSRS scheduler revision: ${String(result.schedulerRevision)}.`);
  }
  if (!Number.isFinite(result.nextDueAt) || Number(result.nextDueAt) <= reviewNow) {
    throw new Error(`FSRS workerd transition returned invalid nextDueAt: ${String(result.nextDueAt)}.`);
  }
  return result;
}

export async function runFsrsWorkerdSmoke() {
  const compatibilityDate = extractCompatibilityDate(await readFile(wranglerConfigPath, 'utf8'));
  const workDir = await mkdtemp(join(repoRoot, '.fsrs-workerd-smoke-'));
  const port = await reservePort();
  const workerPath = join(workDir, 'worker.mjs');
  const smokeConfigPath = join(workDir, 'wrangler-smoke.json');
  const schedulerImport = moduleSpecifier(workDir, schedulerPath);

  await writeFile(
    workerPath,
    `import {\n  FSRS_LIBRARY_VERSION,\n  FSRS_SCHEDULER_REVISION,\n  createDefaultFsrsParameters,\n  createInitialFsrsCard,\n  scheduleFsrsReview\n} from ${JSON.stringify(schedulerImport)};\n\nconst reviewNow = ${reviewNow};\n\nexport default {\n  fetch() {\n    const parameters = createDefaultFsrsParameters();\n    const card = createInitialFsrsCard(reviewNow);\n    const transition = scheduleFsrsReview({\n      card,\n      rating: 'good',\n      now: reviewNow,\n      parameters\n    });\n    return new Response(JSON.stringify({\n      ok: true,\n      schedulerLibraryVersion: FSRS_LIBRARY_VERSION,\n      schedulerRevision: FSRS_SCHEDULER_REVISION,\n      nextDueAt: transition.nextDueAt,\n      resultingState: transition.card.state\n    }), { headers: { 'content-type': 'application/json' } });\n  }\n};\n`
  );
  await writeFile(
    smokeConfigPath,
    `${JSON.stringify(
      {
        name: 'flash-cards-fsrs-workerd-smoke',
        main: './worker.mjs',
        compatibility_date: compatibilityDate,
        compatibility_flags: ['nodejs_compat'],
        workers_dev: false
      },
      null,
      2
    )}\n`
  );

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
  const child = spawn(
    process.execPath,
    [
      wranglerCli,
      'dev',
      '--local',
      '--config',
      smokeConfigPath,
      '--ip',
      '127.0.0.1',
      '--port',
      String(port)
    ],
    {
      cwd: workDir,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  child.stdout.on('data', (chunk) => {
    stdout = appendOutput(stdout, chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr = appendOutput(stderr, chunk);
  });

  let exitState = null;
  child.once('exit', (code, signal) => {
    exitState = { code, signal };
  });

  try {
    const deadline = Date.now() + startupTimeoutMs;
    while (Date.now() < deadline) {
      if (exitState) {
        throw new Error(
          `Wrangler exited before FSRS workerd smoke became ready (code=${exitState.code}, signal=${exitState.signal ?? 'none'}).`
        );
      }

      let response = null;
      try {
        response = await fetch(`http://127.0.0.1:${port}/`);
      } catch {
        // The local socket is expected to refuse connections until workerd is ready.
      }
      if (response) {
        if (!response.ok) {
          const body = (await response.text()).slice(0, 2_000);
          throw new Error(`FSRS workerd Worker responded ${response.status}: ${body}`);
        }
        const result = assertFsrsWorkerdResult(await response.json());
        return { compatibilityDate, ...result };
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    throw new Error(`FSRS workerd smoke did not become ready within ${startupTimeoutMs}ms.`);
  } catch (error) {
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n--- stderr ---\n');
    if (output) console.error(output);
    throw error;
  } finally {
    await stopProcessTree(child);
    await removeRuntimeSmokeDirectory(workDir);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runFsrsWorkerdSmoke()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(`FSRS workerd smoke failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
