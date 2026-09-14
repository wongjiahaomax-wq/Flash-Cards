import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';

import { getBetterAuthBaseOptions } from './auth-config.js';
import {
  PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS,
  sendPasswordResetEmail
} from './email/password-reset.ts';
import { sendTransactionalEmail } from './email/resend.ts';
import { EmailDeliveryError } from './email/transactional.ts';

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
 */
export function createAuth(env) {
  const baseOptions = getBetterAuthBaseOptions(env);

  return betterAuth({
    ...baseOptions,
    emailAndPassword: {
      ...baseOptions.emailAndPassword,
      resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_EXPIRES_IN_SECONDS,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        try {
          await sendPasswordResetEmail({
            env,
            to: user.email,
            betterAuthResetUrl: url,
            token,
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
      backgroundTasks: {
        handler: scheduleAuthBackgroundTask
      }
    },
    plugins: [
      admin(),
      // Must remain last so Better Auth can set cookies from SvelteKit server calls.
      sveltekitCookies(getRequestEvent)
    ]
  });
}
