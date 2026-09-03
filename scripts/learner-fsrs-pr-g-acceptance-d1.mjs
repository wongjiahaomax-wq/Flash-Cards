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
const workerEntry = join(scriptDir, 'learner-fsrs-pr-g-acceptance-d1-worker.js');
const wranglerConfigPath = join(repoRoot, 'wrangler.jsonc');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const startupTimeoutMs = 30_000;

const TARGET_VERIFICATION_ROWS = 2_500;
const UNRELATED_VERIFICATION_ROWS = 5_000;
const ANALYTICS_LEARNERS = 40;
const ANALYTICS_SYSTEMS = 10;
const ANALYTICS_MONTHS = 60;
const WRITE_COUNT = 2_000;

function extractCompatibilityDate(configText) {
  const matches = [...configText.matchAll(/"compatibility_date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/g)];
  if (matches.length !== 1) throw new Error(`Expected exactly one compatibility_date; found ${matches.length}.`);
  return matches[0][1];
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function appendMultiRow(lines, prefix, rows, chunkSize = 100) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    lines.push(`${prefix} VALUES\n${rows.slice(index, index + chunkSize).join(',\n')};`);
  }
}

function buildSeedSql() {
  const now = Date.UTC(2026, 8, 4, 0, 0, 0);
  const lines = [
    'PRAGMA foreign_keys = ON;',
    'DROP TRIGGER scheduled_review_events_active_guard;',
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned) VALUES ('pr-g-deletion-user', 'PR G Deletion Learner', 'pr-g-deletion@example.test', 1, ${Date.UTC(2021, 0, 1)}, ${now}, 'user', 0);`,
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned) VALUES ('analytics-write-user', 'Analytics Write Learner', 'analytics-write@example.test', 1, ${Date.UTC(2020, 0, 1)}, ${now}, 'user', 0);`,
    `INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES ('analytics-system-00', 'Analytics System 00', 'analytics-system-00', 'system', NULL, 1);`
  ];

  appendMultiRow(
    lines,
    'INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)',
    Array.from({ length: 5 }, (_, index) => `(${sqlString(`pr-g-target-session-${index}`)}, ${now + 86_400_000}, ${sqlString(`pr-g-target-token-${index}`)}, ${now}, ${now}, 'pr-g-deletion-user')`)
  );
  appendMultiRow(
    lines,
    'INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)',
    Array.from({ length: 3 }, (_, index) => `(${sqlString(`pr-g-target-account-${index}`)}, ${sqlString(index === 0 ? 'pr-g-deletion-user' : `linked-${index}`)}, ${sqlString(index === 0 ? 'credential' : `provider-${index}`)}, 'pr-g-deletion-user', ${index === 0 ? sqlString('fixture') : 'NULL'}, ${now}, ${now})`)
  );

  appendMultiRow(
    lines,
    'INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt)',
    Array.from({ length: TARGET_VERIFICATION_ROWS }, (_, index) => `(${sqlString(`target-verification-${index}`)}, ${sqlString(`reset-password:target-${index}`)}, 'pr-g-deletion-user', ${now + 86_400_000}, ${now}, ${now})`)
  );
  appendMultiRow(
    lines,
    'INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt)',
    Array.from({ length: UNRELATED_VERIFICATION_ROWS }, (_, index) => `(${sqlString(`unrelated-verification-${index}`)}, ${sqlString(`unrelated:${index}`)}, ${sqlString(`unrelated-value-${index}`)}, ${now + 86_400_000}, ${now}, ${now})`)
  );

  appendMultiRow(
    lines,
    'INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)',
    Array.from({ length: ANALYTICS_SYSTEMS - 1 }, (_, offset) => {
      const index = offset + 1;
      return `(${sqlString(`analytics-system-${String(index).padStart(2, '0')}`)}, ${sqlString(`Analytics System ${String(index).padStart(2, '0')}`)}, ${sqlString(`analytics-system-${String(index).padStart(2, '0')}`)}, 'system', NULL, 1)`;
    })
  );

  appendMultiRow(
    lines,
    'INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned)',
    Array.from({ length: ANALYTICS_LEARNERS }, (_, index) => {
      const createdAt = Date.UTC(2019 + (index % 4), index % 12, 1);
      return `(${sqlString(`analytics-user-${String(index).padStart(3, '0')}`)}, ${sqlString(`Analytics Learner ${index}`)}, ${sqlString(`analytics-${index}@example.test`)}, 1, ${createdAt}, ${now}, 'user', 0)`;
    })
  );

  const bucketRows = [];
  for (let learner = 0; learner < ANALYTICS_LEARNERS; learner += 1) {
    const userId = `analytics-user-${String(learner).padStart(3, '0')}`;
    for (let system = 0; system < ANALYTICS_SYSTEMS; system += 1) {
      const systemId = `analytics-system-${String(system).padStart(2, '0')}`;
      for (let month = 0; month < ANALYTICS_MONTHS; month += 1) {
        const monthStart = Date.UTC(2021 + Math.floor(month / 12), month % 12, 1);
        const firstCompletedAt = monthStart + 10 * 86_400_000;
        const lastCompletedAt = monthStart + 20 * 86_400_000;
        bucketRows.push(`(${sqlString(userId)}, ${sqlString(systemId)}, ${monthStart}, 4, 1, 1, 1, 1, ${firstCompletedAt}, ${lastCompletedAt}, ${lastCompletedAt})`);
      }
    }
  }
  appendMultiRow(
    lines,
    'INSERT INTO learner_system_monthly_buckets (user_id, system_id, month_start, scheduled_completed, scheduled_again, scheduled_hard, scheduled_good, scheduled_easy, first_completed_at, last_completed_at, updated_at)',
    bucketRows,
    80
  );

  return `${lines.join('\n')}\n`;
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve local benchmark port.');
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

function sanitizedEnvironment() {
  const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_ACCOUNT_ID']) delete env[key];
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
  throw new Error('Vite did not produce the PR G acceptance Worker bundle.');
}

async function fetchJson(baseUrl, pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const text = await response.text();
  if (!response.ok) throw new Error(`${pathname} failed with HTTP ${response.status}: ${text}`);
  return JSON.parse(text);
}

async function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
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
}

async function main() {
  const compatibilityDate = extractCompatibilityDate(await readFile(wranglerConfigPath, 'utf8'));
  const workDir = await mkdtemp(join(tmpdir(), 'flash-cards-pr-g-acceptance-d1-'));
  const stateDir = join(workDir, 'state');
  const workerPath = join(workDir, 'worker.mjs');
  const configPath = join(workDir, 'wrangler-smoke.json');
  const seedPath = join(workDir, 'seed.sql');
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = sanitizedEnvironment();
  let child;
  let stdout = '';
  let stderr = '';

  try {
    await cp(join(repoRoot, 'drizzle'), join(workDir, 'drizzle'), { recursive: true });
    await bundleWorker(workerPath);
    await writeFile(seedPath, buildSeedSql());
    await writeFile(configPath, `${JSON.stringify({
      name: 'flash-cards-pr-g-acceptance-d1',
      main: './worker.mjs',
      compatibility_date: compatibilityDate,
      compatibility_flags: ['nodejs_compat'],
      workers_dev: false,
      vars: {
        BETTER_AUTH_SECRET: 'local-pr-g-acceptance-secret-2026-09-04-not-production',
        BETTER_AUTH_URL: baseUrl
      },
      d1_databases: [{
        binding: 'DB',
        database_name: 'flash-cards-pr-g-acceptance-d1',
        database_id: '00000000-0000-0000-0000-000000000141',
        migrations_dir: './drizzle'
      }]
    }, null, 2)}\n`);

    runWrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', stateDir, '--config', configPath], { cwd: workDir, env });
    runWrangler(['d1', 'execute', 'DB', '--local', '--persist-to', stateDir, '--config', configPath, '--file', seedPath], { cwd: workDir, env });

    child = spawn(process.execPath, [
      wranglerCli,
      'dev', '--local', '--config', configPath,
      '--ip', '127.0.0.1', '--port', String(port),
      '--persist-to', stateDir,
      '--show-interactive-dev-session', 'false'
    ], {
      cwd: workDir,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(-96_000); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-96_000); });

    const deadline = Date.now() + startupTimeoutMs;
    let healthy = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) break;
      try {
        const health = await fetchJson(baseUrl, '/health');
        if (health.ok) {
          healthy = true;
          break;
        }
      } catch {
        await new Promise((resolveWait) => setTimeout(resolveWait, 250));
      }
    }
    if (!healthy) {
      throw new Error(`PR G acceptance Worker did not become healthy.\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }

    const result = await fetchJson(baseUrl, '/run');
    const deletion = result.deletion;
    const analytics = result.analytics;

    assert.match(deletion.queryPlan, /verification_value_idx/);
    assert.equal(deletion.targetVerificationRows, TARGET_VERIFICATION_ROWS);
    assert.equal(deletion.unrelatedVerificationRows, UNRELATED_VERIFICATION_ROWS);
    assert.deepEqual(deletion.verificationBatchRows, [1_000, 1_000, 500]);
    assert.ok(deletion.maxVerificationBatchRows <= 1_000);
    assert.equal(deletion.finalPhase, 'identity_ready');
    assert.equal(deletion.unrelatedBeforeIdentityDelete, UNRELATED_VERIFICATION_ROWS);
    assert.equal(deletion.unrelatedAfterIdentityDelete, UNRELATED_VERIFICATION_ROWS);
    assert.deepEqual(deletion.residual, {
      user: 0,
      sessions: 0,
      accounts: 0,
      verifications: 0,
      deletionMarker: 0
    });

    assert.equal(analytics.scheduledWriteCount, WRITE_COUNT);
    assert.equal(Number(analytics.writeBucket?.scheduled_completed ?? 0), WRITE_COUNT);
    assert.equal(Number(analytics.writeBucket?.scheduled_again ?? 0), WRITE_COUNT / 4);
    assert.equal(Number(analytics.writeBucket?.scheduled_hard ?? 0), WRITE_COUNT / 4);
    assert.equal(Number(analytics.writeBucket?.scheduled_good ?? 0), WRITE_COUNT / 4);
    assert.equal(Number(analytics.writeBucket?.scheduled_easy ?? 0), WRITE_COUNT / 4);
    assert.deepEqual(analytics.longRunningFixture, {
      learners: ANALYTICS_LEARNERS,
      systems: ANALYTICS_SYSTEMS,
      months: ANALYTICS_MONTHS,
      bucketRows: ANALYTICS_LEARNERS * ANALYTICS_SYSTEMS * ANALYTICS_MONTHS
    });
    assert.equal(analytics.adminSystemSeriesRows, ANALYTICS_SYSTEMS * ANALYTICS_MONTHS);
    assert.ok(analytics.adminCohortSeriesRows > 0);
    assert.ok(Number.isFinite(analytics.baselineWriteMs) && analytics.baselineWriteMs >= 0);
    assert.ok(Number.isFinite(analytics.monthlyBucketWriteMs) && analytics.monthlyBucketWriteMs >= 0);
    assert.ok(Number.isFinite(analytics.adminSystemAggregationMs) && analytics.adminSystemAggregationMs >= 0);
    assert.ok(Number.isFinite(analytics.adminCohortAggregationMs) && analytics.adminCohortAggregationMs >= 0);

    console.log(JSON.stringify({
      kind: 'FSRS PR G local-D1 acceptance benchmark',
      verificationIndexPlan: deletion.queryPlan,
      verificationBatchRows: deletion.verificationBatchRows,
      betterAuthIdentityResidual: deletion.residual,
      unrelatedVerificationsPreserved: deletion.unrelatedAfterIdentityDelete,
      monthlyAnalytics: {
        scheduledWriteCount: analytics.scheduledWriteCount,
        baselineWriteMs: analytics.baselineWriteMs,
        monthlyBucketWriteMs: analytics.monthlyBucketWriteMs,
        monthlyBucketAddedMs: analytics.monthlyBucketAddedMs,
        monthlyBucketWriteRatio: analytics.monthlyBucketWriteRatio,
        longRunningBucketRows: analytics.longRunningFixture.bucketRows,
        adminSystemAggregationMs: analytics.adminSystemAggregationMs,
        adminSystemSeriesRows: analytics.adminSystemSeriesRows,
        adminCohortAggregationMs: analytics.adminCohortAggregationMs,
        adminCohortSeriesRows: analytics.adminCohortSeriesRows
      }
    }, null, 2));
  } finally {
    await stopProcessTree(child);
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
