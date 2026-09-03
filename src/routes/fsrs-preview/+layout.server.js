import { error, redirect } from '@sveltejs/kit';

import { isLocalFsrsPreviewRequest } from '$lib/server/learning/local-fsrs-preview.js';

export function load({ locals, platform, url }) {
  if (!isLocalFsrsPreviewRequest(url, platform?.env)) {
    error(404, 'Local FSRS preview is available only from the local development runtime.');
  }
  if (!locals.user) {
    const destination = encodeURIComponent(url.pathname + url.search);
    redirect(303, `/sign-in?redirect=${destination}`);
  }
  if (!platform?.env?.DB) error(503, 'Local D1 is not configured.');
  return { user: locals.user };
}
