import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { betterAuth } from 'better-auth';
import { hashPassword } from 'better-auth/crypto';
import { admin } from 'better-auth/plugins';

import { applyCurrentSchema } from './current-schema.js';
import {
  PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS,
  buildApplicationPasswordResetUrl,
  renderPasswordResetEmail
} from '../src/lib/server/email/password-reset.ts';
import { EmailDeliveryError } from '../src/lib/server/email/transactional.ts';
import { sendTransactionalEmail } from '../src/lib/server/email/resend.ts';

const baseURL = 'http://localhost:4173';
const secret = 'password-recovery-test-secret-that-is-long-enough';

function createDatabase() {
  const db = new DatabaseSync(':memory:');
  applyCurrentSchema(db);
  return db;
}

/** @param {unknown} value */
function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** @param {import('node:sqlite').DatabaseSync} db @param {{ email?: string; password?: string }} [input] */
async function seedUser(db, { email = 'learner@example.test', password = 'OldPassword123!' } = {}) {
  const userId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const now = Date.now();
  const passwordHash = await hashPassword(password);
  db.exec([
    `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`, \`role\`, \`banned\`) VALUES (${sqlString(userId)}, 'Test Learner', ${sqlString(email)}, 1, ${now}, ${now}, 'user', 0);`,
    `INSERT INTO \`account\` (\`id\`, \`accountId\`, \`providerId\`, \`userId\`, \`password\`, \`createdAt\`, \`updatedAt\`) VALUES (${sqlString(accountId)}, ${sqlString(userId)}, 'credential', ${sqlString(userId)}, ${sqlString(passwordHash)}, ${now}, ${now});`
  ].join('\n'));
  return { userId, email, password };
}

/** @param {string} path @param {Record<string, unknown>} body @param {Record<string, string>} [headers] */
function authRequest(path, body, headers = {}) {
  return new Request(`${baseURL}/api/auth${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: baseURL,
      ...headers
    },
    body: JSON.stringify(body)
  });
}

test('Better Auth 1.6.25 reset request returns before a pending provider task and keeps the public result generic', async () => {
  const db = createDatabase();
  await seedUser(db);

  /** @type {(reason?: unknown) => void} */
  let rejectProvider = () => {};
  const providerPending = new Promise((_, reject) => {
    rejectProvider = reject;
  });
  /** @type {Promise<unknown>[]} */
  const scheduledTasks = [];
  let providerFailed = false;

  const auth = betterAuth({
    database: db,
    baseURL,
    secret,
    rateLimit: { enabled: false },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      sendResetPassword: async () => {
        try {
          await providerPending;
        } catch {
          providerFailed = true;
        }
      }
    },
    advanced: {
      database: { generateId: 'uuid' },
      backgroundTasks: { handler: (task) => scheduledTasks.push(task) }
    },
    plugins: [admin()]
  });

  const knownResponse = await Promise.race([
    auth.handler(authRequest('/request-password-reset', { email: 'learner@example.test' })),
    new Promise((_, reject) => setTimeout(() => reject(new Error('reset request awaited provider')), 250))
  ]);
  const unknownResponse = await auth.handler(
    authRequest('/request-password-reset', { email: 'unknown@example.test' })
  );

  assert.equal(knownResponse.status, 200);
  assert.equal(unknownResponse.status, 200);
  assert.deepEqual(await knownResponse.json(), await unknownResponse.json());
  assert.equal(scheduledTasks.length, 1);

  rejectProvider(new Error('controlled provider failure'));
  await scheduledTasks[0];
  assert.equal(providerFailed, true);
  assert.equal(knownResponse.status, 200);
});

test('reset email composition keeps the token in a fragment and the provider boundary server-only', async () => {
  const resetUrl = buildApplicationPasswordResetUrl(
    `${baseURL}/reset-password/internal-token?callbackURL=%2Fignored`,
    'better-auth-reset-token'
  );
  const parsed = new URL(resetUrl);
  assert.equal(parsed.pathname, '/reset-password');
  assert.equal(parsed.search, '');
  assert.equal(new URLSearchParams(parsed.hash.slice(1)).get('token'), 'better-auth-reset-token');
  assert.equal(PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS, 60 * 60);

  const message = renderPasswordResetEmail(resetUrl);
  assert.match(message.subject, /Reset your Flash-Cards password/);
  assert.match(message.text, /expires in 1 hour/i);
  assert.match(message.text, /ignore this email/i);
  assert.match(message.html ?? '', /#token=better-auth-reset-token/);

  /** @type {{ url: string; init: RequestInit | undefined }[]} */
  const requests = [];
  await sendTransactionalEmail(
    { RESEND_API_KEY: 'test-resend-key', AUTH_EMAIL_FROM: 'Flash-Cards <auth@example.test>' },
    { to: 'learner@example.test', subject: 'Test', text: 'Test body' },
    async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response('{}', { status: 200 });
    }
  );
  const request = requests[0];
  assert.ok(request);
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(new Headers(request.init?.headers).get('authorization'), 'Bearer test-resend-key');

  await assert.rejects(
    () =>
      sendTransactionalEmail(
        { RESEND_API_KEY: 'test-resend-key', AUTH_EMAIL_FROM: 'Flash-Cards <auth@example.test>' },
        { to: 'learner@example.test', subject: 'Test', text: 'Secret reset content' },
        async () => new Response('provider diagnostics', { status: 503 })
      ),
    (error) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, /provider diagnostics|Secret reset content/);
      return true;
    }
  );
});

test('auth and page configuration preserve the security-sensitive implementation shape', async () => {
  const authSource = await readFile(new URL('../src/lib/server/auth.js', import.meta.url), 'utf8');
  const authConfigSource = await readFile(new URL('../src/lib/server/auth-config.js', import.meta.url), 'utf8');
  const hooksSource = await readFile(new URL('../src/hooks.server.js', import.meta.url), 'utf8');
  const forgotServerSource = await readFile(new URL('../src/routes/forgot-password/+page.server.js', import.meta.url), 'utf8');
  const forgotSource = await readFile(new URL('../src/routes/forgot-password/+page.svelte', import.meta.url), 'utf8');
  const resetSource = await readFile(new URL('../src/routes/reset-password/+page.svelte', import.meta.url), 'utf8');

  assert.match(authConfigSource, /disableSignUp/);
  assert.match(authSource, /resetPasswordTokenExpiresIn/);
  assert.match(authSource, /revokeSessionsOnPasswordReset/);
  assert.match(authSource, /waitUntil\(safeTask\)/);
  assert.match(hooksSource, /isPasswordRecoveryPath/);
  assert.match(hooksSource, /isPasswordResetRequestPath/);
  assert.match(forgotServerSource, /If an account exists for that email address, we’ve sent password reset instructions\./);
  assert.doesNotMatch(forgotSource, /email not found|no account exists/i);
  assert.match(resetSource, /window\.location\.hash/);
  assert.match(resetSource, /history\.replaceState/);
  assert.doesNotMatch(resetSource, /window\.location\.search/);
  assert.match(resetSource, /The passwords do not match\./);
});
