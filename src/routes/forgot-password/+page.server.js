import { fail } from '@sveltejs/kit';

const GENERIC_RESET_MESSAGE = 'If an account exists for that email address, we’ve sent password reset instructions.';

export function load({ locals }) {
  return {
    authConfigured: Boolean(locals.auth)
  };
}

export const actions = {
  default: async ({ request, locals }) => {
    const formData = await request.formData();
    const email = String(formData.get('email') ?? '').trim();

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return fail(400, { error: 'Enter a valid email address.' });
    }

    if (locals.auth) {
      try {
        await locals.auth.api.requestPasswordReset({
          body: { email },
          headers: request.headers
        });
      } catch {
        // Keep delivery/provider/database failures generic. The public result
        // must not reveal whether Better Auth found an account.
      }
    }

    return { submitted: true, message: GENERIC_RESET_MESSAGE };
  }
};
