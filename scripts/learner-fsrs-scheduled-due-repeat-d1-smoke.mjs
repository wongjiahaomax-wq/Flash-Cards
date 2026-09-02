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
const workerEntry = join(scriptDir, 'learner-fsrs-scheduled-due-repeat-d1-smoke-worker.js');
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
    throw new Error('Unable to reserve a local port for Scheduled Due/Repeat D1 smoke.');
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
  throw new Error('Vite did not produce the Scheduled Due/Repeat D1 smoke Worker bundle.');
}

async function fetchJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} failed with HTTP ${response.status}: ${text}`);
  return JSON.parse(text);
}

function seedSql() {
  return `
PRAGMA foreign_keys = ON;
INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)
VALUES ('scheduled-completion-d1-smoke-system', 'Scheduled Completion System', 'scheduled-completion-d1-smoke-system', 'system', NULL, 1);
INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)
VALUES ('scheduled-completion-d1-smoke-topic', 'Scheduled Completion Topic', 'scheduled-completion-d1-smoke-topic', 'topic', 'scheduled-completion-d1-smoke-system', 1);
INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, preview_session_id, is_active)
VALUES ('scheduled-completion-d1-smoke-case', 'Scheduled completion D1 smoke Case', 'Frozen vignette', 'all', NULL, NULL, 1);
INSERT INTO case_concepts (case_id, concept_id, role)
VALUES ('scheduled-completion-d1-smoke-case', 'scheduled-completion-d1-smoke-topic', 'primary');
`;
}

function assertExistingStateCompletion(result, queueClass) {
  assert.equal(result.result.status, 'completed');
  assert.equal(result.result.queueClass, queueClass);
  assert.equal(result.result.payloadMismatch, false);
  assert.equal(result.priorState.stateRevision, 1);
  assert.ok(result.priorState.dueAt < Date.now(), `${queueClass} seed should already be mature`);

  const evidence = result.evidence;
  assert.ok(evidence, `${queueClass} completion evidence should exist`);
  assert.equal(evidence.event_queue_class, queueClass);
  assert.equal(evidence.event_sequence_no, 2);
  assert.equal(evidence.event_state_revision, 2);
  assert.equal(evidence.state_revision, 2);
  assert.equal(evidence.event_state_revision, result.result.resultingStateRevision);
  assert.equal(evidence.event_state, result.result.resultingState);
  assert.equal(evidence.state, result.result.resultingState);
  assert.equal(evidence.event_due_at, result.result.nextDueAt);
  assert.equal(evidence.state_due_at, result.result.nextDueAt);
  assert.equal(evidence.event_count, 1);
  assert.equal(evidence.current_optimizer_count, 1);
  assert.equal(evidence.optimizer_total, 2);
  assert.equal(evidence.case_state_count, 1);
  assert.equal(evidence.encounter_count, 1);
  assert.equal(evidence.learner_scheduled, 2);
  assert.equal(evidence.system_scheduled, 2);
  assert.equal(evidence.active_reviews, 0);
}

async function main() {
  const compatibilityDate = extractCompatibilityDate(await readFile(wranglerConfigPath, 'utf8'));
  const workDir = await mkdtemp(join(tmpdir(), 'flash-cards-scheduled-due-repeat-d1-smoke-'));
  const stateDir = join(workDir, 'state');
  const workerPath = join(workDir, 'worker.mjs');
  const configPath = join(workDir, 'wrangler-smoke.json');
  const seedPath = join(workDir, 'seed.sql');
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = sanitizedEnvironment();

  await cp(join(repoRoot, 'drizzle'), join(workDir, 'drizzle'), { recursive: true });
  await bundleWorker(workerPath);
  await writeFile(seedPath, seedSql());
  await writeFile(configPath, `${JSON.stringify({
    name: 'flash-cards-scheduled-due-repeat-d1-smoke',
    main: './worker.mjs',
    compatibility_date: compatibilityDate,
    compatibility_flags: ['nodejs_compat'],
    workers_dev: false,
    d1_databases: [{
      binding: 'DB',
      database_name: 'flash-cards-scheduled-due-repeat-d1-smoke',
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
        throw new Error(`Wrangler exited before the Due/Repeat D1 smoke Worker became ready (code=${exitState.code}, signal=${exitState.signal ?? 'none'}).`);
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
    if (!ready) throw new Error('Timed out waiting for Scheduled Due/Repeat D1 smoke Worker.');

    const result = await fetchJson(baseUrl, '/complete-due-repeat');
    assertExistingStateCompletion(result.due, 'due');
    assertExistingStateCompletion(result.repeat, 'repeat');
    assert.ok([1, 3].includes(Number(result.repeat.priorState.state)), 'Repeat seed must be a short-term FSRS state.');

    console.log(JSON.stringify({
      runtime: 'workerd + local D1 binding',
      compatibilityDate,
      due: {
        status: result.due.result.status,
        priorStateRevision: result.due.priorState.stateRevision,
        resultingStateRevision: result.due.result.resultingStateRevision,
        resultingState: result.due.result.resultingState,
        sequenceNo: result.due.evidence.event_sequence_no,
        activeReviews: result.due.evidence.active_reviews
      },
      repeat: {
        status: result.repeat.result.status,
        priorState: result.repeat.priorState.state,
        priorStateRevision: result.repeat.priorState.stateRevision,
        resultingStateRevision: result.repeat.result.resultingStateRevision,
        resultingState: result.repeat.result.resultingState,
        sequenceNo: result.repeat.evidence.event_sequence_no,
        activeReviews: result.repeat.evidence.active_reviews
      }
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
  console.error(`Scheduled Due/Repeat D1 smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
