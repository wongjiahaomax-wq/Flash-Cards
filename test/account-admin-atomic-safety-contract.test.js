import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const invariants = await readFile(
  new URL('../src/lib/server/accounts/admin-account-invariants.ts', import.meta.url),
  'utf8'
);
const accountDetailRoute = await readFile(
  new URL('../src/routes/admin/accounts/[userId]/+page.server.js', import.meta.url),
  'utf8'
);

function actionBlock(source, actionName, nextActionName) {
  const startMarker = `${actionName}: async (event) => {`;
  const endMarker = `${nextActionName}: async (event) => {`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(start, -1, `Expected ${actionName} action to exist.`);
  assert.notEqual(end, -1, `Expected ${nextActionName} action to follow ${actionName}.`);
  return source.slice(start, end);
}

test('Production Admin demotion uses one guarded atomic D1 update', () => {
  assert.match(invariants, /export async function demoteProductionAdministratorAtomically/);
  assert.match(
    invariants,
    /UPDATE[^\n]+user[\s\S]*SET[\s\S]*role[\s\S]*updatedAt[\s\S]*OR EXISTS \([\s\S]*other_admin[\s\S]*coalesce\(other_admin\.[^\n]*banned[^\n]*, 0\) = 0[\s\S]*RETURNING[^\n]+id/
  );
  assert.match(invariants, /function returnedExactlyOneRow/);
  assert.match(invariants, /result\?\.results\?\.length/);
  assert.doesNotMatch(invariants, /production_admin_guard_state/);
  assert.doesNotMatch(invariants, /result\?\.meta\.changes/);
  assert.match(invariants, /LAST_ADMIN_BLOCKED/);

  const demoteAction = actionBlock(accountDetailRoute, 'demote', 'disable');
  assert.match(demoteAction, /demoteProductionAdministratorAtomically/);
  assert.match(demoteAction, /db: context\.env\.DB/);
  assert.doesNotMatch(demoteAction, /changeProductionRole/);
});

test('Disable guards active Admin loss and revokes sessions in one D1 batch', () => {
  assert.match(invariants, /export async function disableManagedAccountAtomically/);
  assert.match(
    invariants,
    /SET[\s\S]*banned[^\n]*= 1[\s\S]*OR EXISTS \([\s\S]*other_admin[\s\S]*RETURNING[^\n]+id/
  );
  assert.match(invariants, /DELETE FROM[^\n]+session[\s\S]*WHERE[^\n]+userId[^\n]*= \?/);
  assert.match(invariants, /options\.db\.batch\(\[updateUser, revokeSessions\]\)/);
  assert.match(invariants, /returnedExactlyOneRow\(updateResult\)/);
  assert.doesNotMatch(invariants, /serializeAdminLoss/);

  const disableAction = actionBlock(accountDetailRoute, 'disable', 'restore');
  assert.match(disableAction, /disableManagedAccountAtomically/);
  assert.match(disableAction, /db: context\.env\.DB/);
});
