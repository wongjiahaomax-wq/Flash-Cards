/**
 * Browser transport helper for opening the next item in an existing learner
 * Study run. Queue selection and active-Review creation remain server-owned.
 *
 * @param {any} descriptor
 * @param {(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>} [request]
 */
export async function requestNextLearnerStudyWork(descriptor, request = fetch) {
  const response = await request('/study/api/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descriptor })
  });
  const payload = await response.json();
  return { ok: response.ok, httpStatus: response.status, payload };
}

/** @param {any} payload */
export function learnerStudyRunReturnHref(payload) {
  if (payload?.status === 'waiting' && Number.isFinite(Number(payload.nextRepeatDueAt))) {
    return `/study?runStatus=waiting&nextRepeatDueAt=${encodeURIComponent(String(payload.nextRepeatDueAt))}`;
  }
  if (payload?.status === 'new-limit-reached' && Number.isFinite(Number(payload.limit))) {
    return `/study?runStatus=new-limit-reached&limit=${encodeURIComponent(String(payload.limit))}`;
  }
  if (payload?.status === 'complete') return '/study?runStatus=complete';
  if (payload?.status === 'resume') return '/study?runStatus=resume';
  if (payload?.status === 'run-lost') return '/study?runStatus=run-lost';
  return '/study';
}
