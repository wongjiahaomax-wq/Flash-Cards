import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AccountManagementError,
  changeProductionRole,
  createAccount,
  disableAccount,
  getAccount,
  listAccounts,
  productionRoleTransition,
  requireProductionAccountManager,
  restoreAccount,
  revokeAccountSessions,
  sendAccountPasswordEmail
} from '../src/lib/server/accounts/admin-accounts.ts';
import { renderSetPasswordEmail } from '../src/lib/server/email/password-reset.ts';

function fakeAuth(initialUsers = []) {
  const users = new Map(initialUsers.map((user) => [user.id, { banned: false, role: 'user', ...user }]));
  const calls = [];
  const sessionCounts = new Map(initialUsers.map((user) => [user.id, user.sessions ?? 1]));
  let nextId = 1;

  const api = {
    async listUsers({ query }) {
      calls.push({ operation: 'listUsers', query });
      let rows = [...users.values()];
      if (query.searchValue) {
        const field = query.searchField ?? 'email';
        const needle = String(query.searchValue).toLowerCase();
        rows = rows.filter((user) => String(user[field] ?? '').toLowerCase().includes(needle));
      }
      if (query.filterField === 'role' && query.filterOperator === 'contains') {
        rows = rows.filter((user) => String(user.role ?? '').includes(String(query.filterValue)));
      }
      const total = rows.length;
      const offset = Number(query.offset ?? 0);
      const limit = Number(query.limit ?? 100);
      return { users: rows.slice(offset, offset + limit), total, limit, offset };
    },
    async getUser({ query }) {
      calls.push({ operation: 'getUser', userId: query.id });
      const user = users.get(query.id);
      if (!user) throw { code: 'USER_NOT_FOUND' };
      return { ...user };
    },
    async createUser({ body }) {
      calls.push({ operation: 'createUser', body: { ...body } });
      if ([...users.values()].some((user) => user.email.toLowerCase() === body.email.toLowerCase())) {
        throw { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL' };
      }
      const user = {
        id: `new-${nextId++}`,
        name: body.name,
        email: body.email.toLowerCase(),
        role: body.role ?? 'user',
        banned: false,
        createdAt: new Date('2026-08-25T00:00:00Z')
      };
      users.set(user.id, user);
      sessionCounts.set(user.id, 0);
      return { user: { ...user } };
    },
    async setRole({ body }) {
      calls.push({ operation: 'setRole', body: { ...body, role: [...body.role] } });
      const user = users.get(body.userId);
      if (!user) throw { code: 'USER_NOT_FOUND' };
      user.role = Array.isArray(body.role) ? body.role.join(',') : body.role;
      return { user: { ...user } };
    },
    async banUser({ body }) {
      calls.push({ operation: 'banUser', body: { ...body } });
      const user = users.get(body.userId);
      if (!user) throw { code: 'USER_NOT_FOUND' };
      user.banned = true;
      sessionCounts.set(user.id, 0);
      return { user: { ...user } };
    },
    async unbanUser({ body }) {
      calls.push({ operation: 'unbanUser', body: { ...body } });
      const user = users.get(body.userId);
      if (!user) throw { code: 'USER_NOT_FOUND' };
      user.banned = false;
      return { user: { ...user } };
    },
    async revokeUserSessions({ body }) {
      calls.push({ operation: 'revokeUserSessions', body: { ...body } });
      sessionCounts.set(body.userId, 0);
      return { success: true };
    }
  };

  return { api, calls, users, sessionCounts };
}

const headers = new Headers({ cookie: 'better-auth.session_token=test' });

test('Production Accounts authority rejects unauthenticated, learner, Preview-only, and Preview Worker access', () => {
  assert.throws(() => requireProductionAccountManager(null, {}), AccountManagementError);
  assert.throws(
    () => requireProductionAccountManager({ id: 'learner', role: 'user' }, {}),
    AccountManagementError
  );
  assert.throws(
    () => requireProductionAccountManager({ id: 'preview', role: 'preview_admin' }, {}),
    AccountManagementError
  );
  assert.throws(
    () => requireProductionAccountManager({ id: 'owner', role: 'admin,preview_admin' }, { PREVIEW_MODE: 'true' }),
    AccountManagementError
  );
  assert.equal(
    requireProductionAccountManager({ id: 'owner', role: 'admin,preview_admin' }, {}),
    'owner'
  );
});

test('production role transitions preserve unrelated roles and remove ordinary user when promoted', () => {
  assert.deepEqual(productionRoleTransition('user', 'administrator'), ['admin']);
  assert.deepEqual(productionRoleTransition('admin', 'learner'), ['user']);
  assert.deepEqual(productionRoleTransition('admin,preview_admin', 'learner'), ['preview_admin']);
  assert.deepEqual(productionRoleTransition('user,author', 'administrator'), ['admin', 'author']);
  assert.deepEqual(productionRoleTransition('admin,author,preview_admin', 'learner'), ['author', 'preview_admin']);
});

test('account listing is bounded, supports name/email search, maps product state, and hides Preview-only identities', async () => {
  const auth = fakeAuth([
    { id: 'a', name: 'Alice', email: 'alice@example.test', role: 'user', createdAt: new Date('2026-01-01') },
    { id: 'b', name: 'Boss', email: 'boss@example.test', role: 'admin,preview_admin', createdAt: new Date('2026-01-02') },
    { id: 'p', name: 'Preview', email: 'preview@example.test', role: 'preview_admin', createdAt: new Date('2026-01-03') }
  ]);

  const result = await listAccounts({ auth, headers, search: 'example.test', searchField: 'email', page: 1 });
  assert.equal(result.pageSize, 25);
  assert.deepEqual(result.accounts.map((account) => account.id).sort(), ['a', 'b']);
  assert.equal(result.accounts.find((account) => account.id === 'b')?.accountType, 'Administrator');
  assert.equal(result.accounts.find((account) => account.id === 'b')?.hasPreviewAccess, true);

  const listCall = auth.calls.find((call) => call.operation === 'listUsers');
  assert.equal(listCall.query.limit, 25);
  assert.equal(listCall.query.offset, 0);
  assert.equal(listCall.query.searchField, 'email');
  assert.equal(listCall.query.searchOperator, 'contains');
});

test('Admin account creation uses Better Auth without any temporary password and requests set-password email', async () => {
  const auth = fakeAuth([]);
  const deliveries = [];
  const result = await createAccount({
    auth,
    headers,
    name: 'New Learner',
    email: 'New.Learner@example.test',
    accountType: 'learner',
    sendPasswordEmail: async (email, purpose) => deliveries.push({ email, purpose })
  });

  assert.equal(result.account.email, 'new.learner@example.test');
  assert.equal(result.account.accountType, 'Learner');
  assert.equal(result.invitationStatus, 'sent');
  assert.deepEqual(deliveries, [{ email: 'new.learner@example.test', purpose: 'account-setup' }]);

  const createCall = auth.calls.find((call) => call.operation === 'createUser');
  assert.equal(Object.hasOwn(createCall.body, 'password'), false);
  assert.equal(createCall.body.role, 'user');
});

test('email delivery failure preserves the created account for safe resend instead of creating a second user', async () => {
  const auth = fakeAuth([]);
  const result = await createAccount({
    auth,
    headers,
    name: 'Email Failure',
    email: 'failure@example.test',
    accountType: 'administrator',
    sendPasswordEmail: async () => {
      throw new Error('provider unavailable');
    }
  });

  assert.equal(result.invitationStatus, 'failed');
  assert.equal(auth.users.size, 1);
  assert.equal(result.account.accountType, 'Administrator');

  await assert.rejects(
    () =>
      createAccount({
        auth,
        headers,
        name: 'Email Failure',
        email: 'failure@example.test',
        accountType: 'administrator',
        sendPasswordEmail: async () => {}
      }),
    (error) => error instanceof AccountManagementError && error.code === 'ACCOUNT_ALREADY_EXISTS'
  );
});

test('combined Admin/Preview role demotion preserves Preview role through Better Auth set-role', async () => {
  const auth = fakeAuth([
    { id: 'actor', name: 'Actor', email: 'actor@example.test', role: 'admin' },
    { id: 'combined', name: 'Combined', email: 'combined@example.test', role: 'admin,preview_admin' }
  ]);

  const updated = await changeProductionRole({
    auth,
    headers,
    actorUserId: 'actor',
    userId: 'combined',
    accountType: 'learner'
  });

  assert.equal(updated, null, 'Preview-only identities leave the Production Accounts read model after demotion');
  assert.equal(auth.users.get('combined').role, 'preview_admin');
  const roleCall = auth.calls.find((call) => call.operation === 'setRole');
  assert.deepEqual(roleCall.body.role, ['preview_admin']);
});

test('self-disable and self-demote fail closed server-side', async () => {
  const auth = fakeAuth([{ id: 'actor', name: 'Actor', email: 'actor@example.test', role: 'admin' }]);

  await assert.rejects(
    () => disableAccount({ auth, headers, actorUserId: 'actor', userId: 'actor' }),
    (error) => error instanceof AccountManagementError && error.code === 'SELF_DISABLE_BLOCKED'
  );
  await assert.rejects(
    () => changeProductionRole({ auth, headers, actorUserId: 'actor', userId: 'actor', accountType: 'learner' }),
    (error) => error instanceof AccountManagementError && error.code === 'SELF_LOCKOUT_BLOCKED'
  );
});

test('last-active-production-Admin removal fails closed when no other active Admin exists', async () => {
  const auth = fakeAuth([
    { id: 'target', name: 'Last Admin', email: 'last@example.test', role: 'admin' },
    { id: 'preview', name: 'Preview', email: 'preview@example.test', role: 'preview_admin' },
    { id: 'disabled-admin', name: 'Disabled', email: 'disabled@example.test', role: 'admin', banned: true }
  ]);

  await assert.rejects(
    () => disableAccount({ auth, headers, actorUserId: 'external-admin-session', userId: 'target' }),
    (error) => error instanceof AccountManagementError && error.code === 'LAST_ADMIN_BLOCKED'
  );
});

test('Disable uses Better Auth ban semantics, revokes sessions, and Restore does not resurrect them', async () => {
  const auth = fakeAuth([
    { id: 'actor', name: 'Actor', email: 'actor@example.test', role: 'admin', sessions: 1 },
    { id: 'learner', name: 'Learner', email: 'learner@example.test', role: 'user', sessions: 3 }
  ]);

  const disabled = await disableAccount({ auth, headers, actorUserId: 'actor', userId: 'learner' });
  assert.equal(disabled.status, 'Disabled');
  assert.equal(auth.sessionCounts.get('learner'), 0);
  assert.equal(auth.calls.some((call) => call.operation === 'banUser'), true);

  const restored = await restoreAccount({ auth, headers, userId: 'learner' });
  assert.equal(restored.status, 'Active');
  assert.equal(auth.sessionCounts.get('learner'), 0, 'restore must not recreate revoked sessions');
});

test('manual session revocation works for another account and is blocked for self', async () => {
  const auth = fakeAuth([
    { id: 'actor', name: 'Actor', email: 'actor@example.test', role: 'admin', sessions: 1 },
    { id: 'learner', name: 'Learner', email: 'learner@example.test', role: 'user', sessions: 2 }
  ]);

  await revokeAccountSessions({ auth, headers, actorUserId: 'actor', userId: 'learner' });
  assert.equal(auth.sessionCounts.get('learner'), 0);
  await assert.rejects(
    () => revokeAccountSessions({ auth, headers, actorUserId: 'actor', userId: 'actor' }),
    (error) => error instanceof AccountManagementError && error.code === 'SELF_SESSION_REVOKE_BLOCKED'
  );
});

test('Preview-only identities cannot be opened or receive Production Accounts password actions', async () => {
  const auth = fakeAuth([
    { id: 'preview', name: 'Preview', email: 'preview@example.test', role: 'preview_admin' }
  ]);
  await assert.rejects(
    () => getAccount(auth, headers, 'preview'),
    (error) => error instanceof AccountManagementError && error.code === 'PREVIEW_ACCOUNT_NOT_MANAGED'
  );
  await assert.rejects(
    () =>
      sendAccountPasswordEmail({
        auth,
        headers,
        userId: 'preview',
        purpose: 'reset',
        sendPasswordEmail: async () => {}
      }),
    (error) => error instanceof AccountManagementError && error.code === 'PREVIEW_ACCOUNT_NOT_MANAGED'
  );
});

test('set-password email is distinct, secure, and contains no temporary credential', () => {
  const message = renderSetPasswordEmail('https://flash-cards.example.test/reset-password#token=one-time');
  assert.equal(message.subject, 'Set your Flash-Cards password');
  assert.match(message.text, /account was created/i);
  assert.match(message.text, /expires in 1 hour/i);
  assert.match(message.text, /No temporary password/i);
  assert.match(message.text, /#token=one-time/);
});

test('PR-B source preserves closed enrollment, Preview fail-closed routing, and omits hard-delete operations', async () => {
  const authSource = await readFile(new URL('../src/lib/server/auth.js', import.meta.url), 'utf8');
  const accountSource = await readFile(
    new URL('../src/lib/server/accounts/admin-accounts.ts', import.meta.url),
    'utf8'
  );
  const passwordEmailSource = await readFile(
    new URL('../src/lib/server/accounts/password-email.ts', import.meta.url),
    'utf8'
  );
  const hooksSource = await readFile(new URL('../src/hooks.server.js', import.meta.url), 'utf8');
  const listRouteSource = await readFile(
    new URL('../src/routes/admin/accounts/+page.server.js', import.meta.url),
    'utf8'
  );

  assert.match(authSource, /disableSignUp:\s*true/);
  assert.match(authSource, /revokeSessionsOnPasswordReset:\s*true/);
  assert.match(passwordEmailSource, /requestPasswordReset/);
  assert.match(passwordEmailSource, /awaitPasswordEmailDelivery:\s*true/);
  assert.doesNotMatch(passwordEmailSource, /randomUUID|generateId|createVerification|verificationToken/i);
  assert.doesNotMatch(accountSource, /removeUser|deleteUser|delete.*review/i);
  assert.match(accountSource, /banUser/);
  assert.match(accountSource, /revokeUserSessions/);
  assert.match(listRouteSource, /requireProductionAccountManager/);
  assert.match(hooksSource, /isRouteWithin\(pathname, '\/api\/auth\/admin'\)/);
});
