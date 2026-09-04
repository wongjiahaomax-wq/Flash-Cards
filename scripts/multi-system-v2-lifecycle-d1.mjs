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
const workerEntry = join(scriptDir, 'multi-system-v2-lifecycle-d1-worker.js');
const wranglerConfigPath = join(repoRoot, 'wrangler.jsonc');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const startupTimeoutMs = 20_000;

function extractCompatibilityDate(configText) {
  const matches = [...configText.matchAll(/"compatibility_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/g)];
  if (matches.length !== 1) throw new Error(`Expected exactly one compatibility_date in wrangler.jsonc; found ${matches.length}.`);
  return matches[0][1];
}
function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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
    throw new Error('Unable to reserve a local port for Multi-System v2 D1 lifecycle validation.');
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
  const lines = [
    'PRAGMA foreign_keys = ON;',
    `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`) VALUES
      ('multi-v2-scheduled-user', 'Multi v2 Scheduled', 'multi-v2-scheduled@example.test', 1, ${now}, ${now}),
      ('multi-v2-free-user', 'Multi v2 Free', 'multi-v2-free@example.test', 1, ${now}, ${now}),
      ('multi-v2-invalid-user', 'Multi v2 Invalid', 'multi-v2-invalid@example.test', 1, ${now}, ${now}),
      ('multi-v2-trigger-benchmark-user', 'Multi v2 Trigger Benchmark', 'multi-v2-trigger-benchmark@example.test', 1, ${now}, ${now});`,
    `INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
      ('multi-v2-system-a', 'Multi v2 System A', 'multi-v2-system-a', 'system', NULL, 1),
      ('multi-v2-system-b', 'Multi v2 System B', 'multi-v2-system-b', 'system', NULL, 1),
      ('multi-v2-topic-a', 'Multi v2 Topic A', 'multi-v2-topic-a', 'topic', 'multi-v2-system-a', 1),
      ('multi-v2-topic-b', 'Multi v2 Topic B', 'multi-v2-topic-b', 'topic', 'multi-v2-system-b', 1);`,
    `INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, preview_session_id, is_active)
      VALUES ('multi-v2-cross-case', 'Multi v2 Cross Case', 'Cross-System lifecycle vignette', 'all', NULL, NULL, 1);`,
    `INSERT INTO case_concepts (case_id, concept_id, role)
      VALUES ('multi-v2-cross-case', 'multi-v2-topic-b', 'primary');`,
    `INSERT INTO tags (id, name, normalized_name, is_active)
      VALUES ('multi-v2-cross-tag', 'Multi v2 Cross Tag', 'multi v2 cross tag', 1);`,
    `INSERT INTO system_tags (system_concept_id, tag_id, display_order)
      VALUES ('multi-v2-system-a', 'multi-v2-cross-tag', 0);`,
    `INSERT INTO case_tags (case_id, tag_id)
      VALUES ('multi-v2-cross-case', 'multi-v2-cross-tag');`,
    `INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active)
      VALUES ('multi-v2-cross-prompt', 'What is the key finding?', NULL, 1);`,
    `INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active)
      VALUES ('multi-v2-cross-question', 'multi-v2-cross-case', 'multi-v2-cross-prompt', 'The key finding.', 1);`
  ];

  const benchmarkConceptRows = [];
  for (let systemIndex = 0; systemIndex < 64; systemIndex += 1) {
    const system = `multi-v2-bench-system-${String(systemIndex).padStart(3, '0')}`;
    benchmarkConceptRows.push(`(${sqlString(system)}, ${sqlString(`Benchmark System ${systemIndex}`)}, ${sqlString(system)}, 'system', NULL, 1)`);
    for (let topicIndex = 0; topicIndex < 8; topicIndex += 1) {
      const topic = `multi-v2-bench-topic-${String(systemIndex).padStart(3, '0')}-${String(topicIndex).padStart(2, '0')}`;
      benchmarkConceptRows.push(`(${sqlString(topic)}, ${sqlString(`Benchmark Topic ${systemIndex}-${topicIndex}`)}, ${sqlString(topic)}, 'topic', ${sqlString(system)}, 1)`);
    }
  }
  lines.push(`INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES\n${benchmarkConceptRows.join(',\n')};`);
  lines.push(
    `INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, preview_session_id, is_active)
      VALUES ('multi-v2-trigger-benchmark-case', 'Multi v2 Trigger Benchmark Case', NULL, 'all', NULL, NULL, 1);`,
    `INSERT INTO case_concepts (case_id, concept_id, role)
      VALUES ('multi-v2-trigger-benchmark-case', 'multi-v2-bench-topic-000-00', 'primary');`
  );
  return `${lines.join('\n')}\n`;
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
  throw new Error('Vite did not produce the Multi-System v2 D1 lifecycle Worker bundle.');
}

async function fetchJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} failed with HTTP ${response.status}: ${text}`);
  return JSON.parse(text);
}

function assertAcceptance(result) {
  assert.equal(result.runtime, 'workerd + local D1 after all repository migrations');
  assert.equal(result.scheduled.descriptorVersion, 2);
  assert.equal(result.scheduled.selectedSystems, 2);
  assert.equal(result.scheduled.activeReviewSystemId, 'multi-v2-system-b');
  assert.equal(result.scheduled.completionStatus, 'completed');
  assert.equal(result.scheduled.replayStatus, 'replayed');
  assert.equal(result.scheduled.eventSystemId, 'multi-v2-system-b');
  assert.equal(Number(result.scheduled.monthly.scheduled_completed), 1);
  assert.equal(Number(result.scheduled.residual.events), 1);
  assert.equal(Number(result.scheduled.residual.active_reviews), 0);
  assert.equal(result.free.descriptorVersion, 2);
  assert.equal(result.free.selectedSystems, 2);
  assert.equal(result.free.activeReviewSystemId, 'multi-v2-system-b');
  assert.equal(result.free.completionStatus, 'completed');
  assert.equal(result.free.replayStatus, 'replayed');
  assert.equal(Number(result.free.state.receipts), 1);
  assert.equal(Number(result.free.state.scheduled_events), 0);
  assert.equal(Number(result.free.state.system_aggregates), 0);
  assert.equal(Number(result.free.state.fsrs_profiles), 0);
  assert.ok(result.invalidScope?.message, 'Lifecycle acceptance did not prove invalid scope rejection.');
}
function assertBenchmark(result) {
  assert.equal(result.runtime, 'workerd + local D1 after all repository migrations');
  assert.deepEqual(result.envelope, { systems: 64, routes: 512 });
  assert.equal(result.largeRoutes.iterations, 12);
  assert.equal(result.allSystems.iterations, 12);
  assert.ok(result.largeRoutes.p95Ms < result.limits.p95Ms);
  assert.ok(result.largeRoutes.maxMs < result.limits.singleInsertMs);
  assert.ok(result.allSystems.p95Ms < result.limits.p95Ms);
  assert.ok(result.allSystems.maxMs < result.limits.singleInsertMs);
}

async function main() {
  const benchmarkOnly = process.argv.includes('--benchmark');
  const acceptanceOnly = process.argv.includes('--acceptance');
  const unknown = process.argv.slice(2).filter((arg) => !['--benchmark', '--acceptance'].includes(arg));
  if (unknown.length || (benchmarkOnly && acceptanceOnly)) {
    throw new Error('Usage: node scripts/multi-system-v2-lifecycle-d1.mjs [--acceptance|--benchmark]');
  }
  const mode = benchmarkOnly ? 'benchmark' : 'acceptance';
  const compatibilityDate = extractCompatibilityDate(await readFile(wranglerConfigPath, 'utf8'));
  const workDir = await mkdtemp(join(tmpdir(), `flash-cards-multi-v2-${mode}-`));
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
    name: `flash-cards-multi-v2-${mode}`,
    main: './worker.mjs',
    compatibility_date: compatibilityDate,
    compatibility_flags: ['nodejs_compat'],
    workers_dev: false,
    d1_databases: [{
      binding: 'DB',
      database_name: `flash-cards-multi-v2-${mode}`,
      database_id: mode === 'benchmark'
        ? '00000000-0000-0000-0000-000000000228'
        : '00000000-0000-0000-0000-000000000227',
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
      if (exitState) throw new Error(`Wrangler exited before the Multi-System v2 ${mode} Worker became ready (code=${exitState.code}, signal=${exitState.signal ?? 'none'}).`);
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
    if (!ready) throw new Error(`Timed out waiting for Multi-System v2 ${mode} Worker.`);

    const result = await fetchJson(baseUrl, mode === 'benchmark' ? '/benchmark' : '/acceptance');
    if (mode === 'benchmark') assertBenchmark(result);
    else assertAcceptance(result);
    console.log(JSON.stringify({ mode, compatibilityDate, ...result }, null, 2));
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
  console.error(`Multi-System v2 D1 lifecycle validation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
