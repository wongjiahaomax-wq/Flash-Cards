import { redirect } from '@sveltejs/kit';

import { isProductionAdmin } from '$lib/server/preview-auth.js';

export function load({ locals, url }) {
  if (!locals.user) {
    const destination = encodeURIComponent(url.pathname + url.search);
    redirect(303, `/sign-in?redirect=${destination}`);
  }

  if (!isProductionAdmin(locals.user)) {
    redirect(303, '/study');
  }

  return {
    user: locals.user
  };
}
