// @ts-nocheck
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BETA_EMAIL_SUFFIX,
  betaUsernameFromEmail,
  betaUsernameToEmail,
  isBetaEmail,
  isValidBetaUsername,
  loginIdentifierToEmail,
  normalizeBetaUsername
} from '../src/lib/auth/beta-credentials.js';
import {
  AccountManagementError,
  changeProductionRole,
  createAccount,
  createBetaLearner,
  sendAccountPasswordEmail,
  setBetaLearnerPassword
} from '../src/lib/server/accounts/admin-accounts.ts';

function fakeAuth(initialUsers = []) {
  const users = new Map(initialUsers.map((user) => [user.id, { banned: false, role: 'user', ...user }]));
  const credentials = new Map();
  const calls = [];
  let nextId = 1;

  const api = {
    async getUser({ query }) {
      const user = users.get(query.id);
      if (!user) throw { code: 'USER_NOT_FOUND' };
      return { ...user };
    },
    async createUser({ body }) {
      calls.push({ operation: 'createUser', body: { ...body } });
      if ([...users.values()].some((user) => user.email === body.email)) {
        throw { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' };
      }
      const user = {
        id: `new-${nextId++}`,
        name: body.name,
        email: body.email,
        role: body.role ?? 'user',
        banned: false,
        createdAt: new Date('2026-09-15T00:00:00Z')
      };
      users.set(user.id, user);
      if (body.password) credentials.set(user.id, body.password);
      return { user: { ...user } };
    },
    async setUserPassword({ body }) {
      calls.push({ operation: 'setUserPassword', body: { ...body } });
      if (!users.has(body.userId)) throw { code: 'USER_NOT_FOUND' };
      credentials.set(body.userId, body.newPassword);
      return { status: true };
    },
    async setRole({ body }) {
      const user = users.get(body.userId);
      if (!user) throw { code: 'USER_NOT_FOUND' };
      user.role = body.role.join(',');
      return { user: { ...user } };
    },
    async listUsers() {
      return { users: [...users.values()], total: users.size };
    }
  };

  return { auth: { api }, calls, users, credentials };
}

const headers = new Headers({ cookie: 'better-auth.session_token=test' });

test('beta identity helper relaxes length while enforcing Better Auth-compatible characters', () => {
  for (const username of ['a', 'ab', 'a'.repeat(25), 'a-b', '-abc', 'abc-', 'a_b', 'resident_01']) {
    assert.equal(isValidBetaUsername(username), true, username);
  }
  for (const username of ['', '   ', 'a b', 'a@b', 'resident!01', 'resident.01', 'résident01']) {
    assert.equal(isValidBetaUsername(username), false, username);
  }
  assert.equal(normalizeBetaUsername(' Beta-01 '), 'beta-01');
  assert.equal(normalizeBetaUsername(' Resident_01 '), 'resident_01');
  assert.throws(() => normalizeBetaUsername(' '));
  assert.throws(() => normalizeBetaUsername('resident!01'));
  assert.equal(betaUsernameToEmail('Beta-01'), `beta-01${BETA_EMAIL_SUFFIX}`);
  assert.equal(betaUsernameFromEmail('BETA-01@BETA.INVALID'), 'beta-01');
  assert.equal(betaUsernameFromEmail('learner@example.test'), null);
  assert.equal(isBetaEmail('beta-01@beta.invalid'), true);
  assert.equal(isBetaEmail('beta-01@beta.invalid.example.test'), false);
  assert.equal(loginIdentifierToEmail('beta-01'), 'beta-01@beta.invalid');
  assert.equal(loginIdentifierToEmail('Learner@Example.Test'), 'learner@example.test');
});

test('dedicated beta creation creates a Learner credential without email delivery', async () => {
  const fixture = fakeAuth();
  const result = await createBetaLearner({
    auth: fixture.auth,
    headers,
    name: 'Beta Learner',
    username: 'Beta01',
    password: 'BetaPassword123!'
  });

  assert.equal(result.account.betaUsername, 'beta01');
  assert.equal(result.account.accountType, 'Learner');
  assert.equal(fixture.credentials.get(result.account.id), 'BetaPassword123!');
  assert.deepEqual(fixture.calls[0], {
    operation: 'createUser',
    body: {
      name: 'Beta Learner',
      email: 'beta01@beta.invalid',
      password: 'BetaPassword123!',
      role: 'user'
    }
  });
});

test('beta username input rejects Better Auth-incompatible values before identity creation', async () => {
  const fixture = fakeAuth();
  for (const username of ['', '   ', 'a b', 'a@b', 'resident!01', 'resident.01', 'résident01']) {
    await assert.rejects(
      () => createBetaLearner({ auth: fixture.auth, headers, name: 'Invalid', username, password: 'Password123!' }),
      (error) => error instanceof AccountManagementError && error.code === 'INVALID_INPUT'
    );
  }
  assert.equal(fixture.calls.length, 0);

  for (const username of ['a', 'a'.repeat(25), '-abc', 'abc-', 'a_b']) {
    await createBetaLearner({ auth: fixture.auth, headers, name: 'Accepted', username, password: 'Password123!' });
  }
  assert.equal(fixture.calls.length, 5);

  await createBetaLearner({
    auth: fixture.auth,
    headers,
    name: 'Existing',
    username: 'beta01',
    password: 'Password123!'
  });
  await assert.rejects(
    () => createBetaLearner({ auth: fixture.auth, headers, name: 'Duplicate', username: 'BETA01', password: 'Password123!' }),
    (error) => error instanceof AccountManagementError && error.code === 'BETA_USERNAME_TAKEN'
  );
});

test('standard accounts reserve beta.invalid for the dedicated Learner flow', async () => {
  const fixture = fakeAuth();
  for (const accountType of ['learner', 'administrator']) {
    await assert.rejects(
      () => createAccount({
        auth: fixture.auth,
        headers,
        name: 'Reserved',
        email: `${accountType}@beta.invalid`,
        accountType,
        sendPasswordEmail: async () => {
          throw new Error('must not send');
        }
      }),
      (error) => error instanceof AccountManagementError && error.code === 'BETA_NAMESPACE_RESERVED'
    );
  }
  assert.equal(fixture.users.size, 0);
  assert.equal(fixture.calls.length, 0);
});

test('beta password and role restrictions remain server-side', async () => {
  const fixture = fakeAuth([
    { id: 'actor', name: 'Actor', email: 'actor@example.test', role: 'admin' },
    { id: 'beta', name: 'Beta', email: 'beta01@beta.invalid', role: 'user' },
    { id: 'real', name: 'Real', email: 'real@example.test', role: 'user' }
  ]);

  await assert.rejects(
    () => changeProductionRole({ auth: fixture.auth, headers, actorUserId: 'actor', userId: 'beta', accountType: 'administrator' }),
    (error) => error instanceof AccountManagementError && error.code === 'BETA_ADMIN_BLOCKED'
  );
  await assert.rejects(
    () => sendAccountPasswordEmail({
      auth: fixture.auth,
      headers,
      userId: 'beta',
      purpose: 'reset',
      sendPasswordEmail: async () => {
        throw new Error('must not send');
      }
    }),
    (error) => error instanceof AccountManagementError && error.code === 'BETA_PASSWORD_EMAIL_BLOCKED'
  );

  await setBetaLearnerPassword({
    auth: fixture.auth,
    headers,
    userId: 'beta',
    password: 'Replacement123!'
  });
  assert.equal(fixture.credentials.get('beta'), 'Replacement123!');
  await assert.rejects(
    () => setBetaLearnerPassword({ auth: fixture.auth, headers, userId: 'real', password: 'Replacement123!' }),
    (error) => error instanceof AccountManagementError && error.code === 'BETA_ACCOUNT_REQUIRED'
  );
});

test('reachable beta recovery and account actions contain the reserved-namespace guards', async () => {
  const hooksSource = await readFile(new URL('../src/hooks.server.js', import.meta.url), 'utf8');
  const forgotSource = await readFile(new URL('../src/routes/forgot-password/+page.server.js', import.meta.url), 'utf8');
  const listRouteSource = await readFile(new URL('../src/routes/admin/accounts/+page.server.js', import.meta.url), 'utf8');
  const listPageSource = await readFile(new URL('../src/routes/admin/accounts/+page.svelte', import.meta.url), 'utf8');
  const detailRouteSource = await readFile(new URL('../src/routes/admin/accounts/[userId]/+page.server.js', import.meta.url), 'utf8');
  const signInSource = await readFile(new URL('../src/routes/sign-in/+page.svelte', import.meta.url), 'utf8');

  assert.match(hooksSource, /isBetaPasswordResetRequest/);
  assert.match(hooksSource, /genericPasswordResetResponse/);
  assert.match(forgotSource, /!isBetaEmail\(email\)/);
  assert.match(listRouteSource, /createBetaLearner/);
  assert.match(listPageSource, /Letters, numbers, - and _\. No spaces or @\. It will be converted to lowercase\./);
  assert.match(listPageSource, /8–128 characters\./);
  assert.match(listPageSource, /No email is sent\. Give the learner their beta username and initial password privately\. This creates a Learner account only\./);
  assert.match(detailRouteSource, /setBetaLearnerPassword/);
  assert.match(detailRouteSource, /target\.betaUsername \? 'beta username'/);
  assert.match(signInSource, /loginIdentifierToEmail/);
});
