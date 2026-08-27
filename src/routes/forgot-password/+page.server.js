export function load({ locals }) {
  return {
    authConfigured: Boolean(locals.auth)
  };
}
