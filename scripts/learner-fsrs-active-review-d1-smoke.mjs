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
const workerEntry = join(scriptDir, 'learner-fsrs-active-review-d1-smoke-worker.js');
const wranglerConfigPath = join(repoRoot, 'wrangler.jsonc');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const startupTimeoutMs = 20_000;
const maximumQuestions = 256;
const maximumAssets = 64;
const minimumLargeFixtureBytes = 400 * 1024;
const boundaryRaceIterations = 4;

function extractCompatibilityDate(configText) {
  const matches = [...configText.matchAll(/"compatibility_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/g)];
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one compatibility_date in wrangler.jsonc; found ${matches.length}.`);
  }
  return matches[0][1];
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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
    throw new Error('Unable to reserve a local port for active Review D1 smoke.');
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
  ]) {
    delete env[key];
  }
  return env;
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
    `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`) VALUES ('active-review-d1-smoke-user', 'Active Review D1 Smoke', 'active-review-d1-smoke@example.test', 1, ${now}, ${now});`,
    "INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES ('active-review-d1-smoke-system', 'Active Review Smoke System', 'active-review-d1-smoke-system', 'system', NULL, 1);",
    "INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES ('active-review-d1-smoke-topic', 'Active Review Smoke Topic', 'active-review-d1-smoke-topic', 'topic', 'active-review-d1-smoke-system', 1);",
    `INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, preview_session_id, is_active) VALUES ('active-review-d1-smoke-case', 'Active Review D1 Maximum Fixture', ${sqlString('v'.repeat(1024))}, 'all', NULL, NULL, 1);`,
    "INSERT INTO case_concepts (case_id, concept_id, role) VALUES ('active-review-d1-smoke-case', 'active-review-d1-smoke-topic', 'primary');"
  ];

  for (let index = 0; index < maximumQuestions; index += 1) {
    const suffix = String(index).padStart(3, '0');
    const promptId = `active-review-d1-prompt-${suffix}`;
    const questionId = `active-review-d1-question-${suffix}`;
    const prompt = `Prompt ${suffix} ${'p'.repeat(800)}`;
    const answer = `Answer ${suffix} ${'a'.repeat(800)}`;
    lines.push(
      `INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active) VALUES (${sqlString(promptId)}, ${sqlString(prompt)}, NULL, 1);`,
      `INSERT INTO case_questions (id, case_id, question_prompt_id, answer_md, is_active) VALUES (${sqlString(questionId)}, 'active-review-d1-smoke-case', ${sqlString(promptId)}, ${sqlString(answer)}, 1);`
    );
  }

  for (let index = 0; index < maximumAssets; index += 1) {
    const suffix = String(index).padStart(2, '0');
    const assetId = `active-review-d1-asset-${suffix}`;
    lines.push(
      `INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, preview_session_id, is_active) VALUES (${sqlString(assetId)}, 'image', ${sqlString(`active-review-d1/${suffix}.png`)}, 'image/png', ${sqlString(`${suffix}.png`)}, ${sqlString(`Active Review smoke image ${suffix}`)}, NULL, 1);`,
      `INSERT INTO case_assets (case_id, asset_id, display_order, caption_md) VALUES ('active-review-d1-smoke-case', ${sqlString(assetId)}, ${index}, ${sqlString(`Active Review smoke caption ${suffix}`)});`
    );
  }

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
  throw new Error('Vite did not produce the active Review D1 smoke Worker bundle.');
}

async function fetchJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${pathname} failed with HTTP ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

function assertBoundaryRace(result, operation) {
  assert.equal(result.operation, operation);
  assert.ok(
    result.creationOutcome === 'stale-rejected' || result.creationOutcome === 'created-then-consumed',
    `Unexpected ${operation} race serialization: ${result.creationOutcome}`
  );
  assert.equal(result.remainingActiveReviews, 0);
  if (operation === 'reset') {
    assert.equal(result.after.generation, result.before.generation);
    assert.equal(result.after.reviewSequenceEpoch, result.before.reviewSequenceEpoch + 1);
    assert.equal(result.after.parameterRevision, result.before.parameterRevision);
  } else {
    assert.equal(result.after.generation, result.before.generation + 1);
    assert.equal(result.after.reviewSequenceEpoch, result.before.reviewSequenceEpoch + 1);
    assert.equal(result.after.parameterRevision, result.before.parameterRevision + 1);
  }
}

async function main() {
  const compatibilityDate = extractCompatibilityDate(await readFile(wranglerConfigPath, 'utf8'));
  const workDir = await mkdtemp(join(tmpdir(), 'flash-cards-active-review-d1-smoke-'));
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
    name: 'flash-cards-active-review-d1-smoke',
    main: './worker.mjs',
    compatibility_date: compatibilityDate,
    compatibility_flags: ['nodejs_compat'],
    workers_dev: false,
    d1_databases: [{
      binding: 'DB',
      database_name: 'flash-cards-active-review-d1-smoke',
      database_id: '00000000-0000-0000-0000-000000000132',
      migrations_dir: './drizzle'
    }]
  }, null, 2)}\n`);

  let stdout = '';
  let stderr = '';
  let child;
  try {
    runWrangler([
      'd1', 'migrations', 'apply', 'DB',
      '--local', '--persist-to', stateDir, '--config', configPath
    ], { cwd: workDir, env });
    runWrangler([
      'd1', 'execute', 'DB',
      '--local', '--persist-to', stateDir, '--config', configPath,
      '--file', seedPath
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
    while (Date.now() < deadline) {
      if (exitState) {
        throw new Error(`Wrangler exited before the D1 smoke Worker became ready (code=${exitState.code}, signal=${exitState.signal ?? 'none'}).`);
      }
      try {
        const response = await fetch(`${baseUrl}/not-ready-check`);
        if (response.status === 404) break;
      } catch {
        // Expected until workerd is listening.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }

    const created = await fetchJson(baseUrl, '/create-maximum');
    assert.ok(created.id);
    assert.ok(created.snapshotBytes >= minimumLargeFixtureBytes, `Expected a materially large frozen fixture; got ${created.snapshotBytes} bytes.`);

    const expired = await fetchJson(baseUrl, '/expire-and-discover');
    assert.equal(expired.expiredId, created.id);
    assert.equal(expired.stillOwned, true);

    const replacement = await fetchJson(baseUrl, '/replace-maximum');
    assert.ok(replacement.id);
    assert.notEqual(replacement.id, created.id);
    assert.ok(replacement.snapshotBytes >= minimumLargeFixtureBytes);

    const resetRaces = [];
    const freshRaces = [];
    for (let index = 0; index < boundaryRaceIterations; index += 1) {
      const resetRace = await fetchJson(baseUrl, '/race-reset');
      assertBoundaryRace(resetRace, 'reset');
      resetRaces.push(resetRace.creationOutcome);

      const freshRace = await fetchJson(baseUrl, '/race-fresh');
      assertBoundaryRace(freshRace, 'fresh');
      freshRaces.push(freshRace.creationOutcome);
    }

    console.log(JSON.stringify({
      runtime: 'workerd + local D1 binding',
      compatibilityDate,
      maximumQuestions,
      maximumAssets,
      initialSnapshotBytes: created.snapshotBytes,
      replacementSnapshotBytes: replacement.snapshotBytes,
      discoveryPreservedExpiredOwnership: expired.stillOwned,
      replacementCreatedNewOwner: replacement.id !== created.id,
      boundaryRaceIterations,
      resetCreationRaceOutcomes: resetRaces,
      freshCreationRaceOutcomes: freshRaces
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
  console.error(`Active Review D1 smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
