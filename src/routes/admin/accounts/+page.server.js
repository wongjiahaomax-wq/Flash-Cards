import { error, fail, redirect } from '@sveltejs/kit';

import {
  AccountManagementError,
  createAccount,
  listAccounts,
  requireProductionAccountManager
} from '$lib/server/accounts/admin-accounts.ts';
import { requestAdminPasswordEmail } from '$lib/server/accounts/password-email.ts';

/** @param {unknown} errorValue */
function accountActionFailure(errorValue, values = {}) {
  if (errorValue instanceof AccountManagementError) {
    return fail(errorValue.status, { error: errorValue.message, ...values });
  }
  return fail(500, { error: 'Unable to update accounts.', ...values });
}

/** @param {Parameters<import('./$types').PageServerLoad>[0]} event */
function requireLoadContext(event) {
  try {
    requireProductionAccountManager(event.locals.user, event.platform?.env);
  } catch (errorValue) {
    if (errorValue instanceof AccountManagementError) error(errorValue.status, errorValue.message);
    throw errorValue;
  }
  if (!event.locals.auth) error(503, 'Authentication is not configured.');
  return event.locals.auth;
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
  const auth = requireLoadContext(event);
  const search = event.url.searchParams.get('q')?.trim() ?? '';
  const searchField = event.url.searchParams.get('field') === 'email' ? 'email' : 'name';
  const parsedPage = Number.parseInt(event.url.searchParams.get('page') ?? '1', 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  try {
    const result = await listAccounts({
      auth,
      headers: event.request.headers,
      search,
      searchField,
      page
    });

    return {
      ...result,
      search,
      searchField,
      status: event.url.searchParams.get('status') ?? ''
    };
  } catch (errorValue) {
    if (errorValue instanceof AccountManagementError) error(errorValue.status, errorValue.message);
    error(500, 'Unable to load accounts.');
  }
}

/** @type {import('./$types').Actions} */
export const actions = {
  create: async (event) => {
    let actorUserId;
    try {
      actorUserId = requireProductionAccountManager(event.locals.user, event.platform?.env);
    } catch (errorValue) {
      return accountActionFailure(errorValue);
    }
    if (!actorUserId || !event.locals.auth || !event.platform?.env) {
      return fail(503, { error: 'Authentication is not configured.' });
    }

    const formData = await event.request.formData();
    const values = {
      name: typeof formData.get('name') === 'string' ? String(formData.get('name')) : '',
      email: typeof formData.get('email') === 'string' ? String(formData.get('email')) : '',
      accountType:
        typeof formData.get('account_type') === 'string' ? String(formData.get('account_type')) : 'learner'
    };

    let result;
    try {
      result = await createAccount({
        auth: event.locals.auth,
        headers: event.request.headers,
        name: values.name,
        email: values.email,
        accountType: values.accountType,
        sendPasswordEmail: (emailAddress, purpose) =>
          requestAdminPasswordEmail(event.platform.env, emailAddress, purpose)
      });
    } catch (errorValue) {
      return accountActionFailure(errorValue, { values });
    }

    const status = result.invitationStatus === 'sent' ? 'created' : 'created-email-failed';
    redirect(303, `/admin/accounts/${encodeURIComponent(result.account.id)}?status=${status}`);
  }
};
