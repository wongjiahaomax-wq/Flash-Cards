import {
  isFsrsPreviewRunDescriptor,
  isFsrsPreviewRunOwnedBy
} from '../../fsrs-preview-run-storage.js';

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

/**
 * Keep Admin learner-study links on the current production runtime unless the
 * exact same fail-closed local guard that protects /fsrs-preview succeeds.
 * @param {URL} url
 * @param {{BETTER_AUTH_URL?: unknown} | undefined} env
 */
export function getLearnerStudyPreviewHref(url, env) {
  return isLocalFsrsPreviewRequest(url, env) ? '/fsrs-preview' : '/study';
}

/**
 * Browser-local preview runs are learner-owned state. Validate both descriptor
 * structure and ownership before any active-Review lookup or open mutation.
 * @param {unknown} descriptor
 * @param {string} userId
 */
export function validateLocalFsrsPreviewRunOwner(descriptor, userId) {
  if (!isFsrsPreviewRunDescriptor(descriptor)) {
    return {
      ok: false,
      status: 400,
      message: 'Preview run descriptor is invalid or unsupported.'
    };
  }
  if (!isFsrsPreviewRunOwnedBy(descriptor, userId)) {
    return {
      ok: false,
      status: 403,
      message: 'This preview run belongs to another learner. Plan a new run for the signed-in account.'
    };
  }
  return { ok: true, descriptor };
}
