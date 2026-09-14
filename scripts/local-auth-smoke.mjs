import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from 'better-auth/crypto';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const baseURL = 'http://127.0.0.1:8787';
const stateDir = '.wrangler/auth-smoke';
const seedFile = `${stateDir}/seed-auth-smoke.sql`;
const email = 'local-smoke-admin@example.test';
const password = 'LocalSmokePassword123!';
const newPassword = 'LocalSmokePassword456!';
const userId = '00000000-0000-4000-8000-000000000001';
const accountId = '00000000-0000-4000-8000-000000000002';
const validResetToken = 'local-smoke-valid-reset-token';
const expiredResetToken = 'local-smoke-expired-reset-token';
const previewResetToken = 'local-smoke-preview-reset-token';
const validVerificationId = '00000000-0000-4000-8000-000000000003';
const expiredVerificationId = '00000000-0000-4000-8000-000000000004';
const previewVerificationId = '00000000-0000-4000-8000-000000000005';
const secret = 'local-auth-smoke-secret-32-characters-minimum';

function runWrangler(args) {
  execFileSync(process.execPath, [wranglerCli, ...args], { stdio: 'inherit' });
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function waitForServer(processHandle, logs) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error(`wrangler dev exited before becoming ready.\n${logs.join('')}`);
    }
    try {
      const response = await fetch(`${baseURL}/`);
      if (response.status === 200) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`wrangler dev did not become ready.\n${logs.join('')}`);
}

function cookieHeader(response) {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const fallback = response.headers.get('set-cookie');
  const cookies = setCookies.length > 0 ? setCookies : fallback ? [fallback] : [];
  return cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

function stopWorker(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) return;
  if (process.platform === 'win32') {
    processHandle.kill('SIGTERM');
    return;
  }
  try {
    process.kill(-processHandle.pid, 'SIGTERM');
  } catch {
    processHandle.kill('SIGTERM');
  }
}

/** @param {{ processHandle: import('node:child_process').ChildProcess; logs: string[] } | null} worker */
async function stopAndWait(worker) {
  if (!worker) return;
  const { processHandle } = worker;
  if (processHandle.exitCode === null) {
    stopWorker(processHandle);
    await new Promise((resolve) => processHandle.once('exit', resolve));
  }
  processHandle.stdout?.destroy();
  processHandle.stderr?.destroy();
  processHandle.unref();
}

function startWorker(previewMode = false) {
  const logs = [];
  const args = [
    'dev',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    '8787',
    '--persist-to',
    stateDir,
    '--var',
    `BETTER_AUTH_SECRET:${secret}`,
    '--var',
    `BETTER_AUTH_URL:${baseURL}`,
    '--var',
    'RESEND_API_KEY:',
    '--var',
    'AUTH_EMAIL_FROM:',
    '--show-interactive-dev-session',
    'false'
  ];
  if (previewMode) args.push('--var', 'PREVIEW_MODE:true');

  const processHandle = spawn(process.execPath, [wranglerCli, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  });
  processHandle.stdout.on('data', (chunk) => logs.push(chunk.toString()));
  processHandle.stderr.on('data', (chunk) => logs.push(chunk.toString()));
  return { processHandle, logs };
}

/** @param {Response} response */
async function responseBody(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

rmSync(stateDir, { recursive: true, force: true });
mkdirSync(stateDir, { recursive: true });

runWrangler(['--version']);
runWrangler(['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', stateDir]);

const passwordHash = await hashPassword(password);
const now = Date.now();
writeFileSync(
  seedFile,
  [
    'PRAGMA foreign_keys = ON;',
    `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`, \`role\`, \`banned\`) VALUES (${sqlString(userId)}, 'Local Smoke Admin', ${sqlString(email)}, 1, ${now}, ${now}, 'admin', 0);`,
    `INSERT INTO \`account\` (\`id\`, \`accountId\`, \`providerId\`, \`userId\`, \`password\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(accountId)}, ${sqlString(userId)}, 'credential', ${sqlString(userId)}, ${sqlString(passwordHash)}, ${now}, ${now});`,
    `INSERT INTO \`verification\` (\`id\`, \`identifier\`, \`value\`, \`expiresAt\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(validVerificationId)}, ${sqlString(`reset-password:${validResetToken}`)}, ${sqlString(userId)}, ${sqlString(new Date(now + 60 * 60 * 1000).toISOString())}, ${now}, ${now});`,
    `INSERT INTO \`verification\` (\`id\`, \`identifier\`, \`value\`, \`expiresAt\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(expiredVerificationId)}, ${sqlString(`reset-password:${expiredResetToken}`)}, ${sqlString(userId)}, ${sqlString(new Date(now - 1000).toISOString())}, ${now}, ${now});`
  ].join('\n')
);
runWrangler(['d1', 'execute', 'DB', '--local', '--persist-to', stateDir, '--file', seedFile]);

let worker = null;

try {
  worker = startWorker();
  await waitForServer(worker.processHandle, worker.logs);

  const signInPage = await fetch(`${baseURL}/sign-in`, { redirect: 'manual' });
  assert.equal(signInPage.status, 200);
  const forgotPasswordPage = await fetch(`${baseURL}/forgot-password`, { redirect: 'manual' });
  assert.equal(forgotPasswordPage.status, 200);
  const resetPasswordPage = await fetch(`${baseURL}/reset-password`, { redirect: 'manual' });
  assert.equal(resetPasswordPage.status, 200);
  assert.doesNotMatch(await resetPasswordPage.text(), /local-smoke-(?:valid|expired|preview)-reset-token/);

  const anonymousStudy = await fetch(`${baseURL}/study`, { redirect: 'manual' });
  assert.equal(anonymousStudy.status, 303);
  assert.match(anonymousStudy.headers.get('location') ?? '', /^\/sign-in\?redirect=/);
  const anonymousAdmin = await fetch(`${baseURL}/admin`, { redirect: 'manual' });
  assert.equal(anonymousAdmin.status, 303);
  assert.match(anonymousAdmin.headers.get('location') ?? '', /^\/sign-in\?redirect=/);

  const disabledSignUp = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ name: 'Should Not Exist', email: 'blocked-signup@example.test', password })
  });
  assert.equal(disabledSignUp.status, 400);
  assert.match(await disabledSignUp.text(), /EMAIL_PASSWORD_SIGN_UP_DISABLED/);

  async function requestPasswordReset(emailAddress, ip) {
    const response = await fetch(`${baseURL}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseURL, 'cf-connecting-ip': ip },
      body: JSON.stringify({ email: emailAddress })
    });
    return { status: response.status, body: await responseBody(response) };
  }

  const existingResetRequest = await requestPasswordReset(email, '198.51.100.21');
  const unknownResetRequest = await requestPasswordReset('unknown-user@example.test', '198.51.100.22');
  assert.equal(existingResetRequest.status, 200);
  assert.equal(unknownResetRequest.status, 200);
  assert.deepEqual(existingResetRequest.body, unknownResetRequest.body);

  const forgotFormRequest = await fetch(`${baseURL}/forgot-password`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: baseURL,
      'cf-connecting-ip': '198.51.100.23'
    },
    body: new URLSearchParams({ email: 'unknown-form@example.test' })
  });
  assert.equal(forgotFormRequest.status, 200);
  assert.match(await forgotFormRequest.text(), /If an account exists for that email address/);

  async function requestForgotPassword(emailAddress, ip) {
    const response = await fetch(`${baseURL}/forgot-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: baseURL,
        'cf-connecting-ip': ip
      },
      body: new URLSearchParams({ email: emailAddress })
    });
    return { status: response.status, body: await response.text() };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const allowed = await requestForgotPassword(`form-guard-${attempt}@example.test`, '198.51.100.25');
    assert.equal(allowed.status, 200);
    assert.match(allowed.body, /If an account exists for that email address/);
  }
  const blockedForgotForm = await requestForgotPassword('form-guard-blocked@example.test', '198.51.100.25');
  assert.match(blockedForgotForm.body, /Too many password reset requests/);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const allowed = await requestPasswordReset(`guard-${attempt}@example.test`, '198.51.100.24');
    assert.equal(allowed.status, 200);
  }
  const blockedDirectResetRequest = await requestPasswordReset('bypass@example.test', '198.51.100.24');
  assert.equal(blockedDirectResetRequest.status, 429);

  const signIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email, password, rememberMe: false })
  });
  assert.equal(signIn.status, 200, await signIn.text());
  const cookies = cookieHeader(signIn);
  assert.ok(cookies, 'Expected Better Auth to set a session cookie.');

  const session = await fetch(`${baseURL}/api/auth/get-session`, { headers: { cookie: cookies } });
  assert.equal(session.status, 200);
  const sessionBody = await session.json();
  assert.equal(sessionBody?.user?.email, email);
  assert.equal(sessionBody?.user?.role, 'admin');
  const study = await fetch(`${baseURL}/study`, { headers: { cookie: cookies }, redirect: 'manual' });
  assert.equal(study.status, 200);
  const admin = await fetch(`${baseURL}/admin`, { headers: { cookie: cookies }, redirect: 'manual' });
  assert.equal(admin.status, 200);

  const reset = await fetch(`${baseURL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ newPassword, token: validResetToken })
  });
  assert.equal(reset.status, 200, await reset.text());
  const revokedSession = await fetch(`${baseURL}/api/auth/get-session`, { headers: { cookie: cookies } });
  assert.equal(revokedSession.status, 200);
  assert.equal(await revokedSession.json(), null);

  const oldPasswordSignIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email, password, rememberMe: false })
  });
  assert.equal(oldPasswordSignIn.status, 401);
  const newPasswordSignIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email, password: newPassword, rememberMe: false })
  });
  assert.equal(newPasswordSignIn.status, 200, await newPasswordSignIn.text());

  const reusedToken = await fetch(`${baseURL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ newPassword: password, token: validResetToken })
  });
  assert.equal(reusedToken.status, 400);
  assert.match(await reusedToken.text(), /INVALID_TOKEN/);
  const expiredToken = await fetch(`${baseURL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ newPassword: password, token: expiredResetToken })
  });
  assert.equal(expiredToken.status, 400);
  assert.match(await expiredToken.text(), /INVALID_TOKEN/);
  const missingToken = await fetch(`${baseURL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ newPassword: password })
  });
  assert.equal(missingToken.status, 400);
  assert.match(await missingToken.text(), /INVALID_TOKEN/);

  await stopAndWait(worker);
  worker = null;

  const previewSeedFile = `${stateDir}/seed-preview-reset.sql`;
  const previewNow = Date.now();
  writeFileSync(
    previewSeedFile,
    `INSERT INTO \`verification\` (\`id\`, \`identifier\`, \`value\`, \`expiresAt\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(previewVerificationId)}, ${sqlString(`reset-password:${previewResetToken}`)}, ${sqlString(userId)}, ${sqlString(new Date(previewNow + 60 * 60 * 1000).toISOString())}, ${previewNow}, ${previewNow});`
  );
  runWrangler(['d1', 'execute', 'DB', '--local', '--persist-to', stateDir, '--file', previewSeedFile]);

  worker = startWorker(true);
  await waitForServer(worker.processHandle, worker.logs);
  for (const path of ['/forgot-password', '/reset-password']) {
    const response = await fetch(`${baseURL}${path}`, { redirect: 'manual' });
    assert.equal(response.status, 403);
  }
  const previewResetRequest = await fetch(`${baseURL}/api/auth/request-password-reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email })
  });
  assert.equal(previewResetRequest.status, 403);
  const previewResetMutation = await fetch(`${baseURL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ newPassword: password, token: previewResetToken })
  });
  assert.equal(previewResetMutation.status, 403);
  const previewResetCallback = await fetch(
    `${baseURL}/api/auth/reset-password/${previewResetToken}?callbackURL=%2Freset-password`,
    { redirect: 'manual' }
  );
  assert.equal(previewResetCallback.status, 403);

  const previewSignIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email, password: newPassword, rememberMe: false })
  });
  assert.equal(previewSignIn.status, 200, await previewSignIn.text());
  const previewCookies = cookieHeader(previewSignIn);
  assert.ok(previewCookies);
  const previewSession = await fetch(`${baseURL}/api/auth/get-session`, { headers: { cookie: previewCookies } });
  assert.equal(previewSession.status, 200);
  assert.equal((await previewSession.json())?.user?.email, email);
  const previewSignOut = await fetch(`${baseURL}/api/auth/sign-out`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL, cookie: previewCookies },
    body: '{}'
  });
  assert.equal(previewSignOut.status, 200);
  const previewSessionAfterSignOut = await fetch(`${baseURL}/api/auth/get-session`, {
    headers: { cookie: previewCookies }
  });
  assert.equal(previewSessionAfterSignOut.status, 200);
  assert.equal(await previewSessionAfterSignOut.json(), null);

  await stopAndWait(worker);
  worker = null;
  worker = startWorker();
  await waitForServer(worker.processHandle, worker.logs);
  const resetAfterPreview = await fetch(`${baseURL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ newPassword: password, token: previewResetToken })
  });
  assert.equal(resetAfterPreview.status, 200, await resetAfterPreview.text());

  console.log('Local D1 + Better Auth password-recovery and Preview-boundary smoke test passed.');
} catch (error) {
  if (worker) console.error(worker.logs.join(''));
  throw error;
} finally {
  await stopAndWait(worker);
}
