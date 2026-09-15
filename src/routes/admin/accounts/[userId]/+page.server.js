import { error, fail, redirect } from '@sveltejs/kit';

import { removeUserWithBetterAuth } from '$lib/server/auth-config.js';
import { createDb } from '$lib/server/db/index.js';
import {
  LearnerAccountDeletionError,
  continueExistingLearnerAccountDeletion,
  getLearnerAccountDeletionStatus,
  startConfirmedLearnerAccountDeletion
} from '$lib/server/db/learner-account-deletion.ts';
import {
  AccountManagementError,
  changeProductionRole,
  getAccount,
  requireProductionAccountManager,
  restoreAccount,
  revokeAccountSessions,
  setBetaLearnerPassword,
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
  if (errorValue instanceof LearnerAccountDeletionError) {
    return fail(errorValue.code === 'learner-not-found' ? 404 : 409, { error: errorValue.message });
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
  if (!env.DB) {
    throw new AccountManagementError('DB_NOT_CONFIGURED', 'The application database is not configured.', 503);
  }
  return {
    actorUserId,
    auth,
    env,
    db: env.DB,
    learningDb: createDb(env.DB),
    headers: event.request.headers
  };
}

/** @param {ReturnType<typeof requireContext>} context @param {string} userId */
async function getLearnerDeletionTarget(context, userId) {
  const account = await getAccount(context.auth, context.headers, userId, context.db);
  if (account.status === 'Deletion in progress') {
    throw new AccountManagementError(
      'ACCOUNT_DELETION_IN_PROGRESS',
      'Deletion in progress. Use Continue deletion to finish it.',
      409
    );
  }
  if (account.accountType !== 'Learner' || account.hasPreviewAccess) {
    throw new AccountManagementError(
      'ACCOUNT_DELETE_FORBIDDEN',
      'Only normal Learner accounts without Preview Admin access can be permanently deleted. Demote an Administrator first.',
      409
    );
  }
  return account;
}

/** @param {ReturnType<typeof requireContext>} context @param {string} userId @param {{ readyForIdentityDelete?: boolean } | null | undefined} progress */
async function removeWhenReady(context, userId, progress) {
  if (!progress?.readyForIdentityDelete) return false;
  await removeUserWithBetterAuth(context.auth, {
    userId,
    headers: context.headers
  });
  return true;
}

/** @param {string} userId @param {boolean} deleted */
function deletionRedirect(userId, deleted) {
  if (deleted) redirect(303, '/admin/accounts?status=deleted');
  redirect(303, `/admin/accounts/${encodeURIComponent(userId)}?status=deletion-progress`);
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
  const account = await getAccount(context.auth, context.headers, userId, context.db);
  if (account.status === 'Deletion in progress') {
    throw new AccountManagementError(
      'ACCOUNT_DELETION_IN_PROGRESS',
      'Deletion in progress. Continue deletion before changing this account.',
      409
    );
  }
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
    const account = await getAccount(context.auth, context.headers, event.params.userId, context.db);
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
        db: context.db,
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
        db: context.db,
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

  setBetaPassword: async (event) => {
    try {
      const context = requireContext(event);
      const formData = await event.request.formData();
      await setBetaLearnerPassword({
        auth: context.auth,
        headers: context.headers,
        db: context.db,
        userId: event.params.userId,
        password: formData.get('newPassword')
      });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    redirect(303, `/admin/accounts/${encodeURIComponent(event.params.userId)}?status=beta-password-set`);
  },

  promote: async (event) => {
    try {
      const context = requireContext(event);
      await changeProductionRole({
        auth: context.auth,
        headers: context.headers,
        db: context.db,
        actorUserId: context.actorUserId,
        userId: event.params.userId,
        accountType: 'administrator'
      });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    redirect(303, `/admin/accounts/${encodeURIComponent(event.params.userId)}?status=promoted`);
  },

  deleteLearner: async (event) => {
    let context;
    let target;
    try {
      context = requireContext(event);
      target = await getLearnerDeletionTarget(context, event.params.userId);
    } catch (errorValue) {
      return actionFailure(errorValue);
    }

    const formData = await event.request.formData();
    const confirmIdentifierValue = formData.get('confirmIdentifier') ?? formData.get('confirmEmail');
    const confirmIdentifier = typeof confirmIdentifierValue === 'string'
      ? String(confirmIdentifierValue).trim()
      : '';
    const expectedIdentifier = target.betaUsername ?? target.email;
    if (!confirmIdentifier || confirmIdentifier.toLowerCase() !== expectedIdentifier.toLowerCase()) {
      return fail(400, {
        error: `Type the target account ${target.betaUsername ? 'beta username' : 'email'} exactly to confirm permanent deletion.`
      });
    }

    let deleted;
    try {
      const progress = await startConfirmedLearnerAccountDeletion({
        db: context.learningDb,
        userId: target.id
      });
      deleted = await removeWhenReady(context, target.id, progress);
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    deletionRedirect(target.id, deleted);
  },

  continueDeletion: async (event) => {
    let context;
    let target;
    try {
      context = requireContext(event);
      target = await getAccount(context.auth, context.headers, event.params.userId, context.db);
      const deletion = await getLearnerAccountDeletionStatus(context.learningDb, target.id);
      if (!deletion.inProgress || !target.deletionPhase) {
        throw new AccountManagementError(
          'ACCOUNT_DELETION_NOT_IN_PROGRESS',
          'There is no confirmed learner account deletion to continue.',
          409
        );
      }
      if (target.accountType !== 'Learner' || target.hasPreviewAccess) {
        throw new AccountManagementError(
          'ACCOUNT_DELETE_FORBIDDEN',
          'Only a normal Learner account can continue staged deletion.',
          409
        );
      }
    } catch (errorValue) {
      return actionFailure(errorValue);
    }

    let deleted;
    try {
      const progress = await continueExistingLearnerAccountDeletion({
        db: context.learningDb,
        userId: target.id
      });
      deleted = await removeWhenReady(context, target.id, progress);
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    deletionRedirect(target.id, deleted);
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
        db: context.db,
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
        db: context.db,
        actorUserId: context.actorUserId,
        userId: event.params.userId
      });
    } catch (errorValue) {
      return actionFailure(errorValue);
    }
    redirect(303, `/admin/accounts/${encodeURIComponent(event.params.userId)}?status=sessions-revoked`);
  }
};
