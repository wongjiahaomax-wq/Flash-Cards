import { learnerStudyWriteFenceActive } from '$lib/server/learning/learner-study-runtime.js';

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const WORKER_VERSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @param {App.Platform['env'] | undefined} env */
function runtimeBuildSha(env) {
  const value = String(env?.APP_BUILD_SHA ?? '').trim();
  return COMMIT_SHA_PATTERN.test(value) ? value.toLowerCase() : null;
}

/** @param {App.Platform['env'] | undefined} env */
function runtimeWorkerVersion(env) {
  const value = String(env?.CF_VERSION_METADATA?.id ?? '').trim();
  return WORKER_VERSION_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function GET({ platform }) {
  return new Response(JSON.stringify({
    ok: true,
    learnerRuntimeCutoverVersion: 2,
    learnerRuntimeScopeVersion: 2,
    learnerRuntimeWriteFence: learnerStudyWriteFenceActive(platform?.env),
    learnerRuntimeBuildSha: runtimeBuildSha(platform?.env),
    learnerRuntimeWorkerVersion: runtimeWorkerVersion(platform?.env)
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
