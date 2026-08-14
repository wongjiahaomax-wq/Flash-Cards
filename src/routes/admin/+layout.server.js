import { redirect } from '@sveltejs/kit';

/** @param {NonNullable<App.Locals['user']>} user */
function hasAdminRole(user) {
  const roles = String(user.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);

  return roles.includes('admin');
}

export function load({ locals, url }) {
  if (!locals.user) {
    const destination = encodeURIComponent(url.pathname + url.search);
    redirect(303, `/sign-in?redirect=${destination}`);
  }

  if (!hasAdminRole(locals.user)) {
    redirect(303, '/study');
  }

  return {
    user: locals.user
  };
}
