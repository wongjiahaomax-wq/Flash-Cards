import type { createAuth } from '../auth.js';
import { isPreviewAdmin, isPreviewWorker, isProductionAdmin, parseRoles } from '../preview-auth.js';

type Auth = ReturnType<typeof createAuth>;
export type PasswordEmailPurpose = 'account-setup' | 'reset';
export type AccountType = 'learner' | 'administrator';

export type AccountView = {
  id: string;
  name: string;
  email: string;
  accountType: 'Learner' | 'Administrator';
  status: 'Active' | 'Disabled';
  createdAt: string | null;
  hasPreviewAccess: boolean;
};

export type AccountListResult = {
  accounts: AccountView[];
  page: number;
  pageSize: number;
  totalIncludingPreviewOnly: number;
  hasPrevious: boolean;
  hasNext: boolean;
};

type PasswordEmailSender = (email: string, purpose: PasswordEmailPurpose) => Promise<void>;

type AccountUser = {
  id: string;
  name: string;
  email: string;
  role?: unknown;
  banned?: unknown;
  createdAt?: unknown;
};

export class AccountManagementError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'AccountManagementError';
    this.code = code;
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function authErrorCode(error: unknown): string {
  const record = asRecord(error);
  const body = asRecord(record?.body);
  const code = record?.code ?? body?.code;
  return typeof code === 'string' ? code : '';
}

function mapAuthError(error: unknown, fallbackMessage: string): AccountManagementError {
  const code = authErrorCode(error);
  if (code.includes('USER_ALREADY_EXISTS')) {
    return new AccountManagementError(
      'ACCOUNT_ALREADY_EXISTS',
      'An account already exists for that email address.',
      409
    );
  }
  if (code.includes('USER_NOT_FOUND')) {
    return new AccountManagementError('ACCOUNT_NOT_FOUND', 'That account no longer exists.', 404);
  }
  if (code.includes('UNAUTHORIZED') || code.includes('FORBIDDEN') || code.includes('NOT_ALLOWED')) {
    return new AccountManagementError(
      'ACCOUNT_ADMIN_FORBIDDEN',
      'Production Administrator access is required.',
      403
    );
  }
  return new AccountManagementError('ACCOUNT_OPERATION_FAILED', fallbackMessage, 500);
}

function accountUser(value: unknown): AccountUser {
  const record = asRecord(value);
  const id = typeof record?.id === 'string' ? record.id : '';
  const email = typeof record?.email === 'string' ? record.email : '';
  if (!id || !email) {
    throw new AccountManagementError('INVALID_ACCOUNT_DATA', 'Unable to read the account record.', 500);
  }
  return {
    id,
    email,
    name: typeof record?.name === 'string' ? record.name : '',
    role: record?.role,
    banned: record?.banned,
    createdAt: record?.createdAt
  };
}

function isDisabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function createdAtIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

function isPreviewOnlyRole(role: unknown): boolean {
  const roles = parseRoles(role);
  return roles.includes('preview_admin') && !roles.includes('admin');
}

function toAccountView(value: unknown): AccountView | null {
  const user = accountUser(value);
  if (isPreviewOnlyRole(user.role)) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    accountType: parseRoles(user.role).includes('admin') ? 'Administrator' : 'Learner',
    status: isDisabled(user.banned) ? 'Disabled' : 'Active',
    createdAt: createdAtIso(user.createdAt),
    hasPreviewAccess: isPreviewAdmin(user)
  };
}

function requiredText(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new AccountManagementError('INVALID_INPUT', `${label} is required.`);
  return text;
}

function normalizedEmail(value: unknown): string {
  const email = requiredText(value, 'Email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AccountManagementError('INVALID_INPUT', 'Enter a valid email address.');
  }
  return email;
}

export function requireProductionAccountManager(
  user: { id?: string; role?: unknown } | null | undefined,
  env: { PREVIEW_MODE?: unknown } | null | undefined
): string {
  if (isPreviewWorker(env) || !user?.id || !isProductionAdmin(user)) {
    throw new AccountManagementError(
      'ACCOUNT_ADMIN_FORBIDDEN',
      'Production Administrator access is required.',
      403
    );
  }
  return user.id;
}

export function productionRoleTransition(role: unknown, target: AccountType): string[] {
  const roles = parseRoles(role);
  const retained = roles.filter((value) => value !== 'admin' && value !== 'user');

  if (target === 'administrator') return ['admin', ...retained];
  return retained.length > 0 ? retained : ['user'];
}

export async function listAccounts(options: {
  auth: Auth;
  headers: Headers;
  page?: number;
  search?: string;
  searchField?: 'name' | 'email';
}): Promise<AccountListResult> {
  const pageSize = 25;
  const page = Number.isInteger(options.page) && Number(options.page) > 0 ? Number(options.page) : 1;
  const offset = (page - 1) * pageSize;
  const search = options.search?.trim() ?? '';
  const searchField = options.searchField === 'email' ? 'email' : 'name';

  try {
    const result = await options.auth.api.listUsers({
      query: {
        limit: pageSize,
        offset,
        sortBy: 'createdAt',
        sortDirection: 'desc',
        ...(search
          ? {
              searchValue: search,
              searchField,
              searchOperator: 'contains' as const
            }
          : {})
      },
      headers: options.headers
    });
    const users = Array.isArray(result.users) ? result.users : [];
    const total = typeof result.total === 'number' ? result.total : 0;

    return {
      accounts: users.map(toAccountView).filter((value): value is AccountView => Boolean(value)),
      page,
      pageSize,
      totalIncludingPreviewOnly: total,
      hasPrevious: page > 1,
      hasNext: offset + pageSize < total
    };
  } catch (error) {
    throw mapAuthError(error, 'Unable to load accounts.');
  }
}

export async function getAccount(auth: Auth, headers: Headers, userId: string): Promise<AccountView> {
  let user: unknown;
  try {
    user = await auth.api.getUser({ query: { id: userId }, headers });
  } catch (error) {
    throw mapAuthError(error, 'Unable to load that account.');
  }

  const view = toAccountView(user);
  if (!view) {
    throw new AccountManagementError(
      'PREVIEW_ACCOUNT_NOT_MANAGED',
      'Preview-only Administrator identities are managed separately from Production Accounts.',
      404
    );
  }
  return view;
}

async function loadRawManagedUser(auth: Auth, headers: Headers, userId: string): Promise<AccountUser> {
  let user: unknown;
  try {
    user = await auth.api.getUser({ query: { id: userId }, headers });
  } catch (error) {
    throw mapAuthError(error, 'Unable to load that account.');
  }
  const parsed = accountUser(user);
  if (isPreviewOnlyRole(parsed.role)) {
    throw new AccountManagementError(
      'PREVIEW_ACCOUNT_NOT_MANAGED',
      'Preview-only Administrator identities are managed separately from Production Accounts.',
      404
    );
  }
  return parsed;
}

async function hasOtherActiveProductionAdmin(
  auth: Auth,
  headers: Headers,
  targetUserId: string
): Promise<boolean> {
  const limit = 100;
  let offset = 0;

  while (true) {
    let result;
    try {
      result = await auth.api.listUsers({
        query: {
          filterField: 'role',
          filterValue: 'admin',
          filterOperator: 'contains',
          limit,
          offset
        },
        headers
      });
    } catch (error) {
      throw mapAuthError(error, 'Unable to verify Administrator lockout protection.');
    }

    const users = Array.isArray(result.users) ? result.users : [];
    for (const value of users) {
      const user = accountUser(value);
      if (
        user.id !== targetUserId &&
        !isDisabled(user.banned) &&
        parseRoles(user.role).includes('admin')
      ) {
        return true;
      }
    }

    const total = typeof result.total === 'number' ? result.total : offset + users.length;
    if (users.length === 0 || offset + users.length >= total) return false;
    offset += users.length;
  }
}

async function assertMayRemoveProductionAdmin(
  auth: Auth,
  headers: Headers,
  actorUserId: string,
  target: AccountUser
): Promise<void> {
  if (target.id === actorUserId) {
    throw new AccountManagementError(
      'SELF_LOCKOUT_BLOCKED',
      'You cannot disable or remove your own Production Administrator access.',
      400
    );
  }

  if (
    !isDisabled(target.banned) &&
    parseRoles(target.role).includes('admin') &&
    !(await hasOtherActiveProductionAdmin(auth, headers, target.id))
  ) {
    throw new AccountManagementError(
      'LAST_ADMIN_BLOCKED',
      'At least one active Production Administrator must remain.',
      409
    );
  }
}

export async function createAccount(options: {
  auth: Auth;
  headers: Headers;
  name: unknown;
  email: unknown;
  accountType: unknown;
  sendPasswordEmail: PasswordEmailSender;
}): Promise<{ account: AccountView; invitationStatus: 'sent' | 'failed' }> {
  const name = requiredText(options.name, 'Name');
  const email = normalizedEmail(options.email);
  const accountType = options.accountType;
  if (accountType !== 'learner' && accountType !== 'administrator') {
    throw new AccountManagementError('INVALID_INPUT', 'Choose Learner or Administrator.');
  }

  let created;
  try {
    // Better Auth 1.6.25 permits Admin create-user without a password. The
    // password-reset flow will create the credential account when the recipient
    // sets their password, so there is no temporary credential to expose.
    created = await options.auth.api.createUser({
      body: {
        name,
        email,
        role: accountType === 'administrator' ? 'admin' : 'user'
      },
      headers: options.headers
    });
  } catch (error) {
    throw mapAuthError(error, 'Unable to create the account.');
  }

  const account = toAccountView(created.user);
  if (!account) {
    throw new AccountManagementError('INVALID_ACCOUNT_DATA', 'Unable to read the created account.', 500);
  }

  try {
    await options.sendPasswordEmail(account.email, 'account-setup');
    return { account, invitationStatus: 'sent' };
  } catch {
    // Email delivery cannot be atomic with user creation. Preserve the account
    // and let the Administrator retry delivery from the account detail page.
    return { account, invitationStatus: 'failed' };
  }
}

export async function sendAccountPasswordEmail(options: {
  auth: Auth;
  headers: Headers;
  userId: string;
  purpose: PasswordEmailPurpose;
  sendPasswordEmail: PasswordEmailSender;
}): Promise<void> {
  const target = await loadRawManagedUser(options.auth, options.headers, options.userId);
  try {
    await options.sendPasswordEmail(target.email, options.purpose);
  } catch {
    throw new AccountManagementError(
      'EMAIL_DELIVERY_FAILED',
      'The account exists, but the password email could not be delivered. Try again after checking email configuration.',
      502
    );
  }
}

export async function changeProductionRole(options: {
  auth: Auth;
  headers: Headers;
  actorUserId: string;
  userId: string;
  accountType: AccountType;
}): Promise<AccountView | null> {
  const target = await loadRawManagedUser(options.auth, options.headers, options.userId);
  const currentRoles = parseRoles(target.role);
  const isAdmin = currentRoles.includes('admin');

  if (options.accountType === 'learner') {
    await assertMayRemoveProductionAdmin(options.auth, options.headers, options.actorUserId, target);
    if (!isAdmin) return toAccountView(target);
  } else if (isAdmin) {
    return toAccountView(target);
  }

  const nextRoles = productionRoleTransition(target.role, options.accountType);
  type SetRoleBody = Parameters<Auth['api']['setRole']>[0]['body']['role'];

  let updated;
  try {
    updated = await options.auth.api.setRole({
      body: {
        userId: target.id,
        role: nextRoles as unknown as SetRoleBody
      },
      headers: options.headers
    });
  } catch (error) {
    throw mapAuthError(error, 'Unable to change the account type.');
  }

  return toAccountView(updated.user);
}

export async function disableAccount(options: {
  auth: Auth;
  headers: Headers;
  actorUserId: string;
  userId: string;
}): Promise<AccountView> {
  const target = await loadRawManagedUser(options.auth, options.headers, options.userId);
  if (target.id === options.actorUserId) {
    throw new AccountManagementError(
      'SELF_DISABLE_BLOCKED',
      'You cannot disable your own account.',
      400
    );
  }
  if (isDisabled(target.banned)) {
    const view = toAccountView(target);
    if (!view) throw new AccountManagementError('ACCOUNT_NOT_FOUND', 'That account is not managed here.', 404);
    return view;
  }

  await assertMayRemoveProductionAdmin(options.auth, options.headers, options.actorUserId, target);

  try {
    // Pinned Better Auth 1.6.25 ban-user is indefinite when banExpiresIn is
    // omitted and revokes all existing sessions as part of the same operation.
    const result = await options.auth.api.banUser({
      body: {
        userId: target.id,
        banReason: 'Disabled by Production Administrator'
      },
      headers: options.headers
    });
    const view = toAccountView(result.user);
    if (!view) throw new AccountManagementError('ACCOUNT_NOT_FOUND', 'That account is not managed here.', 404);
    return view;
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw mapAuthError(error, 'Unable to disable the account.');
  }
}

export async function restoreAccount(options: {
  auth: Auth;
  headers: Headers;
  userId: string;
}): Promise<AccountView> {
  const target = await loadRawManagedUser(options.auth, options.headers, options.userId);
  if (!isDisabled(target.banned)) {
    const view = toAccountView(target);
    if (!view) throw new AccountManagementError('ACCOUNT_NOT_FOUND', 'That account is not managed here.', 404);
    return view;
  }

  try {
    const result = await options.auth.api.unbanUser({
      body: { userId: target.id },
      headers: options.headers
    });
    const view = toAccountView(result.user);
    if (!view) throw new AccountManagementError('ACCOUNT_NOT_FOUND', 'That account is not managed here.', 404);
    return view;
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw mapAuthError(error, 'Unable to restore the account.');
  }
}

export async function revokeAccountSessions(options: {
  auth: Auth;
  headers: Headers;
  actorUserId: string;
  userId: string;
}): Promise<void> {
  if (options.userId === options.actorUserId) {
    throw new AccountManagementError(
      'SELF_SESSION_REVOKE_BLOCKED',
      'Use a dedicated self-service security flow to revoke your own sessions.',
      400
    );
  }
  await loadRawManagedUser(options.auth, options.headers, options.userId);

  try {
    await options.auth.api.revokeUserSessions({
      body: { userId: options.userId },
      headers: options.headers
    });
  } catch (error) {
    throw mapAuthError(error, 'Unable to revoke the account sessions.');
  }
}
