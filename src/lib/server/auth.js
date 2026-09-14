import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';
import { sveltekitCookies } from 'better-auth/svelte-kit';

import { getBetterAuthBaseOptions } from './auth-config.js';
import {
  PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS,
  sendPasswordResetEmail
} from './email/password-reset.ts';
import { sendTransactionalEmail } from './email/resend.ts';
import { EmailDeliveryError } from './email/transactional.ts';

/** @typedef {'reset' | 'account-setup'} PasswordEmailPurpose */
/** @typedef {'sent' | 'failed'} PasswordEmailDeliveryResult */
/** @typedef {{
 *   passwordEmailPurpose?: PasswordEmailPurpose,
 *   awaitPasswordEmailDelivery?: boolean,
 *   onPasswordEmailDeliveryResult?: (result: PasswordEmailDeliveryResult) => void
 * }} CreateAuthOptions */

// preview_admin is a retained application role, not a production Admin role.
// Register it explicitly so production role changes can preserve it without
// granting Preview-only identities Better Auth Admin permissions.
const accountAdminAccessControl = createAccessControl(defaultStatements);
const accountAdminRoles = {
  admin: accountAdminAccessControl.newRole(adminAc.statements),
  user: accountAdminAccessControl.newRole({}),
  preview_admin: accountAdminAccessControl.newRole({})
};

/** @param {Promise<unknown>} task */
function scheduleAuthBackgroundTask(task) {
  const safeTask = task.catch(() => {
    // Do not log the rejection: it may contain a reset URL, token, or provider
    // request details. The delivery callback below handles expected failures.
  });

  try {
    const executionContext = getRequestEvent().platform?.ctx;
    if (executionContext?.waitUntil) {
      executionContext.waitUntil(safeTask);
      return;
    }
  } catch {
    // Direct auth API tests and local non-Worker tools have no request event.
  }

  // There is no Worker lifetime to attach to in ordinary local Vite/Node
  // execution. Keep the response non-blocking and allow the local process to
  // finish the task when it remains alive.
  void safeTask;
}

/**
 * Better Auth is created from the Cloudflare request environment because D1 is
 * provided as a Worker binding rather than as a process-global connection.
 *
 * Keep the concrete plugin tuple inline so Better Auth preserves the Admin
 * plugin's removeUser endpoint in the inferred API type. Shared non-framework
 * options live in auth-config.js so integration smokes exercise the same pinned
 * database/auth configuration without fabricating a SvelteKit request event.
 *
 * @param {Cloudflare.Env & {
 *   BETTER_AUTH_SECRET: string,
 *   BETTER_AUTH_URL?: string,
 *   RESEND_API_KEY?: string,
 *   AUTH_EMAIL_FROM?: string
 * }} env
 * @param {CreateAuthOptions} [config]
 */
export function createAuth(env, config = {}) {
  const baseOptions = getBetterAuthBaseOptions(env);
  const passwordEmailPurpose = config.passwordEmailPurpose ?? 'reset';

  return betterAuth({
    ...baseOptions,
    emailAndPassword: {
      ...baseOptions.emailAndPassword,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        if (config.awaitPasswordEmailDelivery) {
          try {
            await sendPasswordResetEmail({
              env,
              to: user.email,
              betterAuthResetUrl: url,
              token,
              purpose: passwordEmailPurpose,
              sendEmail: (emailEnv, message) => sendTransactionalEmail(emailEnv, message)
            });
            config.onPasswordEmailDeliveryResult?.('sent');
          } catch (error) {
            config.onPasswordEmailDeliveryResult?.('failed');
            throw error;
          }
          return;
        }

        try {
          await sendPasswordResetEmail({
            env,
            to: user.email,
            betterAuthResetUrl: url,
            token,
            purpose: passwordEmailPurpose,
            sendEmail: (emailEnv, message) => sendTransactionalEmail(emailEnv, message)
          });
        } catch (error) {
          const status = error instanceof EmailDeliveryError ? error.status : null;
          console.error(
            status
              ? `Password reset email delivery failed with provider status ${status}.`
              : 'Password reset email delivery failed.'
          );
        }
      }
    },
    advanced: {
      ...baseOptions.advanced,
      ...(config.awaitPasswordEmailDelivery
        ? {}
        : {
            backgroundTasks: {
              handler: scheduleAuthBackgroundTask
            }
          })
    },
    plugins: [
      admin({
        ac: accountAdminAccessControl,
        roles: accountAdminRoles
      }),
      // Must remain last so Better Auth can set cookies from SvelteKit server calls.
      sveltekitCookies(getRequestEvent)
    ]
  });
}
