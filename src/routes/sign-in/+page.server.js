import { redirect } from '@sveltejs/kit';

export function load({ locals }) {
  if (locals.user) {
    redirect(303, '/admin');
  }

  return {
    authConfigured: Boolean(locals.auth)
  };
}
