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
const workerEntry = join(scriptDir, 'learner-fsrs-account-deletion-d1-smoke-worker.js');
const wranglerConfigPath = join(repoRoot, 'wrangler.jsonc');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const startupTimeoutMs = 20_000;
const caseCount = 1_200;
const eventCount = 2_500;
const freeReceiptCount = 1_200;
const systemCount = 4;
const deletionBatchSize = 1_000;
const sessionCount = 2_500;
const accountCount = 1_500;

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
  const now = Date.UTC(2026, 8, 3, 0, 0, 0);
  const lines = [
    'PRAGMA foreign_keys = ON;',
    'DROP TRIGGER scheduled_review_events_active_guard;',
    'DROP TRIGGER active_reviews_content_scope_guard;',
    'DROP TRIGGER free_review_completion_receipts_active_guard;',
    `INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned) VALUES ('d1-deletion-user', 'D1 Mature Learner', 'd1-mature@example.test', 1, ${now - 5 * 365 * 86_400_000}, ${now}, 'user', 0);`,
    `INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES ('d1-reset', 'reset-password:d1-token', 'd1-deletion-user', ${now + 86_400_000}, ${now}, ${now});`
  ];

  appendMultiRow(
    lines,
    'INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)',
    Array.from({ length: accountCount }, (_, index) => `(${sqlString(`d1-account-${index}`)}, ${sqlString(index === 0 ? 'd1-deletion-user' : `linked-${index}`)}, ${sqlString(index === 0 ? 'credential' : `provider-${index}`)}, 'd1-deletion-user', ${index === 0 ? sqlString('fixture') : 'NULL'}, ${now}, ${now})`)
  );
  appendMultiRow(
    lines,
    'INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)',
    Array.from({ length: sessionCount }, (_, index) => `(${sqlString(`session-${index}`)}, ${now + 86_400_000}, ${sqlString(`token-${index}`)}, ${now}, ${now}, 'd1-deletion-user')`)
  );
  appendMultiRow(
    lines,
    'INSERT INTO concepts (id, name, slug, kind, parent_id, is_active)',
    Array.from({ length: systemCount }, (_, index) => `(${sqlString(`system-${index}`)}, ${sqlString(`System ${index}`)}, ${sqlString(`system-${index}`)}, 'system', NULL, 1)`)
  );
  appendMultiRow(
    lines,
    'INSERT INTO cases (id, title, is_active)',
    Array.from({ length: caseCount }, (_, index) => `(${sqlString(`case-${String(index).padStart(5, '0')}`)}, ${sqlString(`Case ${index}`)}, 1)`)
  );
  appendMultiRow(
    lines,
    'INSERT INTO learner_case_fsrs (user_id, case_id, due_at, generation, review_sequence_epoch, parameter_revision, scheduler_revision, scheduler_library_version, state_revision)',
    Array.from({ length: caseCount }, (_, index) => `('d1-deletion-user', ${sqlString(`case-${String(index).padStart(5, '0')}`)}, ${now + (index % 30) * 86_400_000}, 1, 1, 1, 1, '5.4.2', 1)`)
  );
  appendMultiRow(
    lines,
    'INSERT INTO learner_case_encounters (user_id, case_id, first_scheduled_completed_at)',
    Array.from({ length: caseCount }, (_, index) => `('d1-deletion-user', ${sqlString(`case-${String(index).padStart(5, '0')}`)}, ${now - 365 * 86_400_000})`)
  );

  lines.push(
    "INSERT INTO learner_preferences (user_id) VALUES ('d1-deletion-user');",
    "INSERT INTO learner_fsrs_profiles (user_id, scheduler_library_version, parameters_json) VALUES ('d1-deletion-user', '5.4.2', '{}');",
    `INSERT INTO learner_aggregates (user_id, scheduled_completed, scheduled_good, first_activity_at, last_activity_at) VALUES ('d1-deletion-user', ${eventCount}, ${eventCount}, ${now - 5 * 365 * 86_400_000}, ${now});`
  );
  appendMultiRow(
    lines,
    'INSERT INTO learner_system_aggregates (user_id, system_id, scheduled_completed, scheduled_good, first_completed_at, last_completed_at)',
    Array.from({ length: systemCount }, (_, index) => {
      const count = Math.floor((eventCount + systemCount - 1 - index) / systemCount);
      return `('d1-deletion-user', ${sqlString(`system-${index}`)}, ${count}, ${count}, ${now - 5 * 365 * 86_400_000}, ${now})`;
    })
  );

  const sequences = new Uint16Array(caseCount);
  const eventRows = [];
  const optimizerRows = [];
  for (let index = 0; index < eventCount; index += 1) {
    const caseIndex = index % caseCount;
    const caseId = `case-${String(caseIndex).padStart(5, '0')}`;
    const sequenceNo = ++sequences[caseIndex];
    const systemId = `system-${index % systemCount}`;
    const monthOffset = index % 24;
    const completedAt = Date.UTC(2024 + Math.floor(monthOffset / 12), monthOffset % 12, 15, 12, index % 60, 0);
    const eventId = `event-${String(index).padStart(6, '0')}`;
    eventRows.push(`(${sqlString(eventId)}, 'd1-deletion-user', ${sqlString(caseId)}, ${sqlString(`Case ${caseIndex}`)}, ${sqlString(systemId)}, ${completedAt}, 'good', 'original', 1, 1, ${sequenceNo}, 1, 1, '5.4.2', 1, ${completedAt + 86_400_000}, 'due', 'benchmark-run', 'benchmark-scope', ${completedAt}, 2)`);
    optimizerRows.push(`(${sqlString(`optimizer-${String(index).padStart(6, '0')}`)}, 'd1-deletion-user', ${sqlString(caseId)}, ${completedAt}, 'good', 1, 1, ${sequenceNo})`);
  }
  appendMultiRow(
    lines,
    'INSERT INTO scheduled_review_events (id, user_id, case_id, case_title_snapshot, system_id, completed_at, rating, content_mode, generation, review_sequence_epoch, sequence_no, parameter_revision, scheduler_revision, scheduler_library_version, resulting_state_revision, next_due_at, queue_class, run_id, scope_fingerprint, run_started_at, resulting_state)',
    eventRows,
    50
  );
  appendMultiRow(
    lines,
    'INSERT INTO learner_optimizer_evidence (event_id, user_id, case_id, completed_at, rating, generation, review_sequence_epoch, sequence_no)',
    optimizerRows
  );
  appendMultiRow(
    lines,
    'INSERT INTO free_review_completion_receipts (id, user_id, case_id, completed_at, resulting_free_times_studied, expires_at)',
    Array.from({ length: freeReceiptCount }, (_, index) => `(${sqlString(`free-${index}`)}, 'd1-deletion-user', 'case-00000', ${now - index * 1000}, 1, ${now + 86_400_000})`)
  );

  lines.push(`INSERT INTO active_reviews (id, user_id, case_id, system_id, study_mode, content_mode, run_id, scope_fingerprint, scope_json, case_title_snapshot, revealed_at, expires_at) VALUES ('active-review', 'd1-deletion-user', 'case-00000', 'system-0', 'free', 'original', 'free-run', 'free-scope', '{"systemId":"system-0","routes":[]}', 'Frozen Case', ${now}, ${now + 86_400_000});`);
  appendMultiRow(
    lines,
    'INSERT INTO active_review_questions (id, active_review_id, question_prompt_id, source_type, display_order, prompt_snapshot_md, answer_snapshot_md)',
    Array.from({ length: 256 }, (_, index) => `(${sqlString(`active-question-${index}`)}, 'active-review', ${sqlString(`prompt-${index}`)}, 'case', ${index}, 'Prompt', 'Answer')`)
  );
  appendMultiRow(
    lines,
    'INSERT INTO assets (id, type, storage_key, mime_type, is_active)',
    Array.from({ length: 64 }, (_, index) => `(${sqlString(`asset-${index}`)}, 'image', ${sqlString(`benchmark/${index}.png`)}, 'image/png', 1)`)
  );
  appendMultiRow(
    lines,
    'INSERT INTO active_review_assets (id, active_review_id, asset_id, display_order, storage_key_snapshot)',
    Array.from({ length: 64 }, (_, index) => `(${sqlString(`active-asset-${index}`)}, 'active-review', ${sqlString(`asset-${index}`)}, ${index}, ${sqlString(`benchmark/${index}.png`)})`)
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
  execFileSync(process.execPath, [wranglerCli, ...args], { cwd: options.cwd, env: options.env, stdio: 'inherit' });
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
  throw new Error('Vite did not produce the deletion smoke Worker bundle.');
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
  try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error?.code !== 'ESRCH') throw error; }
}

async function main() {
  const compatibilityDate = extractCompatibilityDate(await readFile(wranglerConfigPath, 'utf8'));
  const workDir = await mkdtemp(join(tmpdir(), 'flash-cards-account-deletion-d1-'));
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
      name: 'flash-cards-account-deletion-d1-smoke',
      main: './worker.mjs',
      compatibility_date: compatibilityDate,
      compatibility_flags: ['nodejs_compat'],
      workers_dev: false,
      d1_databases: [{
        binding: 'DB',
        database_name: 'flash-cards-account-deletion-d1-smoke',
        database_id: '00000000-0000-0000-0000-000000000140',
        migrations_dir: './drizzle'
      }]
    }, null, 2)}\n`);

    runWrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', stateDir, '--config', configPath], { cwd: workDir, env });
    runWrangler(['d1', 'execute', 'DB', '--local', '--persist-to', stateDir, '--config', configPath, '--file', seedPath], { cwd: workDir, env });

    child = spawn(process.execPath, [wranglerCli, 'dev', '--local', '--config', configPath, '--ip', '127.0.0.1', '--port', String(port), '--persist-to', stateDir, '--show-interactive-dev-session', 'false'], {
      cwd: workDir,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(-64_000); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-64_000); });

    const deadline = Date.now() + startupTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${baseUrl}/not-ready`);
        if (response.status === 404) break;
      } catch {}
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }

    const initial = await fetchJson(baseUrl, '/status');
    assert.equal(initial.verifications, 1, 'mature fixture must include learner-owned Better Auth verification state');
    assert.equal(initial.sessions, sessionCount, 'mature fixture must force multiple bounded auth-session batches');
    assert.equal(initial.accounts, accountCount, 'mature fixture must force multiple bounded auth-account batches');
    assert.equal(initial.scheduledEvents, eventCount);
    assert.equal(initial.optimizerEvidence, eventCount);
    assert.equal(initial.caseState, caseCount);
    assert.equal(initial.encounters, caseCount);
    assert.equal(initial.freeReceipts, freeReceiptCount);
    assert.ok(initial.monthlyBuckets > 0);

    const direct = await fetchJson(baseUrl, '/direct-delete');
    assert.equal(direct.blocked, true, 'mature direct user cascade must be blocked');

    const begun = await fetchJson(baseUrl, '/begin');
    assert.equal(begun.status.banned, true);
    assert.equal(begun.status.phase, 'auth_sessions');
    assert.equal(begun.status.sessions, sessionCount, 'begin must not perform an unbounded Better Auth session delete');
    assert.equal(begun.status.accounts, accountCount, 'begin must not perform an unbounded Better Auth account delete');

    const steps = [];
    let latest = begun.status;
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
      const step = await fetchJson(baseUrl, '/advance');
      steps.push({ phase: step.result.phase, rowsDeleted: step.result.rowsDeleted });
      assert.ok(step.result.rowsDeleted <= deletionBatchSize, `D1 step exceeded ${deletionBatchSize} rows`);
      latest = step.status;
      ready = step.result.readyForIdentityDelete;
    }
    assert.equal(ready, true, `D1 staged deletion did not become identity-ready; phase=${latest.phase}`);
    assert.deepEqual(steps.slice(0, 3), [
      { phase: 'auth_sessions', rowsDeleted: 1000 },
      { phase: 'auth_sessions', rowsDeleted: 1000 },
      { phase: 'auth_verifications', rowsDeleted: 500 }
    ], 'D1 must drain 2,500 auth sessions through three bounded staged steps');
    assert.equal(latest.sessions, 0);
    assert.equal(latest.accounts, 0);
    assert.equal(latest.verifications, 0);
    assert.equal(latest.scheduledEvents, 0);
    assert.equal(latest.optimizerEvidence, 0);
    assert.equal(latest.caseState, 0);
    assert.equal(latest.encounters, 0);
    assert.equal(latest.monthlyBuckets, 0);
    assert.equal(latest.freeReceipts, 0);
    assert.equal(latest.activeReviews, 0);

    const final = await fetchJson(baseUrl, '/identity-delete');
    assert.equal(final.userExists, false);
    assert.equal(final.accounts, 0);
    assert.equal(final.sessions, 0);
    assert.equal(final.verifications, 0);
    assert.equal(final.phase, null, 'deletion marker cascades with the Better Auth identity root');

    console.log(JSON.stringify({
      runtime: 'workerd + local D1 binding',
      compatibilityDate,
      decision: 'staged',
      fixture: {
        caseStateRows: caseCount,
        encounterRows: caseCount,
        scheduledEventRows: eventCount,
        optimizerEvidenceRows: eventCount,
        freeReceiptRows: freeReceiptCount,
        monthlyBucketRows: initial.monthlyBuckets,
        activeReviewQuestions: 256,
        activeReviewAssets: 64,
        authSessions: sessionCount,
        authAccounts: accountCount,
        authVerifications: initial.verifications
      },
      directCascadeBlocked: direct.blocked,
      accessRevokedBeforeCleanup: begun.status.banned && begun.status.phase === 'auth_sessions' && begun.status.sessions === sessionCount,
      stagedSteps: steps.length,
      maximumRowsDeletedPerStep: Math.max(...steps.map((step) => step.rowsDeleted)),
      identityDeleteResidual: {
        userExists: final.userExists,
        accounts: final.accounts,
        sessions: final.sessions,
        verifications: final.verifications
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
  console.error(`Learner account deletion D1 smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
