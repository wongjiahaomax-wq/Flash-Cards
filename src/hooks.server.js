import { building } from '$app/environment';
import { svelteKitHandler } from 'better-auth/svelte-kit';

import { createAuth } from '$lib/server/auth.js';
import { isPreviewOnlyAdmin, isPreviewWorker } from '$lib/server/preview-auth.js';

/** @param {string} pathname @param {string} root */
function isRouteWithin(pathname, root) {
  return pathname === root || pathname.startsWith(`${root}/`);
}

/** @param {string} message */
function forbidden(message) {
  return new Response(message, {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  });
}

export async function handle({ event, resolve }) {
  // SvelteKit's build step has no request-scoped Cloudflare bindings.
  if (building) {
    return resolve(event);
  }

  const env = event.platform?.env;
  const pathname = event.url.pathname;

  // The Preview Worker shares production D1/R2, so production Admin and learner
  // Study routes fail closed before any page/action code can run. This also
  // protects direct POSTs that would not be secured by a layout load alone.
  if (isPreviewWorker(env) && isRouteWithin(pathname, '/admin')) {
    return forbidden('Production Admin is unavailable on the Preview Worker. Use the dedicated Preview Admin workspace.');
  }
  if (isPreviewWorker(env) && isRouteWithin(pathname, '/study')) {
    return forbidden('Learner Study is unavailable on the Preview Worker.');
  }

  // Better Auth's Admin plugin is mounted below /api/auth/admin. The Preview
  // Worker shares the production auth tables, so those privileged endpoints
  // must fail closed before Better Auth handles the request. Ordinary auth
  // endpoints such as sign-in, sign-out and get-session remain available.
  if (isPreviewWorker(env) && isRouteWithin(pathname, '/api/auth/admin')) {
    return forbidden('Better Auth user administration is unavailable on the Preview Worker.');
  }

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

  // Preview-only identities must never create or mutate ordinary learner
  // Reviews. A combined production Admin + Preview Admin owner may use the
  // production learner flow; the Preview Worker boundary above still blocks
  // Study regardless of role.
  if (isPreviewOnlyAdmin(event.locals.user) && isRouteWithin(pathname, '/study')) {
    return forbidden('Preview-only Admin accounts cannot use learner Study.');
  }

  return svelteKitHandler({
    event,
    resolve,
    auth,
    building
  });
}
