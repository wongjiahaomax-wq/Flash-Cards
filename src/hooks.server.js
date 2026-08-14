import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { createAuth } from '$lib/server/auth.js';

export async function handle({ event, resolve }) {
  // SvelteKit's build step has no request-scoped Cloudflare bindings.
  if (building) {
    return resolve(event);
  }

  const env = event.platform?.env;

  // Keep the non-authenticated scaffold buildable until D1 and secrets are bound.
  // Once Cloudflare setup is complete these bindings are mandatory at runtime.
  if (!env?.DB || !env?.BETTER_AUTH_SECRET) {
    event.locals.auth = null;
    event.locals.session = null;
    event.locals.user = null;
    return resolve(event);
  }

  const auth = createAuth(env);
  event.locals.auth = auth;

  const session = await auth.api.getSession({
    headers: event.request.headers
  });

  event.locals.session = session?.session ?? null;
  event.locals.user = session?.user ?? null;

  return svelteKitHandler({
    event,
    resolve,
    auth,
    building
  });
}
