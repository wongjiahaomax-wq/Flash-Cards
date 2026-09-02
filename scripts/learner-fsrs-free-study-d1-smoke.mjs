import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const workerEntry = join(scriptDir, 'learner-fsrs-free-study-d1-smoke-worker.js');
const wranglerConfigPath = join(repoRoot, 'wrangler.jsonc');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
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
    throw new Error('Unable to reserve a local port for Free Study D1 smoke.');
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

function sanitizedEnvironment() {
  const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };
  for (const key of [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_API_KEY',
    'CLOUDFLARE_EMAIL',
    'CLOUDFLARE_ACCOUNT_ID'
  ]) delete env[key];
  return env;
}

function runWrangler(args, options) {
  execFileSync(process.execPath, [wranglerCli, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit'
  });
}

async function bundleWorker(outputPath) {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      target: 'es2022',
      lib: { entry: workerEntry, formats: ['es'], fileName: () => 'worker.mjs' },
      rollupOptions: { output: { inlineDynamicImports: true } }
    }
  });
  const results = Array.isArray(result) ? result : [result];
  for (const buildResult of results) {
    if (!('output' in buildResult)) continue;
    const chunk = buildResult.output.find((item) => item.type === 'chunk');
    if (chunk?.type === 'chunk') {
      await writeFile(outputPath, chunk.code);
      return;
    }
  }
  throw new Error('Vite did not produce the Free Study D1 smoke Worker bundle.');
}

function seedSql(now) {
  return `
PRAGMA foreign_keys = ON;
INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`)
VALUES ('free-study-seed-user', 'Free Study Seed', 'free-study-seed@example.test', 1, ${now}, ${now});
INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)
VALUES ('free-study-d1-smoke-system', 'Free Study System', 'free-study-d1-smoke-system', 'system', NULL, 1);
INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)
VALUES ('free-study-d1-smoke-topic', 'Free Study Topic', 'free-study-d1-smoke-topic', 'topic', 'free-study-d1-smoke-system', 1);
INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, preview_session_id, is_active)
VALUES ('free-study-d1-smoke-case', 'Free Study D1 smoke Case', 'Frozen vignette', 'all', NULL, NULL, 1);
INSERT INTO case_concepts (case_id, concept_id, role)
VALUES ('free-study-d1-smoke-case', 'free-study-d1-smoke-topic', 'primary');
`;
}

async function main() {
  const compatibilityDate = extractCompatibilityDate(await readFile(wranglerConfigPath, 'utf8'));
  const workDir = await mkdtemp(join(tmpdir(), 'flash-cards-free-study-d1-smoke-'));
  const stateDir = join(workDir, 'state');
  const workerPath = join(workDir, 'worker.mjs');
  const configPath = join(workDir, 'wrangler-smoke.json');
  const seedPath = join(workDir, 'seed.sql');
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = sanitizedEnvironment();

  await cp(join(repoRoot, 'drizzle'), join(workDir, 'drizzle'), { recursive: true });
  await bundleWorker(workerPath);
  await writeFile(seedPath, seedSql(Date.now()));
  await writeFile(configPath, `${JSON.stringify({
    name: 'flash-cards-free-study-d1-smoke',
    main: './worker.mjs',
    compatibility_date: compatibilityDate,
    compatibility_flags: ['nodejs_compat'],
    workers_dev: false,
    d1_databases: [{
      binding: 'DB',
      database_name: 'flash-cards-free-study-d1-smoke',
      database_id: '00000000-0000-0000-0000-000000000134',
      migrations_dir: './drizzle'
    }]
  }, null, 2)}\n`);

  let stdout = '';
  let stderr = '';
  let child;
  try {
    runWrangler([
      'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', stateDir, '--config', configPath
    ], { cwd: workDir, env });
    runWrangler([
      'd1', 'execute', 'DB', '--local', '--persist-to', stateDir, '--config', configPath, '--file', seedPath
    ], { cwd: workDir, env });

    child = spawn(process.execPath, [
      wranglerCli,
      'dev',
      '--local',
      '--config', configPath,
      '--ip', '127.0.0.1',
      '--port', String(port),
      '--persist-to', stateDir,
      '--show-interactive-dev-session', 'false'
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
    const deadline = Date.now() + startupTimeoutMs;
    let ready = false;
    while (Date.now() < deadline) {
      if (exitState) {
        throw new Error(`Wrangler exited before the Free Study D1 smoke Worker became ready (code=${exitState.code}, signal=${exitState.signal ?? 'none'}).`);
      }
      try {
        const response = await fetch(`${baseUrl}/not-ready-check`);
        if (response.status === 404) {
          ready = true;
          break;
        }
      } catch {
        // Expected until workerd is listening.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    if (!ready) throw new Error('Timed out waiting for Free Study D1 smoke Worker.');

    const response = await fetch(`${baseUrl}/run`);
    const text = await response.text();
    if (!response.ok) throw new Error(`/run failed with HTTP ${response.status}: ${text}`);
    const result = JSON.parse(text);

    assert.equal(result.preference.expandedLearning, true);
    assert.equal(result.preference.fsrsProfileRowsAfterPreferenceWrite, 0);
    assert.equal(result.racingCompletions.filter((entry) => entry.status === 'completed').length, 1);
    assert.equal(result.racingCompletions.filter((entry) => entry.status === 'replayed').length, 1);
    assert.equal(result.retry.status, 'replayed');
    assert.equal(result.baseCounts.free_times_studied, 1);
    assert.equal(result.baseCounts.learner_free, 1);
    assert.equal(result.baseCounts.learner_scheduled, 0);
    assert.equal(result.baseCounts.scheduled_events, 0);
    assert.equal(result.baseCounts.optimizer_evidence, 0);
    assert.equal(result.baseCounts.case_states, 0);
    assert.equal(result.baseCounts.fsrs_profiles, 0);
    assert.equal(result.baseCounts.active_reviews, 0);
    assert.equal(result.expiredReceiptReplay.status, 'rejected');
    assert.equal(result.expiredReceiptReplay.error.code, 'unavailable');
    assert.equal(result.expiredReceiptsCleaned, 1);

    console.log(JSON.stringify({
      runtime: 'workerd + local D1 binding',
      compatibilityDate,
      expandedLearning: result.preference.expandedLearning,
      fsrsProfileRowsAfterPreferenceWrite: result.preference.fsrsProfileRowsAfterPreferenceWrite,
      completionStatuses: result.racingCompletions.map((entry) => entry.status),
      retryStatus: result.retry.status,
      expiredReceiptRetryStatus: result.expiredReceiptReplay.status,
      freeTimesStudied: result.baseCounts.free_times_studied,
      learnerFreeCompleted: result.baseCounts.learner_free,
      scheduledEvents: result.baseCounts.scheduled_events,
      optimizerEvidence: result.baseCounts.optimizer_evidence,
      caseStates: result.baseCounts.case_states,
      expiredReceiptsCleaned: result.expiredReceiptsCleaned
    }, null, 2));
  } catch (error) {
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n--- stderr ---\n');
    if (output) console.error(output);
    throw error;
  } finally {
    if (child) await stopProcessTree(child);
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Free Study D1 smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
