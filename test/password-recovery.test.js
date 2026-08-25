import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS,
  buildApplicationPasswordResetUrl,
  renderPasswordResetEmail,
  sendPasswordResetEmail
} from '../src/lib/server/email/password-reset.ts';
import {
  EmailDeliveryError,
  sendTransactionalEmail
} from '../src/lib/server/email/resend.ts';

const testEnv = {
  RESEND_API_KEY: 'test-resend-key-do-not-use',
  AUTH_EMAIL_FROM: 'Flash-Cards <auth@example.test>'
};

test('password reset URLs point at the application route and carry only the Better Auth token', () => {
  const resetUrl = buildApplicationPasswordResetUrl(
    'https://flash-cards.example.test/api/auth/reset-password/internal-token?callbackURL=%2Fignored',
    'better-auth-token'
  );
  const parsed = new URL(resetUrl);

  assert.equal(parsed.origin, 'https://flash-cards.example.test');
  assert.equal(parsed.pathname, '/reset-password');
  assert.equal(parsed.searchParams.get('token'), 'better-auth-token');
  assert.equal(parsed.searchParams.size, 1);
  assert.equal(PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS, 60 * 60);
});

test('password reset email is security-focused and escapes the HTML URL', () => {
  const resetUrl = 'https://flash-cards.example.test/reset-password?token=a&next=<unsafe>';
  const message = renderPasswordResetEmail(resetUrl);

  assert.match(message.subject, /Reset your Flash-Cards password/);
  assert.match(message.text, /expires in 1 hour/i);
  assert.match(message.text, /ignore this email/i);
  assert.match(message.text, /token=a&next=<unsafe>/);
  assert.match(message.html ?? '', /token=a&amp;next=&lt;unsafe&gt;/);
  assert.doesNotMatch(message.text, /marketing|newsletter|promotion/i);
});

test('Resend transport keeps credentials in the Authorization header and supports mocked delivery', async () => {
  let requestUrl = '';
  let requestInit;
  const mockFetch = async (url, init) => {
    requestUrl = String(url);
    requestInit = init;
    return new Response('{}', { status: 200 });
  };

  await sendPasswordResetEmail({
    env: testEnv,
    to: 'learner@example.test',
    betterAuthResetUrl: 'https://flash-cards.example.test/api/auth/reset-password/internal?callbackURL=',
    token: 'single-use-token',
    fetchImpl: mockFetch
  });

  assert.equal(requestUrl, 'https://api.resend.com/emails');
  assert.equal(requestInit?.headers?.authorization, `Bearer ${testEnv.RESEND_API_KEY}`);

  const payload = JSON.parse(String(requestInit?.body));
  assert.equal(payload.from, testEnv.AUTH_EMAIL_FROM);
  assert.deepEqual(payload.to, ['learner@example.test']);
  assert.match(payload.text, /reset-password\?token=single-use-token/);
  assert.doesNotMatch(JSON.stringify(payload), /test-resend-key-do-not-use/);
});

test('Resend failures expose only a safe status-bearing error', async () => {
  const mockFetch = async () => new Response('provider body with sensitive diagnostics', { status: 503 });

  await assert.rejects(
    () =>
      sendTransactionalEmail(
        testEnv,
        {
          to: 'learner@example.test',
          subject: 'Test',
          text: 'Secret reset content'
        },
        mockFetch
      ),
    (error) => {
      assert.ok(error instanceof EmailDeliveryError);
      assert.equal(error.status, 503);
      assert.doesNotMatch(error.message, /provider body|learner@example|Secret reset content/);
      return true;
    }
  );
});

test('auth configuration preserves closed enrollment and enables secure Better Auth reset semantics', async () => {
  const authSource = await readFile(new URL('../src/lib/server/auth.js', import.meta.url), 'utf8');
  const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8');

  assert.match(authSource, /disableSignUp:\s*true/);
  assert.match(authSource, /resetPasswordTokenExpiresIn:\s*PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS/);
  assert.match(authSource, /revokeSessionsOnPasswordReset:\s*true/);
  assert.match(authSource, /backgroundTasks:\s*\{/);
  assert.match(authSource, /waitUntil\(safeTask\)/);
  assert.match(packageSource, /"better-auth":\s*"1\.6\.25"/);
});

test('forgot-password and reset-password pages preserve anti-enumeration and token-rendering contracts', async () => {
  const forgotSource = await readFile(
    new URL('../src/routes/forgot-password/+page.svelte', import.meta.url),
    'utf8'
  );
  const resetPageSource = await readFile(
    new URL('../src/routes/reset-password/+page.svelte', import.meta.url),
    'utf8'
  );
  const resetServerSource = await readFile(
    new URL('../src/routes/reset-password/+page.server.js', import.meta.url),
    'utf8'
  );

  assert.match(
    forgotSource,
    /If an account exists for that email address, we’ve sent password reset instructions\./
  );
  assert.doesNotMatch(forgotSource, /email not found|no account exists/i);
  assert.match(forgotSource, /catch\s*\{/);

  assert.match(resetPageSource, /The passwords do not match\./);
  assert.match(resetPageSource, /INVALID_TOKEN/);
  assert.match(resetPageSource, /history\.replaceState/);
  assert.doesNotMatch(resetServerSource, /token|searchParams|url\./i);
});
