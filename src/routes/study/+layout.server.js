import { error, redirect } from '@sveltejs/kit';

import { isPreviewAdmin, isPreviewWorker } from '$lib/server/preview-auth.js';

export function load({ locals, platform, url }) {
  if (isPreviewWorker(platform?.env)) {
    error(403, 'Learner Study is unavailable on the Preview Worker.');
  }

  if (!locals.user) {
    const destination = encodeURIComponent(url.pathname + url.search);
    redirect(303, `/sign-in?redirect=${destination}`);
  }

  if (isPreviewAdmin(locals.user)) {
    error(403, 'Preview Admin accounts cannot use learner Study.');
  }

  return {
    user: locals.user
  };
}
