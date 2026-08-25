import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';
import { sveltekitCookies } from 'better-auth/svelte-kit';

import {
  PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS,
  sendPasswordResetEmail
} from '$lib/server/email/password-reset.ts';
import { sendTransactionalEmail } from '$lib/server/email/resend.ts';
import { EmailDeliveryError } from '$lib/server/email/transactional.ts';

/** @typedef {'reset' | 'account-setup'} PasswordEmailPurpose */
/** @typedef {'sent' | 'failed'} PasswordEmailDeliveryResult */
/** @typedef {{
 *   passwordEmailPurpose?: PasswordEmailPurpose,
 *   awaitPasswordEmailDelivery?: boolean,
 *   onPasswordEmailDeliveryResult?: (result: PasswordEmailDeliveryResult) => void
 * }} CreateAuthOptions */

// Better Auth 1.6.25 validates Admin plugin role mutations against configured
// roles. preview_admin is a retained application role, but it must never gain
// production user/session administration permissions. Register it explicitly
// with the same empty permission set as an ordinary user so combined
// admin,preview_admin identities can preserve Preview access across production
// role changes without making Preview-only identities production Admins.
const accountAdminAccessControl = createAccessControl(defaultStatements);
const accountAdminRoles = {
  admin: accountAdminAccessControl.newRole(adminAc.statements),
  user: accountAdminAccessControl.newRole({}),
  preview_admin: accountAdminAccessControl.newRole({})
};

/** @param {Promise<unknown>} task */
function scheduleAuthBackgroundTask(task) {
  const safeTask = task.catch(() => {
    // Never log the rejected value here: authentication background work can
    // include password-reset URLs/tokens or provider request details.
    console.error('Background authentication task failed.');
  });

  try {
    const executionContext = getRequestEvent().platform?.ctx;
    if (executionContext?.waitUntil) {
      executionContext.waitUntil(safeTask);
      return;
    }
  } catch {
    // Some non-request test/tooling contexts do not expose a SvelteKit event.
  }

  // Local Vite/Node development has no Worker ExecutionContext. Do not make the
  // browser response wait on email-provider latency; the local process normally
  // remains alive long enough for this promise to complete.
  void safeTask;
}

/**
 * Better Auth is created from the Cloudflare request environment because D1 is
 * provided as a Worker binding rather than as a process-global connection.
 *
 * The optional delivery mode is reserved for authenticated server workflows
 * such as Admin account invitations that must report provider failure. Public
 * forgot-password requests use the default background mode to resist timing
 * enumeration.
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
  if (!env?.DB) {
    throw new Error('The Cloudflare D1 binding DB is required for authentication.');
  }

  if (!env?.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required for authentication.');
  }

  const passwordEmailPurpose = config.passwordEmailPurpose ?? 'reset';

  /** @type {import('better-auth').BetterAuthOptions} */
  const options = {
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
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
              sendEmail: sendTransactionalEmail
            });
            config.onPasswordEmailDeliveryResult?.('sent');
          } catch (error) {
            // Better Auth 1.6.25 catches sendResetPassword failures inside
            // runInBackgroundOrAwait. Preserve its reset-token ownership while
            // exposing only a non-sensitive result to authenticated Admin flows.
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
            sendEmail: sendTransactionalEmail
          });
        } catch (error) {
          // Delivery happens outside the learner-facing request lifetime. Keep
          // operational logging intentionally free of email addresses, reset
          // URLs, tokens, provider bodies and credentials.
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
      database: {
        generateId: 'uuid'
      },
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
  };

  if (env.BETTER_AUTH_URL) {
    options.baseURL = env.BETTER_AUTH_URL;
  }

  return betterAuth(options);
}
