import { error, redirect } from '@sveltejs/kit';

import { getLearnerStudyPreviewHref } from '$lib/server/learning/local-fsrs-preview.js';
import { isPreviewWorker, isProductionAdmin } from '$lib/server/preview-auth.js';

export function load({ locals, platform, url }) {
  if (isPreviewWorker(platform?.env)) {
    error(403, 'Production Admin is unavailable on the Preview Worker.');
  }

  if (!locals.user) {
    const destination = encodeURIComponent(url.pathname + url.search);
    redirect(303, `/sign-in?redirect=${destination}`);
  }

  if (!isProductionAdmin(locals.user)) {
    redirect(303, '/study');
  }

  return {
    user: locals.user,
    learnerStudyPreviewHref: getLearnerStudyPreviewHref(url, platform?.env)
  };
}
