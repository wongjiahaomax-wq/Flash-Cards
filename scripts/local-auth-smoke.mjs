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
const previewEmail = 'local-smoke-preview@example.test';
const previewPassword = 'LocalSmokePreviewPassword123!';
const managedEmail = 'local-smoke-managed@example.test';
const userId = '00000000-0000-4000-8000-000000000001';
const accountId = '00000000-0000-4000-8000-000000000002';
const previewUserId = '00000000-0000-4000-8000-000000000011';
const previewAccountId = '00000000-0000-4000-8000-000000000012';
const validResetToken = 'local-smoke-valid-reset-token';
const expiredResetToken = 'local-smoke-expired-reset-token';
const validVerificationId = '00000000-0000-4000-8000-000000000003';
const expiredVerificationId = '00000000-0000-4000-8000-000000000004';
const secret = 'local-auth-smoke-secret-32-characters-minimum';

function runWrangler(args) {
  execFileSync(process.execPath, [wranglerCli, ...args], {
    stdio: 'inherit'
  });
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
  if (processHandle.exitCode !== null) return;

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

async function requestPasswordReset(emailAddress) {
  const response = await fetch(`${baseURL}/api/auth/request-password-reset`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseURL
    },
    body: JSON.stringify({ email: emailAddress })
  });

  return {
    status: response.status,
    body: await response.json()
  };
}

async function postNamedAction(path, action, cookies) {
  return fetch(`${baseURL}${path}?/${action}`, {
    method: 'POST',
    headers: {
      // Node fetch defaults to Accept: */*, which SvelteKit negotiates to its
      // JSON ActionResult protocol. Use browser-native form semantics here so
      // redirect assertions observe the real HTTP 303 + Location response.
      accept: 'text/html',
      cookie: cookies,
      origin: baseURL
    },
    body: new URLSearchParams(),
    redirect: 'manual'
  });
}

rmSync(stateDir, { recursive: true, force: true });
mkdirSync(stateDir, { recursive: true });

runWrangler(['--version']);

runWrangler([
  'd1',
  'migrations',
  'apply',
  'DB',
  '--local',
  '--persist-to',
  stateDir
]);

const passwordHash = await hashPassword(password);
const previewPasswordHash = await hashPassword(previewPassword);
const now = Date.now();
writeFileSync(
  seedFile,
  [
    'PRAGMA foreign_keys = ON;',
    `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`, \`role\`, \`banned\`) VALUES (${sqlString(userId)}, 'Local Smoke Admin', ${sqlString(email)}, 1, ${now}, ${now}, 'admin', 0);`,
    `INSERT INTO \`account\` (\`id\`, \`accountId\`, \`providerId\`, \`userId\`, \`password\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(accountId)}, ${sqlString(userId)}, 'credential', ${sqlString(userId)}, ${sqlString(passwordHash)}, ${now}, ${now});`,
    `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`, \`role\`, \`banned\`) VALUES (${sqlString(previewUserId)}, 'Local Smoke Preview Admin', ${sqlString(previewEmail)}, 1, ${now}, ${now}, 'preview_admin', 0);`,
    `INSERT INTO \`account\` (\`id\`, \`accountId\`, \`providerId\`, \`userId\`, \`password\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(previewAccountId)}, ${sqlString(previewUserId)}, 'credential', ${sqlString(previewUserId)}, ${sqlString(previewPasswordHash)}, ${now}, ${now});`,
    `INSERT INTO \`verification\` (\`id\`, \`identifier\`, \`value\`, \`expiresAt\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(validVerificationId)}, ${sqlString(`reset-password:${validResetToken}`)}, ${sqlString(userId)}, ${sqlString(new Date(now + 60 * 60 * 1000).toISOString())}, ${now}, ${now});`,
    `INSERT INTO \`verification\` (\`id\`, \`identifier\`, \`value\`, \`expiresAt\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(expiredVerificationId)}, ${sqlString(`reset-password:${expiredResetToken}`)}, ${sqlString(userId)}, ${sqlString(new Date(now - 1000).toISOString())}, ${now}, ${now});`
  ].join('\n')
);

runWrangler([
  'd1',
  'execute',
  'DB',
  '--local',
  '--persist-to',
  stateDir,
  '--file',
  seedFile
]);

const logs = [];
const worker = spawn(
  process.execPath,
  [
    wranglerCli,
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
    '--show-interactive-dev-session',
    'false'
  ],
  {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  }
);

worker.stdout.on('data', (chunk) => logs.push(chunk.toString()));
worker.stderr.on('data', (chunk) => logs.push(chunk.toString()));

try {
  await waitForServer(worker, logs);

  const signInPage = await fetch(`${baseURL}/sign-in`, { redirect: 'manual' });
  assert.equal(signInPage.status, 200);

  const forgotPasswordPage = await fetch(`${baseURL}/forgot-password`, { redirect: 'manual' });
  assert.equal(forgotPasswordPage.status, 200);

  const resetPasswordPage = await fetch(`${baseURL}/reset-password`, { redirect: 'manual' });
  assert.equal(resetPasswordPage.status, 200);
  assert.doesNotMatch(await resetPasswordPage.text(), /local-smoke-(?:valid|expired)-reset-token/);

  const anonymousStudy = await fetch(`${baseURL}/study`, { redirect: 'manual' });
  assert.equal(anonymousStudy.status, 303);
  assert.match(anonymousStudy.headers.get('location') ?? '', /^\/sign-in\?redirect=/);

  const anonymousAdmin = await fetch(`${baseURL}/admin`, { redirect: 'manual' });
  assert.equal(anonymousAdmin.status, 303);
  assert.match(anonymousAdmin.headers.get('location') ?? '', /^\/sign-in\?redirect=/);

  const disabledSignUp = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseURL
    },
    body: JSON.stringify({
      name: 'Should Not Exist',
      email: 'blocked-signup@example.test',
      password
    })
  });
  assert.equal(disabledSignUp.status, 400);
  assert.match(await disabledSignUp.text(), /EMAIL_PASSWORD_SIGN_UP_DISABLED/);

  const existingResetRequest = await requestPasswordReset(email);
  const unknownResetRequest = await requestPasswordReset('unknown-user@example.test');
  assert.equal(existingResetRequest.status, 200);
  assert.equal(unknownResetRequest.status, 200);
  assert.deepEqual(existingResetRequest.body, unknownResetRequest.body);

  const signIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseURL
    },
    body: JSON.stringify({ email, password, rememberMe: false })
  });
  assert.equal(signIn.status, 200, await signIn.text());

  const cookies = cookieHeader(signIn);
  assert.ok(cookies, 'Expected Better Auth to set a session cookie.');

  const session = await fetch(`${baseURL}/api/auth/get-session`, {
    headers: { cookie: cookies }
  });
  assert.equal(session.status, 200);
  const sessionBody = await session.json();
  assert.equal(sessionBody?.user?.email, email);
  assert.equal(sessionBody?.user?.role, 'admin');

  const study = await fetch(`${baseURL}/study`, {
    headers: { cookie: cookies },
    redirect: 'manual'
  });
  assert.equal(study.status, 200);

  const admin = await fetch(`${baseURL}/admin`, {
    headers: { cookie: cookies },
    redirect: 'manual'
  });
  assert.equal(admin.status, 200);

  const accountsPage = await fetch(`${baseURL}/admin/accounts`, {
    headers: { cookie: cookies },
    redirect: 'manual'
  });
  assert.equal(accountsPage.status, 200);

  // Exercise PR B through the actual SvelteKit action and pinned Better Auth
  // Admin plugin. No Resend variables are configured, so user creation must
  // persist while synchronous set-password delivery reports a recoverable
  // failure instead of exposing or manufacturing a temporary password.
  const createManagedAccount = await fetch(`${baseURL}/admin/accounts?/create`, {
    method: 'POST',
    headers: {
      accept: 'text/html',
      cookie: cookies,
      origin: baseURL
    },
    body: new URLSearchParams({
      name: 'Local Smoke Managed Learner',
      email: managedEmail,
      account_type: 'learner'
    }),
    redirect: 'manual'
  });
  assert.equal(createManagedAccount.status, 303, await createManagedAccount.text());
  const createManagedLocation = createManagedAccount.headers.get('location') ?? '';
  assert.match(createManagedLocation, /^\/admin\/accounts\/[^?]+\?status=created-email-failed$/);
  const managedUserId = decodeURIComponent(
    createManagedLocation.match(/^\/admin\/accounts\/([^?]+)/)?.[1] ?? ''
  );
  assert.ok(managedUserId, 'Expected account creation to redirect to the created account.');

  const managedDetail = await fetch(`${baseURL}/admin/accounts/${encodeURIComponent(managedUserId)}`, {
    headers: { cookie: cookies },
    redirect: 'manual'
  });
  assert.equal(managedDetail.status, 200);

  const promoteManaged = await postNamedAction(
    `/admin/accounts/${encodeURIComponent(managedUserId)}`,
    'promote',
    cookies
  );
  assert.equal(promoteManaged.status, 303, await promoteManaged.text());
  assert.match(promoteManaged.headers.get('location') ?? '', /\?status=promoted$/);

  // Better Auth 1.6.25 validates requested roles against configured Admin
  // roles. This direct mutation establishes the retained combined owner shape;
  // the product demotion action must then preserve preview_admin while removing
  // only production Admin authority.
  const combineManagedRoles = await fetch(`${baseURL}/api/auth/admin/set-role`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookies,
      origin: baseURL
    },
    body: JSON.stringify({
      userId: managedUserId,
      role: ['admin', 'preview_admin']
    })
  });
  assert.equal(combineManagedRoles.status, 200, await combineManagedRoles.text());

  const demoteManaged = await postNamedAction(
    `/admin/accounts/${encodeURIComponent(managedUserId)}`,
    'demote',
    cookies
  );
  assert.equal(demoteManaged.status, 303, await demoteManaged.text());
  assert.equal(demoteManaged.headers.get('location'), '/admin/accounts?status=demoted-preview-retained');

  const hiddenPreviewOnlyAccount = await fetch(
    `${baseURL}/admin/accounts?q=${encodeURIComponent(managedEmail)}&field=email`,
    { headers: { cookie: cookies } }
  );
  assert.equal(hiddenPreviewOnlyAccount.status, 200);
  assert.doesNotMatch(
    await hiddenPreviewOnlyAccount.text(),
    new RegExp(`/admin/accounts/${managedUserId.replaceAll('-', '\\-')}`)
  );

  // A retained Preview-only identity may authenticate on the production Worker
  // but must not gain Better Auth Admin or Production Accounts authority merely
  // because preview_admin is now a configured valid role.
  const previewSignIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseURL
    },
    body: JSON.stringify({ email: previewEmail, password: previewPassword, rememberMe: false })
  });
  assert.equal(previewSignIn.status, 200, await previewSignIn.text());
  const previewCookies = cookieHeader(previewSignIn);
  assert.ok(previewCookies, 'Expected Preview-only smoke identity to receive a session cookie.');

  const previewAdminApi = await fetch(`${baseURL}/api/auth/admin/list-users?limit=1`, {
    headers: { cookie: previewCookies, origin: baseURL }
  });
  assert.equal(previewAdminApi.status, 403);

  const previewAccountsPage = await fetch(`${baseURL}/admin/accounts`, {
    headers: { cookie: previewCookies },
    redirect: 'manual'
  });
  assert.equal(previewAccountsPage.status, 303);
  assert.equal(previewAccountsPage.headers.get('location'), '/study');

  const reset = await fetch(`${baseURL}/api/auth/reset-password`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseURL
    },
    body: JSON.stringify({
      newPassword,
      token: validResetToken
    })
  });
  assert.equal(reset.status, 200, await reset.text());

  const revokedSession = await fetch(`${baseURL}/api/auth/get-session`, {
    headers: { cookie: cookies }
  });
  assert.equal(revokedSession.status, 200);
  assert.equal(await revokedSession.json(), null);

  const oldPasswordSignIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseURL
    },
    body: JSON.stringify({ email, password, rememberMe: false })
  });
  assert.equal(oldPasswordSignIn.status, 401);

  const newPasswordSignIn = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseURL
    },
    body: JSON.stringify({ email, password: newPassword, rememberMe: false })
  });
  assert.equal(newPasswordSignIn.status, 200, await newPasswordSignIn.text());

  const reusedToken = await fetch(`${baseURL}/api/auth/reset-password`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseURL
    },
    body: JSON.stringify({
      newPassword: password,
      token: validResetToken
    })
  });
  assert.equal(reusedToken.status, 400);
  assert.match(await reusedToken.text(), /INVALID_TOKEN/);

  const expiredToken = await fetch(`${baseURL}/api/auth/reset-password`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseURL
    },
    body: JSON.stringify({
      newPassword: password,
      token: expiredResetToken
    })
  });
  assert.equal(expiredToken.status, 400);
  assert.match(await expiredToken.text(), /INVALID_TOKEN/);

  console.log('Local D1 + Better Auth smoke test passed.');
} catch (error) {
  console.error(logs.join(''));
  throw error;
} finally {
  stopWorker(worker);
  worker.stdout.destroy();
  worker.stderr.destroy();
  worker.unref();
}
