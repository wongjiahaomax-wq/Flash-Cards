import { learnerStudyWriteFenceActive } from '$lib/server/learning/learner-study-runtime.js';

export function GET({ platform }) {
  return new Response(JSON.stringify({
    ok: true,
    learnerRuntimeScopeVersion: 2,
    learnerRuntimeWriteFence: learnerStudyWriteFenceActive(platform?.env)
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
