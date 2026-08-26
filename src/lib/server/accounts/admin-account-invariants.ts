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
 * Start guarded active-Admin loss with a write to the singleton guard row.
 *
 * The guarded user UPDATE below has to evaluate its EXISTS predicate only after
 * the competing request has committed. A trigger on that UPDATE is too late for
 * this purpose because SQLite evaluates the UPDATE predicate before firing its
 * BEFORE UPDATE trigger. Making this the first statement in the same D1 batch
 * establishes the write transaction first. Recomputing the count also repairs
 * any stale guard-state value before the database-level trigger consumes it.
 */
function serializeProductionAdminLoss(db: D1Database) {
  return db.prepare(`
    UPDATE `production_admin_guard_state`
    SET `active_admin_count` = (
      SELECT count(*)
      FROM `user`
      WHERE instr(',' || replace(coalesce(`role`, ''), ' ', '') || ',', ',admin,') > 0
        AND coalesce(`banned`, 0) = 0
    )
    WHERE `id` = 1
  `);
}

/**
 * Demote a Production Administrator with the last-active-Admin predicate in the
 * same D1 batch as a preceding write to the shared Admin-loss guard row. This
 * forces competing demotions to establish a write transaction before either
 * request evaluates whether another active Administrator still exists.
 *
 * Better Auth still owns the user table/schema. This narrowly scoped direct
 * mutation exists only for the product invariant that Better Auth's Admin API
 * cannot express atomically. Migration 0016/0017 remains defense-in-depth for
 * direct user-table writes outside this application path.
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
    const serializeAdminLoss = serializeProductionAdminLoss(options.db);
    const demoteUser = options.db
      .prepare(`
        UPDATE `user`
        SET `role` = ?, `updatedAt` = ?
        WHERE `id` = ?
          AND coalesce(`role`, '') = ?
          AND coalesce(`banned`, 0) = ?
          AND (
            NOT (
              instr(',' || replace(coalesce(`role`, ''), ' ', '') || ',', ',admin,') > 0
              AND coalesce(`banned`, 0) = 0
            )
            OR EXISTS (
              SELECT 1
              FROM `user` AS other_admin
              WHERE other_admin.`id` <> `user`.`id`
                AND instr(',' || replace(coalesce(other_admin.`role`, ''), ' ', '') || ',', ',admin,') > 0
                AND coalesce(other_admin.`banned`, 0) = 0
            )
          )
      `)
      .bind(nextRole, Date.now(), target.id, target.role ?? '', expectedBanned);

    const [guardResult, result] = await options.db.batch([serializeAdminLoss, demoteUser]);
    if ((guardResult?.meta.changes ?? 0) !== 1) {
      throw new AccountManagementError(
        'ACCOUNT_SAFETY_GUARD_UNAVAILABLE',
        'Administrator lockout protection is unavailable.',
        500
      );
    }

    if ((result?.meta.changes ?? 0) !== 1) {
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
 * Production Administrator, the batch first serializes active-Admin loss, then
 * conditionally disables the account, then revokes sessions. This preserves the
 * same last-Admin invariant as demotion while matching Better Auth's documented
 * ban-user session behavior.
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
    const serializeAdminLoss = serializeProductionAdminLoss(options.db);
    const updateUser = options.db
      .prepare(`
        UPDATE `user`
        SET
          `banned` = 1,
          `banReason` = ?,
          `banExpires` = NULL,
          `updatedAt` = ?
        WHERE `id` = ?
          AND coalesce(`role`, '') = ?
          AND coalesce(`banned`, 0) = 0
          AND (
            instr(',' || replace(coalesce(`role`, ''), ' ', '') || ',', ',admin,') = 0
            OR EXISTS (
              SELECT 1
              FROM `user` AS other_admin
              WHERE other_admin.`id` <> `user`.`id`
                AND instr(',' || replace(coalesce(other_admin.`role`, ''), ' ', '') || ',', ',admin,') > 0
                AND coalesce(other_admin.`banned`, 0) = 0
            )
          )
      `)
      .bind(DISABLED_REASON, Date.now(), target.id, expectedRole);

    const revokeSessions = options.db
      .prepare(`
        DELETE FROM `session`
        WHERE `userId` = ?
          AND EXISTS (
            SELECT 1
            FROM `user`
            WHERE `id` = ? AND coalesce(`banned`, 0) <> 0
          )
      `)
      .bind(target.id, target.id);

    const [guardResult, updateResult] = await options.db.batch([
      serializeAdminLoss,
      updateUser,
      revokeSessions
    ]);
    if ((guardResult?.meta.changes ?? 0) !== 1) {
      throw new AccountManagementError(
        'ACCOUNT_SAFETY_GUARD_UNAVAILABLE',
        'Administrator lockout protection is unavailable.',
        500
      );
    }

    if ((updateResult?.meta.changes ?? 0) !== 1) {
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
