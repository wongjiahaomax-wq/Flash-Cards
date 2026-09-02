export const LOCAL_FSRS_PREVIEW_PROOF_SECRET =
  'flash-cards-local-fsrs-preview-proof-v1-local-bindings-only';

/** @param {string} hostname */
function isLoopbackHostname(hostname) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || hostname === '[::1]';
}

/**
 * The preview must fail closed on deployed Workers. Requiring both the request
 * URL and the Better Auth binding to be loopback prevents a forged Host header
 * from turning a deployed route into a learner-state mutation surface.
 * @param {URL} url
 * @param {{BETTER_AUTH_URL?: unknown} | undefined} env
 */
export function isLocalFsrsPreviewRequest(url, env) {
  if (!isLoopbackHostname(url.hostname)) return false;
  try {
    const authUrl = new URL(String(env?.BETTER_AUTH_URL ?? ''));
    return isLoopbackHostname(authUrl.hostname);
  } catch {
    return false;
  }
}
