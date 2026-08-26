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

test('Production Admin demotion serializes before evaluating the last-active-Admin predicate', () => {
  assert.match(invariants, /export async function demoteProductionAdministratorAtomically/);
  assert.match(
    invariants,
    /function serializeProductionAdminLoss[\s\S]*UPDATE[^\n]+production_admin_guard_state[\s\S]*active_admin_count[\s\S]*RETURNING[^\n]+id/
  );
  assert.match(
    invariants,
    /UPDATE[^\n]+user[\s\S]*SET[\s\S]*role[\s\S]*updatedAt[\s\S]*OR EXISTS \([\s\S]*other_admin[\s\S]*coalesce\(other_admin\.[^\n]*banned[^\n]*, 0\) = 0[\s\S]*RETURNING[^\n]+id/
  );
  assert.match(invariants, /options\.db\.batch\(\[serializeAdminLoss, demoteUser\]\)/);
  assert.match(invariants, /function returnedExactlyOneRow/);
  assert.match(invariants, /result\?\.results\?\.length/);
  assert.doesNotMatch(invariants, /result\?\.meta\.changes/);
  assert.match(invariants, /LAST_ADMIN_BLOCKED/);

  const demoteAction = accountDetailRoute.match(/demote: async \(event\) => \{([\s\S]*?)\n  \},\n\n  disable:/)?.[1] ?? '';
  assert.match(demoteAction, /demoteProductionAdministratorAtomically/);
  assert.match(demoteAction, /db: context\.env\.DB/);
  assert.doesNotMatch(demoteAction, /changeProductionRole/);
});

test('Disable serializes Admin loss, marks the account disabled, and revokes sessions in one D1 batch', () => {
  assert.match(invariants, /export async function disableManagedAccountAtomically/);
  assert.match(
    invariants,
    /SET[\s\S]*banned[^\n]*= 1[\s\S]*OR EXISTS \([\s\S]*other_admin[\s\S]*RETURNING[^\n]+id/
  );
  assert.match(invariants, /DELETE FROM[^\n]+session[\s\S]*WHERE[^\n]+userId[^\n]*= \?/);
  assert.match(
    invariants,
    /options\.db\.batch\(\[[\s\S]*serializeAdminLoss,[\s\S]*updateUser,[\s\S]*revokeSessions[\s\S]*\]\)/
  );
  assert.match(invariants, /returnedExactlyOneRow\(updateResult\)/);

  const disableAction = accountDetailRoute.match(/disable: async \(event\) => \{([\s\S]*?)\n  \},\n\n  restore:/)?.[1] ?? '';
  assert.match(disableAction, /disableManagedAccountAtomically/);
  assert.match(disableAction, /db: context\.env\.DB/);
});