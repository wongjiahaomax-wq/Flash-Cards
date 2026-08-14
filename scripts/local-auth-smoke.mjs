import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { hashPassword } from 'better-auth/crypto';

const baseURL = 'http://127.0.0.1:8787';
const stateDir = '.wrangler/auth-smoke';
const seedFile = `${stateDir}/seed-auth-smoke.sql`;
const email = 'local-smoke-admin@example.test';
const password = 'LocalSmokePassword123!';
const userId = '00000000-0000-4000-8000-000000000001';
const accountId = '00000000-0000-4000-8000-000000000002';
const secret = 'local-auth-smoke-secret-32-characters-minimum';

function run(command, args) {
  execFileSync(command, args, { stdio: 'inherit' });
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

rmSync(stateDir, { recursive: true, force: true });
mkdirSync(stateDir, { recursive: true });

run('npx', [
  'wrangler',
  'd1',
  'migrations',
  'apply',
  'DB',
  '--local',
  '--persist-to',
  stateDir
]);

const passwordHash = await hashPassword(password);
const now = Date.now();
writeFileSync(
  seedFile,
  [
    'PRAGMA foreign_keys = ON;',
    `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`, \`role\`, \`banned\`) VALUES (${sqlString(userId)}, 'Local Smoke Admin', ${sqlString(email)}, 1, ${now}, ${now}, 'admin', 0);`,
    `INSERT INTO \`account\` (\`id\`, \`accountId\`, \`providerId\`, \`userId\`, \`password\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(accountId)}, ${sqlString(userId)}, 'credential', ${sqlString(userId)}, ${sqlString(passwordHash)}, ${now}, ${now});`
  ].join('\n')
);

run('npx', [
  'wrangler',
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
  'npx',
  [
    'wrangler',
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
  { stdio: ['ignore', 'pipe', 'pipe'] }
);

worker.stdout.on('data', (chunk) => logs.push(chunk.toString()));
worker.stderr.on('data', (chunk) => logs.push(chunk.toString()));

try {
  await waitForServer(worker, logs);

  const signInPage = await fetch(`${baseURL}/sign-in`, { redirect: 'manual' });
  assert.equal(signInPage.status, 200);

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

  console.log('Local D1 + Better Auth smoke test passed.');
} catch (error) {
  console.error(logs.join(''));
  throw error;
} finally {
  worker.kill('SIGTERM');
}
