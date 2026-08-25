import { error, fail, redirect } from '@sveltejs/kit';

import {
  AccountManagementError,
  changeProductionRole,
  disableAccount,
  getAccount,
  requireProductionAccountManager,
  restoreAccount,
  revokeAccountSessions,
  sendAccountPasswordEmail
} from '$lib/server/accounts/admin-accounts.ts';
import { requestAdminPasswordEmail } from '$lib/server/accounts/password-email.ts';

/** @param {unknown} errorValue */
function actionFailure(errorValue) {
  if (errorValue instanceof AccountManagementError) {
    return fail(errorValue.status, { error: errorValue.message });
  }
  return fail(500, { error: 'Unable to update the account.' });
}

/** @param {Parameters<import('./$types').PageServerLoad>[0]} event */
function requireContext(event) {
  const actorUserId = requireProductionAccountManager(event.locals.user, event.platform?.env);
  if (!event.locals.auth || !event.platform?.env) {
    throw new AccountManagementError('AUTH_NOT_CONFIGURED', 'Authentication is not configured.', 503);
  }
  return {
    actorUserId,
    auth: event.locals.auth,
    env: event.platform.env,
    headers: event.request.headers
  };
}

/** @type {import('./$types').PageServerLoad} */
export async function load(event) {
  let context;
  try {
    context = requireContext(event);
    const account = await getAccount(context.auth, context.headers, event.params.userId);
    return {
      account,
      isCurrentAccount: account.id === context.actorUserId,
      status: event.url.searchParams.get('status') ?? ''
    };
  } catch (errorValue) {
    if (errorValue instanceof AccountManagementError) error(errorValue.status, errorValue.message);
    error(500, 'Unable to load the account.');
  }
}

/** @type {import('./$types').Actions} */
export const actions = {
  sendSetPassword: async (event) => {
    try {
      const context = requireContext(event);
      await sendAccountPasswordEmail({
        auth: context.auth,
        headers: context.headers,
        userId: event.params.userId,
        purpose: 'account-setup',
        sendPasswordEmail: (emailAddress, purpose) =>
          requestAdminPasswordEmail(context.env, emailAddress, purpose)
      });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    redirect(303, `/admin/accounts/${encodeURIComponent(event.params.userId)}?status=set-password-sent`);
  },

  sendPasswordReset: async (event) => {
    try {
      const context = requireContext(event);
      await sendAccountPasswordEmail({
        auth: context.auth,
        headers: context.headers,
        userId: event.params.userId,
        purpose: 'reset',
        sendPasswordEmail: (emailAddress, purpose) =>
          requestAdminPasswordEmail(context.env, emailAddress, purpose)
      });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    redirect(303, `/admin/accounts/${encodeURIComponent(event.params.userId)}?status=password-reset-sent`);
  },

  promote: async (event) => {
    try {
      const context = requireContext(event);
      await changeProductionRole({
        auth: context.auth,
        headers: context.headers,
        actorUserId: context.actorUserId,
        userId: event.params.userId,
        accountType: 'administrator'
      });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    redirect(303, `/admin/accounts/${encodeURIComponent(event.params.userId)}?status=promoted`);
  },

  demote: async (event) => {
    let updated;
    try {
      const context = requireContext(event);
      updated = await changeProductionRole({
        auth: context.auth,
        headers: context.headers,
        actorUserId: context.actorUserId,
        userId: event.params.userId,
        accountType: 'learner'
      });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }

    if (!updated) redirect(303, '/admin/accounts?status=demoted-preview-retained');
    redirect(303, `/admin/accounts/${encodeURIComponent(event.params.userId)}?status=demoted`);
  },

  disable: async (event) => {
    try {
      const context = requireContext(event);
      await disableAccount({
        auth: context.auth,
        headers: context.headers,
        actorUserId: context.actorUserId,
        userId: event.params.userId
      });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    redirect(303, `/admin/accounts/${encodeURIComponent(event.params.userId)}?status=disabled`);
  },

  restore: async (event) => {
    try {
      const context = requireContext(event);
      await restoreAccount({
        auth: context.auth,
        headers: context.headers,
        userId: event.params.userId
      });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    redirect(303, `/admin/accounts/${encodeURIComponent(event.params.userId)}?status=restored`);
  },

  revokeSessions: async (event) => {
    try {
      const context = requireContext(event);
      await revokeAccountSessions({
        auth: context.auth,
        headers: context.headers,
        actorUserId: context.actorUserId,
        userId: event.params.userId
      });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    redirect(303, `/admin/accounts/${encodeURIComponent(event.params.userId)}?status=sessions-revoked`);
  }
};
