import { error, fail, redirect } from '@sveltejs/kit';

import {
  AccountManagementError,
  changeProductionRole,
  getAccount,
  requireProductionAccountManager,
  restoreAccount,
  revokeAccountSessions,
  sendAccountPasswordEmail
} from '$lib/server/accounts/admin-accounts.ts';
import {
  demoteProductionAdministratorAtomically,
  disableManagedAccountAtomically
} from '$lib/server/accounts/admin-account-invariants.ts';
import { requestAdminPasswordEmail } from '$lib/server/accounts/password-email.ts';

/** @param {unknown} errorValue */
function actionFailure(errorValue) {
  if (errorValue instanceof AccountManagementError) {
    return fail(errorValue.status, { error: errorValue.message });
  }
  return fail(500, { error: 'Unable to update the account.' });
}

/**
 * @param {{ locals: App.Locals; platform?: App.Platform; request: Request }} event
 */
function requireContext(event) {
  const actorUserId = requireProductionAccountManager(event.locals.user, event.platform?.env);
  const auth = event.locals.auth;
  const env = event.platform?.env;
  if (!auth || !env) {
    throw new AccountManagementError('AUTH_NOT_CONFIGURED', 'Authentication is not configured.', 503);
  }
  return {
    actorUserId,
    auth,
    env,
    headers: event.request.headers
  };
}

/**
 * Production and Preview use separate Better Auth secrets but share D1 user and
 * session rows. Lifecycle/session mutations therefore cannot safely target an
 * identity that also carries Preview Admin authority from this Production UI.
 * Production role changes remain allowed because they explicitly preserve the
 * retained preview_admin role.
 *
 * @param {ReturnType<typeof requireContext>} context
 * @param {string} userId
 */
async function assertProductionSecurityMutationScope(context, userId) {
  const account = await getAccount(context.auth, context.headers, userId);
  if (account.hasPreviewAccess) {
    throw new AccountManagementError(
      'PREVIEW_AUTHORITY_SEPARATE',
      'Production Accounts cannot change lifecycle or revoke sessions for an identity that also has Preview Admin access.',
      409
    );
  }
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
    try {
      const context = requireContext(event);
      await demoteProductionAdministratorAtomically({
        db: context.env.DB,
        auth: context.auth,
        headers: context.headers,
        actorUserId: context.actorUserId,
        userId: event.params.userId
      });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }

    redirect(303, `/admin/accounts/${encodeURIComponent(event.params.userId)}?status=demoted`);
  },

  disable: async (event) => {
    try {
      const context = requireContext(event);
      await assertProductionSecurityMutationScope(context, event.params.userId);
      await disableManagedAccountAtomically({
        db: context.env.DB,
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
      await assertProductionSecurityMutationScope(context, event.params.userId);
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
      await assertProductionSecurityMutationScope(context, event.params.userId);
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
