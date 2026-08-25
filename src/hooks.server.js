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

  // Better Auth's Admin plugin remains available to trusted server-side
  // auth.api.* calls, but its generic HTTP Admin surface must never be public.
  // Those endpoints include role, password, ban and hard-delete operations that
  // would bypass the product-level self-lockout/last-Admin/lifecycle contracts.
  // Keep every /api/auth/admin/* request fail-closed on both Production and
  // Preview Workers; privileged account operations go through /admin/accounts.
  if (isRouteWithin(pathname, '/api/auth/admin')) {
    return forbidden('Direct Better Auth user administration is unavailable. Use the Production Admin Accounts workflow.');
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

  // A pure preview_admin identity must never create or mutate ordinary learner
  // Reviews. A user,preview_admin learner may Study on Production, while an
  // admin,preview_admin owner keeps the existing Admin + Study behavior. The
  // Preview Worker boundary above still blocks Study regardless of role.
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
