import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { applyCurrentSchema } from './current-schema.js';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  sqlite.exec(`
    INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role, banned)
    VALUES ('learner-delete', 'Learner Delete', 'delete@example.test', 1, 1, 1, 'user', 1);
    INSERT INTO learner_account_deletions (user_id, phase)
    VALUES ('learner-delete', 'auth_verifications');
  `);
  return sqlite;
}

/** @param {DatabaseSync} sqlite */
function verificationCount(sqlite) {
  const row = sqlite.prepare("SELECT COUNT(*) AS n FROM verification").get();
  return Number(row?.n ?? 0);
}

test('staged deletion blocks a new Better Auth verification whose value owns the learner id', () => {
  const sqlite = fixture();
  try {
    assert.throws(
      () => sqlite.exec(`
        INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt)
        VALUES ('reset-during-delete', 'reset-password:token', 'learner-delete', 9999999999999, 1, 1);
      `),
      /learner_account_deletion_in_progress/i
    );
    assert.equal(verificationCount(sqlite), 0);
  } finally {
    sqlite.close();
  }
});

test('a password-reset verification cannot be created after its user identity has been removed', () => {
  const sqlite = fixture();
  try {
    sqlite.exec("DELETE FROM learner_account_deletions WHERE user_id = 'learner-delete';");
    sqlite.exec("DELETE FROM user WHERE id = 'learner-delete';");

    assert.throws(
      () => sqlite.exec(`
        INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt)
        VALUES ('reset-after-delete', 'reset-password:token', 'learner-delete', 9999999999999, 1, 1);
      `),
      /reset_password_verification_user_missing/i
    );
    assert.equal(verificationCount(sqlite), 0);
  } finally {
    sqlite.close();
  }
});
