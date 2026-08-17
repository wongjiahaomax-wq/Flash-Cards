import assert from 'node:assert/strict';
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
