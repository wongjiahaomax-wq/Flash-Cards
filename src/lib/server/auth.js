import { getRequestEvent } from '$app/server';
import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';

import { getBetterAuthBaseOptions } from './auth-config.js';

/**
 * Better Auth is created from the Cloudflare request environment because D1 is
 * provided as a Worker binding rather than as a process-global connection.
 *
 * Keep the concrete plugin tuple inline so Better Auth preserves the Admin
 * plugin's removeUser endpoint in the inferred API type. Shared non-framework
 * options live in auth-config.js so integration smokes exercise the same pinned
 * database/auth configuration without fabricating a SvelteKit request event.
 *
 * @param {Cloudflare.Env & { BETTER_AUTH_SECRET: string, BETTER_AUTH_URL?: string }} env
 */
export function createAuth(env) {
  return betterAuth({
    ...getBetterAuthBaseOptions(env),
    plugins: [
      admin(),
      // Must remain last so Better Auth can set cookies from SvelteKit server calls.
      sveltekitCookies(getRequestEvent)
    ]
  });
}
