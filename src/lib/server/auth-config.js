/**
 * Better Auth options shared by the SvelteKit runtime and isolated integration
 * smokes. Framework cookie bridging is deliberately layered on top by auth.js.
 *
 * @param {Cloudflare.Env & { BETTER_AUTH_SECRET: string, BETTER_AUTH_URL?: string }} env
 */
export function getBetterAuthBaseOptions(env) {
  if (!env?.DB) {
    throw new Error('The Cloudflare D1 binding DB is required for authentication.');
  }

  if (!env?.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required for authentication.');
  }

  return {
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true
    },
    advanced: {
      database: {
        generateId: /** @type {const} */ ('uuid')
      }
    }
  };
}

/**
 * Central identity-root operation used by Production Admin deletion and the
 * PR G Better Auth integration smoke. Keeping the API call here prevents a raw
 * SQL substitute from accidentally becoming the tested path.
 *
 * @param {{ api: { removeUser: (input: { body: { userId: string }, headers?: Headers }) => Promise<unknown> } }} auth
 * @param {{ userId: string, headers?: Headers }} input
 */
export async function removeUserWithBetterAuth(auth, input) {
  return await auth.api.removeUser({
    body: { userId: input.userId },
    headers: input.headers
  });
}
