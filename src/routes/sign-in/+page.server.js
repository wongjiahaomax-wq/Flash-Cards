import { redirect } from '@sveltejs/kit';

import { isPreviewWorker } from '$lib/server/preview-auth.js';

export function load({ locals, platform }) {
  const defaultDestination = isPreviewWorker(platform?.env) ? '/preview-admin' : '/admin';
  if (locals.user) redirect(303, defaultDestination);

  return {
    authConfigured: Boolean(locals.auth),
    defaultDestination
  };
}
