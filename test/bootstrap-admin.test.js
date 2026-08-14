import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBootstrapSql, extractRows, sqlString } from '../scripts/bootstrap-admin.mjs';

test('bootstrap SQL escapes text values and creates Better Auth admin credential rows', () => {
  const sql = buildBootstrapSql({
    userId: 'user-1',
    accountId: 'account-1',
    name: "Dr O'Connor",
    email: "admin.o'connor@example.test",
    passwordHash: "hash-with-'quote",
    now: 123456789
  });

  assert.match(sql, /INSERT INTO `user`/);
  assert.match(sql, /'admin'/);
  assert.match(sql, /INSERT INTO `account`/);
  assert.match(sql, /'credential'/);
  assert.match(sql, /Dr O''Connor/);
  assert.match(sql, /admin\.o''connor@example\.test/);
  assert.match(sql, /hash-with-''quote/);
  assert.doesNotMatch(sql, /\bBEGIN\b|\bCOMMIT\b/i);
});

test('sqlString quotes single quotes for SQLite', () => {
  assert.equal(sqlString("a'b"), "'a''b'");
});

test('extractRows accepts Wrangler D1 JSON batch output', () => {
  const rows = extractRows(
    JSON.stringify([
      { results: [{ email: 'admin@example.test', role: 'admin' }], success: true },
      { results: [{ email: 'second@example.test', role: 'admin' }], success: true }
    ])
  );

  assert.deepEqual(rows, [
    { email: 'admin@example.test', role: 'admin' },
    { email: 'second@example.test', role: 'admin' }
  ]);
});
