// @ts-nocheck
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createDb } from '../src/lib/server/db/index.js';
import { getAccount } from '../src/lib/server/accounts/admin-accounts.ts';
import {
  advanceLearnerAccountDeletion,
  beginLearnerAccountDeletion
} from '../src/lib/server/db/learner-account-deletion.ts';
import { applyCurrentSchema } from './current-schema.js';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '$lib/server/accounts/password-email.ts') {
      return {
        url: 'data:text/javascript,export const requestAdminPasswordEmail = async () => {};',
        shortCircuit: true
      };
    }
    if (specifier.startsWith('$lib/')) {
      return {
        url: new URL(`../src/lib/${specifier.slice('$lib/'.length)}`, import.meta.url).href,
        shortCircuit: true
      };
    }
    return nextResolve(specifier, context);
  }
});

const ACTOR_ID = 'account-deletion-actor';
const LEARNER_ID = 'account-deletion-learner';
const LEARNER_EMAIL = 'deleting-learner@example.test';

class SqliteD1Statement {
  constructor(client, sql, params = []) {
    this.client = client;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new SqliteD1Statement(this.client, this.sql, params);
  }

  async first() {
    return this.client.database.prepare(this.sql).get(...this.params) ?? null;
  }

  async run() {
    const result = this.client.database.prepare(this.sql).run(...this.params);
    return {
      success: true,
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
      results: []
    };
  }
}

class SqliteD1Client {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new SqliteD1Statement(this, sql);
  }

  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) {
        const result = this.database.prepare(statement.sql).run(...statement.params);
        results.push({
          success: true,
          meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
          results: []
        });
      }
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  const d1 = new SqliteD1Client(sqlite);
  const users = new Map([
    [ACTOR_ID, { id: ACTOR_ID, name: 'Account Actor', email: 'actor@example.test', role: 'admin', banned: false }],
    [LEARNER_ID, { id: LEARNER_ID, name: 'Deleting Learner', email: LEARNER_EMAIL, role: 'user', banned: false }]
  ]);
  const calls = [];
  const auth = {
    api: {
      async getUser({ query }) {
        const user = users.get(query.id);
        if (!user) throw { code: 'USER_NOT_FOUND' };
        calls.push({ operation: 'getUser', userId: query.id });
        return { ...user };
      },
      async removeUser({ body }) {
        calls.push({ operation: 'removeUser', userId: body.userId });
        await d1.prepare('DELETE FROM "user" WHERE "id" = ?').bind(body.userId).run();
        users.delete(body.userId);
        return { success: true };
      },
      async listUsers() {
        return { users: [...users.values()], total: users.size };
      }
    }
  };

  sqlite.exec(`
    INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt", "role", "banned")
    VALUES ('${ACTOR_ID}', 'Account Actor', 'actor@example.test', 1, 1, 1, 'admin', 0);
    INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt", "role", "banned")
    VALUES ('${LEARNER_ID}', 'Deleting Learner', '${LEARNER_EMAIL}', 1, 1, 1, 'user', 0);
    INSERT INTO "account" ("id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt")
    VALUES ('account-deletion-credential', '${LEARNER_ID}', 'credential', '${LEARNER_ID}', 'test-password-hash', 1, 1);
    INSERT INTO "session" ("id", "expiresAt", "token", "createdAt", "updatedAt", "userId")
    VALUES ('account-deletion-session', 9999999999999, 'account-deletion-token', 1, 1, '${LEARNER_ID}');
    INSERT INTO "learner_preferences" ("user_id") VALUES ('${LEARNER_ID}');
    INSERT INTO "learner_fsrs_profiles" ("user_id", "scheduler_library_version", "parameters_json")
    VALUES ('${LEARNER_ID}', '5.4.2', '{}');
  `);

  return { sqlite, d1, db: createDb(d1), auth, calls, users };
}

function actionEvent(fixtureValue, action, fields = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return {
    request: new Request(`http://localhost/admin/accounts/${LEARNER_ID}?/${action}`, {
      method: 'POST',
      body: formData
    }),
    locals: {
      user: { id: ACTOR_ID, role: 'admin' },
      auth: fixtureValue.auth
    },
    params: { userId: LEARNER_ID },
    platform: { env: { DB: fixtureValue.d1 } },
    url: new URL(`http://localhost/admin/accounts/${LEARNER_ID}`)
  };
}

function count(sqlite, table, userColumn = 'user_id') {
  return Number(sqlite.prepare(`SELECT COUNT(*) AS count FROM "${table}" WHERE "${userColumn}" = ?`).get(LEARNER_ID)?.count ?? 0);
}

function userState(sqlite) {
  return sqlite.prepare('SELECT "role", "banned" FROM "user" WHERE "id" = ?').get(LEARNER_ID);
}

async function expectRedirect(actionPromise) {
  try {
    await actionPromise;
    assert.fail('Expected a SvelteKit redirect.');
  } catch (error) {
    assert.equal(error?.status, 303);
    return error;
  }
}

test('Continue deletion without an existing marker is non-destructive', async () => {
  const fixtureValue = fixture();
  try {
    const { actions } = await import('../src/routes/admin/accounts/[userId]/+page.server.js');
    const result = await actions.continueDeletion(actionEvent(fixtureValue, 'continueDeletion'));

    assert.equal(result.status, 409);
    assert.equal(fixtureValue.sqlite.prepare('SELECT COUNT(*) AS count FROM learner_account_deletions').get().count, 0);
    assert.equal(userState(fixtureValue.sqlite)?.role, 'user');
    assert.equal(userState(fixtureValue.sqlite)?.banned, 0);
    assert.equal(count(fixtureValue.sqlite, 'session', 'userId'), 1);
    assert.equal(count(fixtureValue.sqlite, 'account', 'userId'), 1);
    assert.equal(count(fixtureValue.sqlite, 'learner_preferences'), 1);
    assert.equal(fixtureValue.calls.some((call) => call.operation === 'removeUser'), false);
  } finally {
    fixtureValue.sqlite.close();
  }
});

test('marked accounts are shown as deletion-in-progress and every privileged mutation is fenced', async () => {
  const fixtureValue = fixture();
  try {
    const { actions } = await import('../src/routes/admin/accounts/[userId]/+page.server.js');
    await expectRedirect(actions.deleteLearner(actionEvent(fixtureValue, 'deleteLearner', { confirmEmail: LEARNER_EMAIL })));

    const account = await getAccount(fixtureValue.auth, new Headers(), LEARNER_ID, fixtureValue.d1);
    assert.equal(account.status, 'Deletion in progress');
    assert.ok(account.deletionPhase);
    assert.equal(userState(fixtureValue.sqlite)?.role, 'user');
    assert.equal(userState(fixtureValue.sqlite)?.banned, 1);

    for (const action of ['promote', 'demote', 'disable', 'restore', 'sendSetPassword', 'sendPasswordReset', 'revokeSessions']) {
      const result = await actions[action](actionEvent(fixtureValue, action));
      assert.equal(result.status, 409, `${action} must reject a marked learner`);
      assert.match(result.data.error, /Deletion in progress/i);
    }

    assert.equal(userState(fixtureValue.sqlite)?.role, 'user');
    assert.equal(userState(fixtureValue.sqlite)?.banned, 1);
    assert.equal(count(fixtureValue.sqlite, 'session', 'userId'), 0, 'the start batch may revoke existing sessions, but mutations must not add or change them');
    assert.equal(fixtureValue.calls.some((call) => call.operation === 'removeUser'), false);
  } finally {
    fixtureValue.sqlite.close();
  }
});

test('promotion committed before a deletion marker leaves the deletion unstarted and learner data intact', async () => {
  const fixtureValue = fixture();
  try {
    const staleLearnerRead = fixtureValue.sqlite.prepare(
      'SELECT "role" FROM "user" WHERE "id" = ?'
    ).get(LEARNER_ID);
    assert.equal(staleLearnerRead?.role, 'user');

    fixtureValue.sqlite.prepare('UPDATE "user" SET "role" = ? WHERE "id" = ?').run('admin', LEARNER_ID);

    await assert.rejects(
      () => fixtureValue.d1.batch([
        fixtureValue.d1.prepare(`
          INSERT INTO learner_account_deletions (user_id, phase)
          VALUES (?, 'auth_sessions')
        `).bind(LEARNER_ID),
        fixtureValue.d1.prepare(`
          INSERT INTO learner_study_data_deletions (
            user_id, phase, requested_at, updated_at, batches_completed, completed_at
          ) VALUES (?, 'active_reviews', 1, 1, 0, NULL)
        `).bind(LEARNER_ID),
        fixtureValue.d1.prepare('UPDATE "user" SET "banned" = 1 WHERE "id" = ?').bind(LEARNER_ID)
      ]),
      /LEARNER_ACCOUNT_DELETION_TARGET_NOT_LEARNER/
    );
    assert.equal(fixtureValue.sqlite.prepare('SELECT COUNT(*) AS count FROM learner_account_deletions').get().count, 0);
    assert.equal(fixtureValue.sqlite.prepare('SELECT COUNT(*) AS count FROM learner_study_data_deletions').get().count, 0);
    assert.equal(userState(fixtureValue.sqlite)?.role, 'admin');
    assert.equal(userState(fixtureValue.sqlite)?.banned, 0);
    assert.equal(count(fixtureValue.sqlite, 'session', 'userId'), 1);
    assert.equal(count(fixtureValue.sqlite, 'account', 'userId'), 1);
    assert.equal(count(fixtureValue.sqlite, 'learner_preferences'), 1);

    await assert.rejects(
      () => beginLearnerAccountDeletion({ db: fixtureValue.db, userId: LEARNER_ID }),
      (error) => error?.code === 'not-learner'
    );
  } finally {
    fixtureValue.sqlite.close();
  }
});

test('a deletion marker committed first rejects role promotion and remains resumable', async () => {
  const fixtureValue = fixture();
  try {
    await beginLearnerAccountDeletion({ db: fixtureValue.db, userId: LEARNER_ID });
    assert.equal(fixtureValue.sqlite.prepare('SELECT COUNT(*) AS count FROM learner_account_deletions').get().count, 1);
    assert.equal(userState(fixtureValue.sqlite)?.role, 'user');
    assert.equal(userState(fixtureValue.sqlite)?.banned, 1);

    assert.throws(
      () => fixtureValue.sqlite.prepare('UPDATE "user" SET "role" = ? WHERE "id" = ?').run('admin', LEARNER_ID),
      /LEARNER_ACCOUNT_DELETION_IN_PROGRESS/
    );
    assert.equal(userState(fixtureValue.sqlite)?.role, 'user');
    const progress = await advanceLearnerAccountDeletion({ db: fixtureValue.db, userId: LEARNER_ID, batchSize: 1 });
    assert.equal(progress.deleted, false);
    assert.equal(fixtureValue.sqlite.prepare('SELECT COUNT(*) AS count FROM learner_account_deletions').get().count, 1);
    assert.equal(userState(fixtureValue.sqlite)?.role, 'user');
    assert.equal(userState(fixtureValue.sqlite)?.banned, 1);
  } finally {
    fixtureValue.sqlite.close();
  }
});

test('Start creates the marker and Continue advances it to Better Auth identity removal', async () => {
  const fixtureValue = fixture();
  try {
    const { actions } = await import('../src/routes/admin/accounts/[userId]/+page.server.js');
    await expectRedirect(actions.deleteLearner(actionEvent(fixtureValue, 'deleteLearner', { confirmEmail: LEARNER_EMAIL })));
    assert.equal(fixtureValue.sqlite.prepare('SELECT COUNT(*) AS count FROM learner_account_deletions').get().count, 1);

    for (let attempt = 0; attempt < 3 && fixtureValue.users.has(LEARNER_ID); attempt += 1) {
      await expectRedirect(actions.continueDeletion(actionEvent(fixtureValue, 'continueDeletion')));
    }

    assert.equal(fixtureValue.users.has(LEARNER_ID), false);
    assert.equal(fixtureValue.sqlite.prepare('SELECT COUNT(*) AS count FROM "user" WHERE "id" = ?').get(LEARNER_ID).count, 0);
    assert.equal(fixtureValue.sqlite.prepare('SELECT COUNT(*) AS count FROM learner_account_deletions').get().count, 0);
    assert.equal(count(fixtureValue.sqlite, 'session', 'userId'), 0);
    assert.equal(count(fixtureValue.sqlite, 'account', 'userId'), 0);
    assert.equal(count(fixtureValue.sqlite, 'learner_preferences'), 0);
    assert.equal(count(fixtureValue.sqlite, 'learner_fsrs_profiles'), 0);
    assert.equal(fixtureValue.calls.filter((call) => call.operation === 'removeUser').length, 1);
  } finally {
    fixtureValue.sqlite.close();
  }
});
