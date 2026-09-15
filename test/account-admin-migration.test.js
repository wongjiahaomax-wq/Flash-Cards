import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { applyCurrentSchema } from './current-schema.js';

/** @param {import('node:sqlite').DatabaseSync} db @param {{ id: string; role: string; banned?: number }} input */
function seedUser(db, { id, role, banned = 0 }) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO \`user\`
      (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`createdAt\`, \`updatedAt\`, \`role\`, \`banned\`)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?)
  `).run(id, id, `${id}@example.test`, now, now, role, banned);
}

test('current schema prevents direct removal of the final active Production Administrator', () => {
  const db = new DatabaseSync(':memory:');
  applyCurrentSchema(db);
  seedUser(db, { id: 'admin', role: 'admin' });

  assert.throws(
    () => db.prepare('UPDATE `user` SET `role` = ? WHERE `id` = ?').run('user', 'admin'),
    /LAST_ACTIVE_PRODUCTION_ADMIN/
  );
  assert.throws(
    () => db.prepare('UPDATE `user` SET `banned` = 1 WHERE `id` = ?').run('admin'),
    /LAST_ACTIVE_PRODUCTION_ADMIN/
  );
  assert.throws(
    () => db.prepare('DELETE FROM `user` WHERE `id` = ?').run('admin'),
    /LAST_ACTIVE_PRODUCTION_ADMIN/
  );
});

test('Preview-only identities do not satisfy the active Production Administrator guard', () => {
  const db = new DatabaseSync(':memory:');
  applyCurrentSchema(db);
  seedUser(db, { id: 'admin', role: 'admin' });
  seedUser(db, { id: 'preview', role: 'preview_admin' });

  assert.throws(
    () => db.prepare('UPDATE `user` SET `banned` = 1 WHERE `id` = ?').run('admin'),
    /LAST_ACTIVE_PRODUCTION_ADMIN/
  );
});
