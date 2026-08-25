import { isPreviewAdmin, isPreviewWorker, isProductionAdmin, parseRoles } from '../preview-auth.js';

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

type AccountAdminApi = {
  listUsers(input: {
    query: Record<string, string | number>;
    headers: Headers;
  }): Promise<unknown>;
  getUser(input: { query: { id: string }; headers: Headers }): Promise<unknown>;
  createUser(input: {
    body: { name: string; email: string; role: 'user' | 'admin' };
    headers: Headers;
  }): Promise<unknown>;
  setRole(input: {
    body: { userId: string; role: string[] };
    headers: Headers;
  }): Promise<unknown>;
  banUser(input: {
    body: { userId: string; banReason: string };
    headers: Headers;
  }): Promise<unknown>;
  unbanUser(input: { body: { userId: string }; headers: Headers }): Promise<unknown>;
  revokeUserSessions(input: { body: { userId: string }; headers: Headers }): Promise<unknown>;
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

function accountAdminApi(auth: unknown): AccountAdminApi {
  const api = asRecord(asRecord(auth)?.api);
  if (!api) {
    throw new AccountManagementError('AUTH_NOT_CONFIGURED', 'Authentication is not configured.', 503);
  }

  // createAuth is JavaScript and intentionally typed against BetterAuthOptions,
  // which does not preserve plugin-generated endpoint inference through
  // ReturnType. Keep that loss of inference at this boundary instead of using a
  // broad cast throughout account-management code.
  return api as unknown as AccountAdminApi;
}

function resultUser(value: unknown): unknown {
  const record = asRecord(value);
  return record && 'user' in record ? record.user : value;
}

function listResult(value: unknown): { users: unknown[]; total: number } {
  const record = asRecord(value);
  const users = Array.isArray(record?.users) ? record.users : [];
  const total = typeof record?.total === 'number' ? record.total : 0;
  return { users, total };
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
  auth: unknown;
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
  const api = accountAdminApi(options.auth);

  try {
    const { users, total } = listResult(
      await api.listUsers({
        query: {
          limit: pageSize,
          offset,
          sortBy: 'createdAt',
          sortDirection: 'desc',
          ...(search
            ? {
                searchValue: search,
                searchField,
                searchOperator: 'contains'
              }
            : {})
        },
        headers: options.headers
      })
    );

    return {
      accounts: users.map(toAccountView).filter((value): value is AccountView => Boolean(value)),
      page,
      pageSize,
      totalIncludingPreviewOnly: total,
      hasPrevious: page > 1,
      hasNext: offset + pageSize < total
    };
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw mapAuthError(error, 'Unable to load accounts.');
  }
}

export async function getAccount(auth: unknown, headers: Headers, userId: string): Promise<AccountView> {
  let user: unknown;
  try {
    user = await accountAdminApi(auth).getUser({ query: { id: userId }, headers });
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
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

async function loadRawManagedUser(auth: unknown, headers: Headers, userId: string): Promise<AccountUser> {
  let user: unknown;
  try {
    user = await accountAdminApi(auth).getUser({ query: { id: userId }, headers });
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
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
  auth: unknown,
  headers: Headers,
  targetUserId: string
): Promise<boolean> {
  const limit = 100;
  let offset = 0;
  const api = accountAdminApi(auth);

  while (true) {
    let users: unknown[];
    let total: number;
    try {
      ({ users, total } = listResult(
        await api.listUsers({
          query: {
            filterField: 'role',
            filterValue: 'admin',
            filterOperator: 'contains',
            limit,
            offset
          },
          headers
        })
      ));
    } catch (error) {
      if (error instanceof AccountManagementError) throw error;
      throw mapAuthError(error, 'Unable to verify Administrator lockout protection.');
    }

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

    if (users.length === 0 || offset + users.length >= total) return false;
    offset += users.length;
  }
}

async function assertMayRemoveProductionAdmin(
  auth: unknown,
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
  auth: unknown;
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

  let created: unknown;
  try {
    // Better Auth 1.6.25 permits Admin create-user without a password. The
    // password-reset flow creates the credential account when the recipient
    // sets their password, so there is no temporary credential to expose.
    created = await accountAdminApi(options.auth).createUser({
      body: {
        name,
        email,
        role: accountType === 'administrator' ? 'admin' : 'user'
      },
      headers: options.headers
    });
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw mapAuthError(error, 'Unable to create the account.');
  }

  const account = toAccountView(resultUser(created));
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
  auth: unknown;
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
  auth: unknown;
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

  let updated: unknown;
  try {
    updated = await accountAdminApi(options.auth).setRole({
      body: {
        userId: target.id,
        role: nextRoles
      },
      headers: options.headers
    });
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw mapAuthError(error, 'Unable to change the account type.');
  }

  return toAccountView(resultUser(updated));
}

export async function disableAccount(options: {
  auth: unknown;
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
    const result = await accountAdminApi(options.auth).banUser({
      body: {
        userId: target.id,
        banReason: 'Disabled by Production Administrator'
      },
      headers: options.headers
    });
    const view = toAccountView(resultUser(result));
    if (!view) throw new AccountManagementError('ACCOUNT_NOT_FOUND', 'That account is not managed here.', 404);
    return view;
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw mapAuthError(error, 'Unable to disable the account.');
  }
}

export async function restoreAccount(options: {
  auth: unknown;
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
    const result = await accountAdminApi(options.auth).unbanUser({
      body: { userId: target.id },
      headers: options.headers
    });
    const view = toAccountView(resultUser(result));
    if (!view) throw new AccountManagementError('ACCOUNT_NOT_FOUND', 'That account is not managed here.', 404);
    return view;
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw mapAuthError(error, 'Unable to restore the account.');
  }
}

export async function revokeAccountSessions(options: {
  auth: unknown;
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
    await accountAdminApi(options.auth).revokeUserSessions({
      body: { userId: options.userId },
      headers: options.headers
    });
  } catch (error) {
    if (error instanceof AccountManagementError) throw error;
    throw mapAuthError(error, 'Unable to revoke the account sessions.');
  }
}
