const COUNT_FAILURE_FALLBACK = 'Unable to calculate the combined eligible Case count.';
const COUNT_OUTAGE_SUFFIX = ' You can still start Study.';

/** @typedef {{eligibleCount:number|null,selectedSystemCount:number,countMessage:string,counting:boolean}} StudyCountState */

/** @param {unknown} payload @param {Response|{ok:boolean,status:number}} response */
function countFailureMessage(payload, response) {
  const body = payload && typeof payload === 'object'
    ? /** @type {{message?: unknown}} */ (payload)
    : null;
  const message = typeof body?.message === 'string'
    ? body.message
    : COUNT_FAILURE_FALLBACK;
  const isInvalidScope = response.status >= 400 && response.status < 500;
  return isInvalidScope ? message : `${message}${COUNT_OUTAGE_SUFFIX}`;
}

/**
 * Keep the latest applied-scope count request authoritative for all count UI.
 * @param {(formData: FormData) => Promise<{ok:boolean,status:number,json:() => Promise<any>}>} request
 */
export function createStudyCountController(request) {
  let latestRequestId = 0;
  /** @type {StudyCountState} */
  let state = {
    eligibleCount: null,
    selectedSystemCount: 0,
    countMessage: 'Select one or more Systems to calculate the combined unique Case count.',
    counting: false
  };

  function snapshot() {
    return { ...state };
  }

  /** @param {number} selectedSystemCount */
  function begin(selectedSystemCount) {
    latestRequestId += 1;
    state = {
      eligibleCount: null,
      selectedSystemCount,
      countMessage: 'Updating combined count…',
      counting: false
    };
    return latestRequestId;
  }

  /** @param {FormData} formData @param {number} [requestId] */
  async function refresh(formData, requestId = ++latestRequestId) {
    state = { ...state, counting: true };
    try {
      const response = await request(formData);
      const payload = await response.json();
      if (requestId !== latestRequestId) return snapshot();

      if (!response.ok) {
        state = {
          ...state,
          eligibleCount: null,
          selectedSystemCount: state.selectedSystemCount,
          countMessage: countFailureMessage(payload, response)
        };
        return snapshot();
      }

      state = {
        eligibleCount: Number(payload.candidateCount),
        selectedSystemCount: Number(payload.selectedSystemCount),
        countMessage: 'Server-resolved union; overlapping Cases are counted once.',
        counting: false
      };
      return snapshot();
    } catch (cause) {
      if (requestId !== latestRequestId) return snapshot();
      state = {
        ...state,
        eligibleCount: null,
        selectedSystemCount: state.selectedSystemCount,
        countMessage: `${cause instanceof Error ? cause.message : String(cause)}${COUNT_OUTAGE_SUFFIX}`
      };
      return snapshot();
    } finally {
      if (requestId === latestRequestId) state = { ...state, counting: false };
    }
  }

  return { begin, refresh, snapshot };
}
