import { redirect } from '@sveltejs/kit';

export function load({ locals, url }) {
  if (!locals.user) {
    const destination = encodeURIComponent(url.pathname + url.search);
    redirect(303, `/sign-in?redirect=${destination}`);
  }

  return {
    user: locals.user
  };
}
