import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearPasswordResetRateLimitForTests,
  consumePasswordResetRequest,
  isPasswordRecoveryPath,
  isPasswordResetRequestPath,
  passwordResetRateLimitResponse
} from '../src/lib/server/password-reset-guard.ts';

/** @param {string} pathname @param {string} [ip] */
function request(pathname, ip = '198.51.100.10') {
  return new Request(`https://flash-cards.example.test${pathname}`, {
    method: 'POST',
    headers: { 'cf-connecting-ip': ip }
  });
}

test.afterEach(() => clearPasswordResetRateLimitForTests());

test('password recovery path coverage includes the pinned Better Auth reset endpoints but not ordinary auth', () => {
  for (const path of [
    '/forgot-password',
    '/forgot-password/',
    '/reset-password',
    '/api/auth/request-password-reset',
    '/api/auth/request-password-reset/',
    '/api/auth/reset-password',
    '/api/auth/reset-password/token-from-email'
  ]) {
    assert.equal(isPasswordRecoveryPath(path), true, path);
  }

  assert.equal(isPasswordResetRequestPath('/forgot-password'), true);
  assert.equal(isPasswordResetRequestPath('/api/auth/request-password-reset/'), true);
  assert.equal(isPasswordResetRequestPath('/api/auth/reset-password'), false);
  assert.equal(isPasswordRecoveryPath('/api/auth/sign-in/email'), false);
  assert.equal(isPasswordRecoveryPath('/api/auth/sign-out'), false);
  assert.equal(isPasswordRecoveryPath('/api/auth/get-session'), false);
});

test('focused reset guard is path-agnostic and does not key on submitted email', () => {
  const firstPath = request('/forgot-password');
  const directBetterAuthPath = request('/api/auth/request-password-reset');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal(consumePasswordResetRequest(firstPath, 10_000).allowed, true);
  }
  assert.equal(consumePasswordResetRequest(directBetterAuthPath, 10_000).allowed, false);
  assert.equal(consumePasswordResetRequest(request('/forgot-password', '198.51.100.11'), 10_000).allowed, true);
  assert.equal(consumePasswordResetRequest(firstPath, 70_001).allowed, true);
});

test('rate-limit response is an account-neutral 429', async () => {
  const response = passwordResetRateLimitResponse(42);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '42');
  const body = await response.text();
  assert.match(body, /try again later/i);
  assert.doesNotMatch(body, /email|account|user/i);
});
