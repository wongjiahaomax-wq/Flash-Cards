import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from 'better-auth/crypto';

import { extractD1Rows } from './local-replica-lib.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const baseURL = 'http://127.0.0.1:8787';
const stateDir = '.wrangler/auth-smoke';
const seedFile = `${stateDir}/seed-auth-smoke.sql`;
const email = 'local-smoke-admin@example.test';
const password = 'LocalSmokePassword123!';
const newPassword = 'LocalSmokePassword456!';
const createdAccountEmail = 'local-smoke-created@example.test';
const createdAccountPassword = 'LocalSmokePassword789!';
const betaUsername = 'local-beta01';
const betaEmail = `${betaUsername}@beta.invalid`;
const betaPassword = 'LocalBetaPassword123!';
const betaNewPassword = 'LocalBetaPassword456!';
const userId = '00000000-0000-4000-8000-000000000001';
const accountId = '00000000-0000-4000-8000-000000000002';
const targetUserId = '00000000-0000-4000-8000-000000000006';
const targetAccountId = '00000000-0000-4000-8000-000000000007';
const targetSessionId = '00000000-0000-4000-8000-000000000008';
const validResetToken = 'local-smoke-valid-reset-token';
const expiredResetToken = 'local-smoke-expired-reset-token';
const previewResetToken = 'local-smoke-preview-reset-token';
const validVerificationId = '00000000-0000-4000-8000-000000000003';
const expiredVerificationId = '00000000-0000-4000-8000-000000000004';
const previewVerificationId = '00000000-0000-4000-8000-000000000005';
const secret = 'local-auth-smoke-secret-32-characters-minimum';

function runWrangler(args, { capture = false } = {}) {
  if (capture) {
    return execFileSync(process.execPath, [wranglerCli, ...args], {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit']
    });
  }
  execFileSync(process.execPath, [wranglerCli, ...args], { stdio: 'inherit' });
  return '';
}

function queryLocal(sql) {
  return extractD1Rows(
    runWrangler(['d1', 'execute', 'DB', '--local', '--persist-to', stateDir, '--command', sql, '--json'], {
      capture: true
    })
  );
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

function targetState() {
  const user = queryLocal(
    `SELECT \`id\`, \`role\`, coalesce(\`banned\`, 0) AS \`banned\` FROM \`user\` WHERE \`id\` = ${sqlString(targetUserId)}`
  );
  const accounts = queryLocal(
    `SELECT count(*) AS \`count\` FROM \`account\` WHERE \`userId\` = ${sqlString(targetUserId)}`
  );
  const sessions = queryLocal(
    `SELECT count(*) AS \`count\` FROM \`session\` WHERE \`userId\` = ${sqlString(targetUserId)}`
  );
  return {
    user: user[0] ?? null,
    accounts: Number(accounts[0]?.count ?? 0),
    sessions: Number(sessions[0]?.count ?? 0)
  };
}

function betaState() {
  const user = queryLocal(
    `SELECT \`id\`, \`role\`, coalesce(\`banned\`, 0) AS \`banned\` FROM \`user\` WHERE \`email\` = ${sqlString(betaEmail)}`
  );
  const accounts = queryLocal(
    `SELECT \`password\` FROM \`account\` WHERE \`userId\` = (SELECT \`id\` FROM \`user\` WHERE \`email\` = ${sqlString(betaEmail)}) AND \`providerId\` = 'credential'`
  );
  return {
    user: user[0] ?? null,
    credential: accounts[0]?.password ?? null
  };
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
    `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`, \`role\`, \`banned\`) VALUES (${sqlString(targetUserId)}, 'Local Smoke Target', 'local-smoke-target@example.test', 1, ${now}, ${now}, 'user', 0);`,
    `INSERT INTO \`account\` (\`id\`, \`accountId\`, \`providerId\`, \`userId\`, \`password\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(targetAccountId)}, ${sqlString(targetUserId)}, 'credential', ${sqlString(targetUserId)}, ${sqlString(passwordHash)}, ${now}, ${now});`,
    `INSERT INTO \`session\` (\`id\`, \`expiresAt\`, \`token\`, \`createdAt\`, \`updatedAt\`, \`userId\`) VALUES (${sqlString(targetSessionId)}, ${now + 86400000}, 'local-smoke-target-session', ${now}, ${now}, ${sqlString(targetUserId)});`,
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

  for (const accountType of ['learner', 'administrator']) {
    const reservedCreate = await fetch(`${baseURL}/admin/accounts?/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: baseURL,
        'x-sveltekit-action': 'true',
        cookie: cookies
      },
      body: new URLSearchParams({
        name: 'Reserved Beta Namespace',
        email: `${accountType}@beta.invalid`,
        account_type: accountType
      })
    });
    assert.ok([200, 400].includes(reservedCreate.status));
    assert.match(await reservedCreate.text(), /beta\.invalid|reserved|beta learner/i);
  }
  assert.equal(Number(queryLocal(`SELECT count(*) AS \`count\` FROM \`user\` WHERE \`email\` LIKE '%@beta.invalid'`)[0]?.count ?? 0), 0);

  const createBeta = await fetch(`${baseURL}/admin/accounts?/createBeta`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: baseURL,
      'x-sveltekit-action': 'true',
      cookie: cookies
    },
    body: new URLSearchParams({
      name: 'Local Smoke Beta Learner',
      beta_username: betaUsername,
      password: betaPassword
    })
  });
  const createBetaBody = await createBeta.text();
  if (createBeta.status === 200) {
    const actionResult = JSON.parse(createBetaBody);
    assert.deepEqual(actionResult, {
      type: 'redirect',
      status: 303,
      location: actionResult.location
    });
  } else {
    assert.equal(createBeta.status, 303, createBetaBody);
  }
  const betaUsers = queryLocal(
    `SELECT \`id\`, \`role\`, coalesce(\`banned\`, 0) AS \`banned\` FROM \`user\` WHERE \`email\` = ${sqlString(betaEmail)}`
  );
  assert.equal(betaUsers.length, 1);
  assert.equal(betaUsers[0].role, 'user');
  const betaUserId = String(betaUsers[0].id);
  assert.equal(betaState().credential !== null, true, 'Beta creation must create a credential account directly.');

  const betaSignIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email: betaEmail, password: betaPassword, rememberMe: false })
  });
  assert.equal(betaSignIn.status, 200, await betaSignIn.text());
  const betaCookies = cookieHeader(betaSignIn);
  const betaSession = await fetch(`${baseURL}/api/auth/get-session`, { headers: { cookie: betaCookies } });
  assert.equal(betaSession.status, 200);
  assert.equal((await betaSession.json())?.user?.email, betaEmail);
  await fetch(`${baseURL}/api/auth/sign-out`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL, cookie: betaCookies },
    body: '{}'
  });

  const setBetaPassword = await fetch(`${baseURL}/admin/accounts/${encodeURIComponent(betaUserId)}?/setBetaPassword`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: baseURL,
      'x-sveltekit-action': 'true',
      cookie: cookies
    },
    body: new URLSearchParams({ newPassword: betaNewPassword })
  });
  const setBetaPasswordBody = await setBetaPassword.text();
  if (setBetaPassword.status === 200) {
    const actionResult = JSON.parse(setBetaPasswordBody);
    assert.deepEqual(actionResult, {
      type: 'redirect',
      status: 303,
      location: actionResult.location
    });
  } else {
    assert.equal(setBetaPassword.status, 303, setBetaPasswordBody);
  }

  const oldBetaPasswordSignIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email: betaEmail, password: betaPassword, rememberMe: false })
  });
  assert.equal(oldBetaPasswordSignIn.status, 401);
  const newBetaPasswordSignIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email: betaEmail, password: betaNewPassword, rememberMe: false })
  });
  assert.equal(newBetaPasswordSignIn.status, 200, await newBetaPasswordSignIn.text());
  const newBetaCookies = cookieHeader(newBetaPasswordSignIn);
  await fetch(`${baseURL}/api/auth/sign-out`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL, cookie: newBetaCookies },
    body: '{}'
  });

  const betaStateBeforeAdminPasswordBypass = betaState();
  const directBetaPassword = await fetch(`${baseURL}/api/auth/admin/set-user-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL, cookie: cookies },
    body: JSON.stringify({ userId: betaUserId, newPassword: 'DirectBypassPassword123!' })
  });
  assert.equal(directBetaPassword.status, 403);
  await directBetaPassword.text();
  assert.deepEqual(betaState(), betaStateBeforeAdminPasswordBypass);

  const betaVerificationCount = () => Number(queryLocal(
    `SELECT count(*) AS \`count\` FROM \`verification\` WHERE \`value\` = ${sqlString(betaUserId)} AND \`identifier\` LIKE 'reset-password:%'`
  )[0]?.count ?? 0);
  const betaVerificationBefore = betaVerificationCount();
  const betaDirectReset = await requestPasswordReset(betaEmail, '198.51.100.27');
  const betaUnknownReset = await requestPasswordReset('unknown-beta@example.test', '198.51.100.29');
  assert.equal(betaDirectReset.status, 200);
  assert.equal(betaDirectReset.body.status, true);
  assert.equal(betaUnknownReset.status, 200);
  assert.equal(betaUnknownReset.body.status, true);
  const betaForgotReset = await requestForgotPassword(betaEmail, '198.51.100.28');
  assert.equal(betaForgotReset.status, 200);
  assert.match(betaForgotReset.body, /If an account exists for that email address/);
  assert.equal(betaVerificationCount(), betaVerificationBefore);

  const createManagedAccount = await fetch(`${baseURL}/admin/accounts?/create`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: baseURL,
      'x-sveltekit-action': 'true',
      cookie: cookies
    },
    body: new URLSearchParams({
      name: 'Local Smoke Created Learner',
      email: createdAccountEmail,
      account_type: 'learner'
    })
  });
  const createManagedAccountBody = await createManagedAccount.text();
  if (createManagedAccount.status === 200) {
    const actionResult = JSON.parse(createManagedAccountBody);
    assert.deepEqual(actionResult, {
      type: 'redirect',
      status: 303,
      location: actionResult.location
    });
  } else {
    assert.equal(createManagedAccount.status, 303, createManagedAccountBody);
  }
  const createdUsers = queryLocal(
    `SELECT \`id\`, \`role\`, coalesce(\`banned\`, 0) AS \`banned\` FROM \`user\` WHERE \`email\` = ${sqlString(createdAccountEmail)}`
  );
  assert.equal(createdUsers.length, 1);
  assert.equal(createdUsers[0].role, 'user');
  assert.equal(Number(createdUsers[0].banned), 0);
  const createdUserId = String(createdUsers[0].id);
  const createdAccountsBeforePassword = queryLocal(
    `SELECT count(*) AS \`count\` FROM \`account\` WHERE \`userId\` = ${sqlString(createdUserId)}`
  );
  assert.equal(Number(createdAccountsBeforePassword[0]?.count ?? 0), 0, 'Admin creation must not create a temporary credential.');

  const createdResetRequest = await requestPasswordReset(createdAccountEmail, '198.51.100.26');
  assert.equal(createdResetRequest.status, 200);
  const createdVerification = queryLocal(
    `SELECT \`identifier\` FROM \`verification\` WHERE \`value\` = ${sqlString(createdUserId)} AND \`identifier\` LIKE 'reset-password:%' ORDER BY \`createdAt\` DESC LIMIT 1`
  );
  const createdResetIdentifier = String(createdVerification[0]?.identifier ?? '');
  assert.match(createdResetIdentifier, /^reset-password:.+/);
  const createdResetToken = createdResetIdentifier.slice('reset-password:'.length);
  const createdReset = await fetch(`${baseURL}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ newPassword: createdAccountPassword, token: createdResetToken })
  });
  assert.equal(createdReset.status, 200, await createdReset.text());
  const createdSignIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL },
    body: JSON.stringify({ email: createdAccountEmail, password: createdAccountPassword, rememberMe: false })
  });
  assert.equal(createdSignIn.status, 200, await createdSignIn.text());
  const createdCookies = cookieHeader(createdSignIn);
  const createdSession = await fetch(`${baseURL}/api/auth/get-session`, { headers: { cookie: createdCookies } });
  assert.equal(createdSession.status, 200);
  assert.equal((await createdSession.json())?.user?.email, createdAccountEmail);
  const createdSignOut = await fetch(`${baseURL}/api/auth/sign-out`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL, cookie: createdCookies },
    body: '{}'
  });
  assert.equal(createdSignOut.status, 200);

  const targetBeforeAdminApi = targetState();
  for (const [endpoint, body] of [
    ['create-user', { name: 'Direct Bypass', email: 'direct-bypass@example.test', role: 'admin', password }],
    ['set-role', { userId: targetUserId, role: 'admin' }],
    ['remove-user', { userId: targetUserId }]
  ]) {
    const response = await fetch(`${baseURL}/api/auth/admin/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseURL, cookie: cookies },
      body: JSON.stringify(body)
    });
    assert.equal(response.status, 403, `Direct Better Auth Admin ${endpoint} must be blocked before the plugin handles it.`);
    await response.text();
  }
  assert.deepEqual(targetState(), targetBeforeAdminApi, 'Blocked Better Auth Admin requests must not mutate local D1 state.');
  const sessionAfterAdminApiBlock = await fetch(`${baseURL}/api/auth/get-session`, { headers: { cookie: cookies } });
  assert.equal(sessionAfterAdminApiBlock.status, 200);
  assert.equal((await sessionAfterAdminApiBlock.json())?.user?.email, email);

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
  const newPasswordCookies = cookieHeader(newPasswordSignIn);
  const signOut = await fetch(`${baseURL}/api/auth/sign-out`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: baseURL, cookie: newPasswordCookies },
    body: '{}'
  });
  assert.equal(signOut.status, 200);
  const sessionAfterSignOut = await fetch(`${baseURL}/api/auth/get-session`, {
    headers: { cookie: newPasswordCookies }
  });
  assert.equal(sessionAfterSignOut.status, 200);
  assert.equal(await sessionAfterSignOut.json(), null);

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

  console.log('Local D1 + Better Auth beta-account, password-recovery, and Preview-boundary smoke test passed.');
} catch (error) {
  if (worker) console.error(worker.logs.join(''));
  throw error;
} finally {
  await stopAndWait(worker);
}
