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
const workerEntry = join(scriptDir, 'multi-system-v2-cross-navigation-d1-worker.js');
const wranglerConfigPath = join(repoRoot, 'wrangler.jsonc');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const startupTimeoutMs = 20_000;

function extractCompatibilityDate(configText) {
  const matches = [...configText.matchAll(/"compatibility_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/g)];
  if (matches.length !== 1) throw new Error(`Expected exactly one compatibility_date in wrangler.jsonc; found ${matches.length}.`);
  return matches[0][1];
}

function sanitizedEnvironment() {
  const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_ACCOUNT_ID']) delete env[key];
  return env;
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
    throw new Error('Unable to reserve a local port for cross-System navigation D1 acceptance.');
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

function runWrangler(args, options) {
  execFileSync(process.execPath, [wranglerCli, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit'
  });
}

function buildSeedSql() {
  const now = Date.now();
  return `
PRAGMA foreign_keys = ON;
INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`) VALUES
  ('multi-v2-nav-scheduled-user', 'Multi v2 Nav Scheduled', 'multi-v2-nav-scheduled@example.test', 1, ${now}, ${now}),
  ('multi-v2-nav-free-user', 'Multi v2 Nav Free', 'multi-v2-nav-free@example.test', 1, ${now}, ${now});

INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
  ('multi-v2-nav-system-a', 'Multi v2 Nav System A', 'multi-v2-nav-system-a', 'system', NULL, 1),
  ('multi-v2-nav-system-b', 'Multi v2 Nav System B', 'multi-v2-nav-system-b', 'system', NULL, 1),
  ('multi-v2-nav-topic-a', 'Multi v2 Nav Topic A', 'multi-v2-nav-topic-a', 'topic', 'multi-v2-nav-system-a', 1),
  ('multi-v2-nav-topic-b', 'Multi v2 Nav Topic B', 'multi-v2-nav-topic-b', 'topic', 'multi-v2-nav-system-b', 1);

INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, preview_session_id, is_active) VALUES
  ('multi-v2-nav-case-a', 'Multi v2 Nav Case A', 'System A navigation vignette', 'all', NULL, NULL, 1),
  ('multi-v2-nav-case-b', 'Multi v2 Nav Case B', 'System B navigation vignette', 'all', NULL, NULL, 1);

INSERT INTO case_concepts (case_id, concept_id, role) VALUES
  ('multi-v2-nav-case-a', 'multi-v2-nav-topic-a', 'primary'),
  ('multi-v2-nav-case-b', 'multi-v2-nav-topic-b', 'primary');

INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active) VALUES
  ('multi-v2-nav-prompt-a', 'What is the System A finding?', NULL, 1),
  ('multi-v2-nav-prompt-b', 'What is the System B finding?', NULL, 1);

INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES
  ('multi-v2-nav-question-a', 'multi-v2-nav-case-a', 'multi-v2-nav-prompt-a', 'System A answer.', 1),
  ('multi-v2-nav-question-b', 'multi-v2-nav-case-b', 'multi-v2-nav-prompt-b', 'System B answer.', 1);
`;
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
  throw new Error('Vite did not produce the cross-System navigation acceptance Worker bundle.');
}

async function fetchJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} failed with HTTP ${response.status}: ${text}`);
  return JSON.parse(text);
}

function assertAcceptance(result) {
  assert.equal(result.runtime, 'workerd + local D1 after all repository migrations');
  assert.deepEqual(result.scheduled.first, {
    caseId: 'multi-v2-nav-case-a',
    systemId: 'multi-v2-nav-system-a'
  });
  assert.deepEqual(result.scheduled.second, {
    caseId: 'multi-v2-nav-case-b',
    systemId: 'multi-v2-nav-system-b'
  });
  assert.equal(result.scheduled.secondOpenRunScopeSystems, 2);
  assert.equal(result.scheduled.scheduledEvents, 2);
  assert.deepEqual(result.free.first, {
    caseId: 'multi-v2-nav-case-a',
    systemId: 'multi-v2-nav-system-a'
  });
  assert.deepEqual(result.free.second, {
    caseId: 'multi-v2-nav-case-b',
    systemId: 'multi-v2-nav-system-b'
  });
  assert.equal(result.free.secondOpenRunScopeSystems, 2);
  assert.equal(result.free.receipts, 2);
}

async function main() {
  const compatibilityDate = extractCompatibilityDate(await readFile(wranglerConfigPath, 'utf8'));
  const workDir = await mkdtemp(join(tmpdir(), 'flash-cards-multi-v2-cross-navigation-'));
  const stateDir = join(workDir, 'state');
  const workerPath = join(workDir, 'worker.mjs');
  const configPath = join(workDir, 'wrangler-smoke.json');
  const seedPath = join(workDir, 'seed.sql');
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = sanitizedEnvironment();

  await cp(join(repoRoot, 'drizzle'), join(workDir, 'drizzle'), { recursive: true });
  await bundleWorker(workerPath);
  await writeFile(seedPath, buildSeedSql());
  await writeFile(configPath, `${JSON.stringify({
    name: 'flash-cards-multi-v2-cross-navigation',
    main: './worker.mjs',
    compatibility_date: compatibilityDate,
    compatibility_flags: ['nodejs_compat'],
    workers_dev: false,
    d1_databases: [{
      binding: 'DB',
      database_name: 'flash-cards-multi-v2-cross-navigation',
      database_id: '00000000-0000-0000-0000-000000000229',
      migrations_dir: './drizzle'
    }]
  }, null, 2)}\n`);

  let stdout = '';
  let stderr = '';
  let child;
  try {
    runWrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', stateDir, '--config', configPath], { cwd: workDir, env });
    runWrangler(['d1', 'execute', 'DB', '--local', '--persist-to', stateDir, '--config', configPath, '--file', seedPath], { cwd: workDir, env });

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
      if (exitState) throw new Error(`Wrangler exited before the cross-System navigation Worker became ready (code=${exitState.code}, signal=${exitState.signal ?? 'none'}).`);
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
    if (!ready) throw new Error('Timed out waiting for cross-System navigation acceptance Worker.');

    const result = await fetchJson(baseUrl, '/acceptance');
    assertAcceptance(result);
    console.log(JSON.stringify({ compatibilityDate, ...result }, null, 2));
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
  console.error(`Multi-System v2 cross-System navigation D1 acceptance failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
