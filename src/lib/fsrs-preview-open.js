/**
 * Browser-only transport helper for opening the next item in an existing FSRS
 * run. Queue selection and active-Review creation remain server-owned by the
 * existing /api/open route and its Part C owners.
 *
 * @param {any} descriptor
 * @param {(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>} [request]
 */
export async function requestNextFsrsPreviewWork(descriptor, request = fetch) {
  const response = await request('/fsrs-preview/api/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descriptor })
  });
  const payload = await response.json();
  return { ok: response.ok, httpStatus: response.status, payload };
}

/** @param {any} payload */
export function fsrsPreviewRunReturnHref(payload) {
  if (payload?.status === 'waiting' && Number.isFinite(Number(payload.nextRepeatDueAt))) {
    return `/fsrs-preview?runStatus=waiting&nextRepeatDueAt=${encodeURIComponent(String(payload.nextRepeatDueAt))}`;
  }
  if (payload?.status === 'new-limit-reached' && Number.isFinite(Number(payload.limit))) {
    return `/fsrs-preview?runStatus=new-limit-reached&limit=${encodeURIComponent(String(payload.limit))}`;
  }
  if (payload?.status === 'complete') return '/fsrs-preview?runStatus=complete';
  if (payload?.status === 'resume') return '/fsrs-preview?runStatus=resume';
  if (payload?.status === 'run-lost') return '/fsrs-preview?runStatus=run-lost';
  return '/fsrs-preview';
}
