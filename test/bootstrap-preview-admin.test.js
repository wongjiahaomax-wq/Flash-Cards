import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  addPreviewAdminRole,
  buildExistingAdminPromotionSql,
  buildPreviewBootstrapSql,
  hasRole,
  parseRoles
} from '../scripts/bootstrap-preview-admin.mjs';

test('Preview Admin role parsing supports combined Better Auth roles', () => {
  assert.deepEqual(parseRoles('admin, preview_admin,admin'), ['admin', 'preview_admin']);
  assert.equal(hasRole('admin,preview_admin', 'admin'), true);
  assert.equal(hasRole('admin,preview_admin', 'preview_admin'), true);
});

test('existing production admin can gain preview_admin without losing other roles', () => {
  assert.equal(addPreviewAdminRole('admin'), 'admin,preview_admin');
  assert.equal(addPreviewAdminRole('admin,author'), 'admin,author,preview_admin');
  assert.equal(addPreviewAdminRole('admin,preview_admin'), 'admin,preview_admin');
});

test('ordinary learner cannot be promoted to Preview Admin by the bootstrap helper', () => {
  assert.throws(() => addPreviewAdminRole('user'), /existing production admin/);
  assert.throws(() => addPreviewAdminRole(''), /existing production admin/);
});

test('existing-admin promotion SQL changes only the user role and timestamp', () => {
  const sql = buildExistingAdminPromotionSql({
    userId: "admin-'id",
    currentRole: 'admin',
    nextRole: 'admin,preview_admin',
    now: 456
  });

  assert.match(sql, /UPDATE `user` SET `role` = 'admin,preview_admin'/);
  assert.match(sql, /`updatedAt` = 456/);
  assert.match(sql, /`id` = 'admin-''id'/);
  assert.match(sql, /coalesce\(`role`, ''\) = 'admin'/);
  assert.doesNotMatch(sql, /INSERT|DELETE|`account`|`password`/i);
});

test('existing-admin promotion preserves the credential row and password hash', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE user (
      id TEXT PRIMARY KEY,
      role TEXT,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE account (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      providerId TEXT NOT NULL,
      password TEXT
    );
    INSERT INTO user (id, role, updatedAt) VALUES ('owner', 'admin', 100);
    INSERT INTO account (id, userId, providerId, password)
      VALUES ('credential-1', 'owner', 'credential', 'original-password-hash');
  `);

  db.exec(buildExistingAdminPromotionSql({
    userId: 'owner',
    currentRole: 'admin',
    nextRole: 'admin,preview_admin',
    now: 456
  }));

  const user = db.prepare('SELECT id, role, updatedAt FROM user WHERE id = ?').get('owner');
  const account = db.prepare('SELECT id, userId, providerId, password FROM account WHERE userId = ?').get('owner');

  assert.deepEqual({ ...user }, { id: 'owner', role: 'admin,preview_admin', updatedAt: 456 });
  assert.deepEqual({ ...account }, {
    id: 'credential-1',
    userId: 'owner',
    providerId: 'credential',
    password: 'original-password-hash'
  });

  db.close();
});

test('new dedicated Preview Admin creation remains preview_admin-only', () => {
  const sql = buildPreviewBootstrapSql({
    userId: 'preview-user',
    accountId: 'preview-account',
    name: 'Preview Admin',
    email: 'preview@example.test',
    passwordHash: 'hash',
    now: 123
  });

  assert.match(sql, /'preview_admin'/);
  assert.doesNotMatch(sql, /'admin'/);
  assert.match(sql, /preview@example\.test/);
});
