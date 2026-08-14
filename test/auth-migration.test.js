import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const migrationSql = readFileSync(
  new URL('../drizzle/0001_better_auth.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

function createAuthDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(migrationSql);
  return db;
}

/** @param {DatabaseSync} db @param {string} table */
function columnNames(db, table) {
  return db.prepare(`PRAGMA table_info(\`${table}\`)`).all().map((column) => column.name);
}

test('Better Auth migration creates the core and Admin plugin schema', () => {
  const db = createAuthDatabase();

  try {
    assert.deepEqual(columnNames(db, 'user'), [
      'id',
      'name',
      'email',
      'emailVerified',
      'image',
      'createdAt',
      'updatedAt',
      'role',
      'banned',
      'banReason',
      'banExpires'
    ]);

    assert.deepEqual(columnNames(db, 'session'), [
      'id',
      'expiresAt',
      'token',
      'createdAt',
      'updatedAt',
      'ipAddress',
      'userAgent',
      'userId',
      'impersonatedBy'
    ]);

    assert.deepEqual(columnNames(db, 'account'), [
      'id',
      'accountId',
      'providerId',
      'userId',
      'accessToken',
      'refreshToken',
      'idToken',
      'accessTokenExpiresAt',
      'refreshTokenExpiresAt',
      'scope',
      'password',
      'createdAt',
      'updatedAt'
    ]);

    assert.deepEqual(columnNames(db, 'verification'), [
      'id',
      'identifier',
      'value',
      'expiresAt',
      'createdAt',
      'updatedAt'
    ]);
  } finally {
    db.close();
  }
});

test('Better Auth migration enforces uniqueness, indexes, and cascading auth records', () => {
  const db = createAuthDatabase();
  const now = Date.now();

  try {
    db.prepare(
      'INSERT INTO `user` (`id`, `name`, `email`, `emailVerified`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('user-1', 'Test Admin', 'admin@example.test', 1, now, now);

    assert.throws(() => {
      db.prepare(
        'INSERT INTO `user` (`id`, `name`, `email`, `emailVerified`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('user-2', 'Duplicate', 'admin@example.test', 0, now, now);
    });

    db.prepare(
      'INSERT INTO `session` (`id`, `expiresAt`, `token`, `createdAt`, `updatedAt`, `userId`) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('session-1', now + 60_000, 'token-1', now, now, 'user-1');

    db.prepare(
      'INSERT INTO `account` (`id`, `accountId`, `providerId`, `userId`, `password`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run('account-1', 'user-1', 'credential', 'user-1', 'hashed-password', now, now);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => row.name);

    assert.ok(indexes.includes('session_userId_idx'));
    assert.ok(indexes.includes('account_userId_idx'));
    assert.ok(indexes.includes('verification_identifier_idx'));

    db.prepare('DELETE FROM `user` WHERE `id` = ?').run('user-1');

    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM `session`').get()?.count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM `account`').get()?.count, 0);
  } finally {
    db.close();
  }
});
