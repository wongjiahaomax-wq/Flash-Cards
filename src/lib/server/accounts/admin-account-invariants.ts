import {
  AccountManagementError,
  getAccount,
  productionRoleTransition,
  type AccountView
} from './admin-accounts.ts';
import { parseRoles } from '../preview-auth.js';

type AccountSafetyRow = {
  id: string;
  role: string | null;
  banned: number | boolean | null;
};

const DISABLED_REASON = 'Disabled by Production Administrator';

function isDisabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function isPreviewOnlyRole(role: unknown): boolean {
  const roles = parseRoles(role);
  return roles.includes('preview_admin') && !roles.includes('admin') && !roles.includes('user');
}

function lastAdminBlocked(): AccountManagementError {
  return new AccountManagementError(
    'LAST_ADMIN_BLOCKED',
    'At least one active Production Administrator must remain.',
    409
  );
}

function hasLastAdminMarker(error: unknown): boolean {
  if (error instanceof Error && error.message.includes('LAST_ACTIVE_PRODUCTION_ADMIN')) return true;
  return String(error).includes('LAST_ACTIVE_PRODUCTION_ADMIN');
}

function returnedExactlyOneRow(result: D1Result<unknown> | undefined): boolean {
  return (result?.results?.length ?? 0) === 1;
}

async function loadSafetyRow(db: D1Database, userId: string): Promise<AccountSafetyRow> {
  const row = await db
    .prepare('SELECT `id`, `role`, `banned` FROM `user` WHERE `id` = ? LIMIT 1')
    .bind(userId)
    .first<AccountSafetyRow>();

  if (!row) {
    throw new AccountManagementError('ACCOUNT_NOT_FOUND', 'That account no longer exists.', 404);
  }
  if (isPreviewOnlyRole(row.role)) {
    throw new AccountManagementError(
      'PREVIEW_ACCOUNT_NOT_MANAGED',
      'Preview-only Administrator identities are managed separately from Production Accounts.',
      404
    );
  }
  return row;
}

/**
 * Demote a Production Administrator with the last-active-Admin predicate in the
 * same D1 UPDATE that removes the role. A separate Better Auth list/check then
 * setRole sequence can race across requests; this conditional write cannot.
 *
 * Better Auth still owns the user table/schema. This narrowly scoped direct
 * mutation exists only for the product invariant that Better Auth's Admin API
 * cannot express atomically. Migration 0016 remains database defense-in-depth
 * for direct user-table writes outside this application path.
 */
export async function demoteProductionAdministratorAtomically(options: {
  db: D1Database;
  auth: unknown;
  headers: Headers;
  actorUserId: string;
  userId: string;
}): Promise<AccountView> {
  if (options.userId === options.actorUserId) {
    throw new AccountManagementError(
      'SELF_LOCKOUT_BLOCKED',
      'You cannot disable or remove your own Production Administrator access.',
      400
    );
  }

  const target = await loadSafetyRow(options.db, options.userId);
  const currentRoles = parseRoles(target.role);
  if (!currentRoles.includes('admin')) {
    return getAccount(options.auth, options.headers, options.userId);
  }

  const nextRole = productionRoleTransition(target.role, 'learner').join(',');
  const expectedBanned = isDisabled(target.banned) ? 1 : 0;

  try {
    const result = await options.db
      .prepare(`
        UPDATE "user"
        SET "role" = ?, "updatedAt" = ?
        WHERE "id" = ?
          AND coalesce("role", '') = ?
          AND coalesce("banned", 0) = ?
          AND (
            NOT (
              instr(',' || replace(coalesce("role", ''), ' ', '') || ',', ',admin,') > 0
              AND coalesce("banned", 0) = 0
            )
            OR EXISTS (
              SELECT 1
              FROM "user" AS other_admin
              WHERE other_admin."id" <> "user"."id"
                AND instr(',' || replace(coalesce(other_admin."role", ''), ' ', '') || ',', ',admin,') > 0
                AND coalesce(other_admin."banned", 0) = 0
            )
          )
        RETURNING "id"
      `)
      .bind(nextRole, Date.now(), target.id, target.role ?? '', expectedBanned)
      .run();

    if (!returnedExactlyOneRow(result)) {
      const current = await loadSafetyRow(options.db, target.id);
      if (!parseRoles(current.role).includes('admin')) {
        return getAccount(options.auth, options.headers, target.id);
      }
      throw lastAdminBlocked();
    }
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    if (hasLastAdminMarker(error)) throw lastAdminBlocked();
    throw new AccountManagementError('ACCOUNT_OPERATION_FAILED', 'Unable to change the account type.', 500);
  }

  return getAccount(options.auth, options.headers, target.id);
}

/**
 * Disable an account atomically with session revocation. For an active
 * Production Administrator, the same conditional UPDATE requires another
 * active Administrator to exist. The following session DELETE is in the same
 * D1 batch, matching Better Auth's documented ban-user behavior while keeping
 * the last-Admin invariant race-safe.
 */
export async function disableManagedAccountAtomically(options: {
  db: D1Database;
  auth: unknown;
  headers: Headers;
  actorUserId: string;
  userId: string;
}): Promise<AccountView> {
  if (options.userId === options.actorUserId) {
    throw new AccountManagementError('SELF_DISABLE_BLOCKED', 'You cannot disable your own account.', 400);
  }

  const target = await loadSafetyRow(options.db, options.userId);
  if (isDisabled(target.banned)) {
    return getAccount(options.auth, options.headers, target.id);
  }

  const expectedRole = target.role ?? '';

  try {
    const updateUser = options.db
      .prepare(`
        UPDATE "user"
        SET
          "banned" = 1,
          "banReason" = ?,
          "banExpires" = NULL,
          "updatedAt" = ?
        WHERE "id" = ?
          AND coalesce("role", '') = ?
          AND coalesce("banned", 0) = 0
          AND (
            instr(',' || replace(coalesce("role", ''), ' ', '') || ',', ',admin,') = 0
            OR EXISTS (
              SELECT 1
              FROM "user" AS other_admin
              WHERE other_admin."id" <> "user"."id"
                AND instr(',' || replace(coalesce(other_admin."role", ''), ' ', '') || ',', ',admin,') > 0
                AND coalesce(other_admin."banned", 0) = 0
            )
          )
        RETURNING "id"
      `)
      .bind(DISABLED_REASON, Date.now(), target.id, expectedRole);

    const revokeSessions = options.db
      .prepare(`
        DELETE FROM "session"
        WHERE "userId" = ?
          AND EXISTS (
            SELECT 1
            FROM "user"
            WHERE "id" = ? AND coalesce("banned", 0) <> 0
          )
      `)
      .bind(target.id, target.id);

    const [updateResult] = await options.db.batch([updateUser, revokeSessions]);
    if (!returnedExactlyOneRow(updateResult)) {
      const current = await loadSafetyRow(options.db, target.id);
      if (isDisabled(current.banned)) {
        return getAccount(options.auth, options.headers, target.id);
      }
      if (parseRoles(current.role).includes('admin')) throw lastAdminBlocked();
      throw new AccountManagementError(
        'ACCOUNT_CONCURRENTLY_CHANGED',
        'The account changed while it was being disabled. Reload and try again.',
        409
      );
    }
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    if (hasLastAdminMarker(error)) throw lastAdminBlocked();
    throw new AccountManagementError('ACCOUNT_OPERATION_FAILED', 'Unable to disable the account.', 500);
  }

  return getAccount(options.auth, options.headers, target.id);
}
