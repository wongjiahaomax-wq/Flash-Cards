import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';

/**
 * Better Auth is created from the Cloudflare request environment because D1 is
 * provided as a Worker binding rather than as a process-global connection.
 *
 * Keep this object inline so Better Auth preserves the concrete plugin tuple in
 * its inferred API type (including the Admin plugin's removeUser endpoint).
 *
 * @param {Cloudflare.Env & { BETTER_AUTH_SECRET: string, BETTER_AUTH_URL?: string }} env
 */
export function createAuth(env) {
  if (!env?.DB) {
    throw new Error('The Cloudflare D1 binding DB is required for authentication.');
  }

  if (!env?.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required for authentication.');
  }

  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true
    },
    advanced: {
      database: {
        generateId: 'uuid'
      }
    },
    plugins: [
      admin(),
      // Must remain last so Better Auth can set cookies from SvelteKit server calls.
      sveltekitCookies(getRequestEvent)
    ]
  });
}
