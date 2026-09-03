import {
  hasReachedStudyRunDistinctCaseTarget,
  isStudyRunDistinctCaseTarget
} from './study-run-size.js';

const MAX_CONSECUTIVE_NEW = 50;

/** @typedef {'due'|'new'|'repeat'} ScheduledQueueClass */
/** @typedef {{queueClass:ScheduledQueueClass,caseId:string,stateRevision?:number,dueAt?:number,workProof:string}} ScheduledWork */
/** @typedef {{status:'ready',work:ScheduledWork}|{status:'waiting',nextRepeatDueAt:number}|{status:'new-limit-reached',limit:number}|{status:'complete'}} ScheduledWorkSelection */

export class ScheduledStudyRunError extends Error {
  /** @param {'invalid-descriptor'|'invalid-time'|'work-mismatch'|'review-in-progress'} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'ScheduledStudyRunError';
    this.code = code;
  }
}

/** @param {any} descriptor */
function assertDescriptor(descriptor) {
  if (
    !descriptor
    || descriptor.kind !== 'scheduled'
    || descriptor.version !== 1
    || !isStudyRunDistinctCaseTarget(descriptor.distinctCaseTarget)
  ) {
    throw new ScheduledStudyRunError('invalid-descriptor', 'Scheduled run descriptor is invalid or unsupported.');
  }
}

/** @param {unknown} value */
function finiteTime(value) {
  const normalized = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(normalized)) {
    throw new ScheduledStudyRunError('invalid-time', 'Scheduled work selection requires server-authoritative time.');
  }
  return normalized;
}

/** @param {any} descriptor @param {'due'|'new'} queueClass @param {any} entry @returns {ScheduledWork} */
function capturedWork(descriptor, queueClass, entry) {
  const proofs = descriptor.membershipProofs?.[queueClass];
  const workProof = Array.isArray(proofs) ? proofs[entry.proofIndex] : null;
  if (typeof workProof !== 'string' || !workProof) {
    throw new ScheduledStudyRunError('invalid-descriptor', `Captured ${queueClass} work proof is missing.`);
  }
  return {
    queueClass,
    caseId: entry.caseId,
    ...(queueClass === 'due'
      ? { stateRevision: Number(entry.stateRevision), dueAt: Number(entry.dueAt) }
      : {}),
    workProof
  };
}

/** @param {any} descriptor */
function firstDue(descriptor) {
  return descriptor.capturedDue?.[Number(descriptor.duePosition) || 0] ?? null;
}

/** @param {any} descriptor */
function firstNew(descriptor) {
  return descriptor.capturedNew?.[Number(descriptor.newPosition) || 0] ?? null;
}

/** @param {any[]} repeatEntries @param {number} serverNow */
function firstFutureRepeat(repeatEntries, serverNow) {
  return repeatEntries
    .filter((entry) => Number(entry.dueAt) > serverNow)
    .sort((left, right) => Number(left.dueAt) - Number(right.dueAt))[0] ?? null;
}

/**
 * Choose the next browser-local Scheduled work item. Repeat maturity must be
 * evaluated with a server-authoritative timestamp supplied by the caller; this
 * helper intentionally has no Date.now()/browser-clock fallback.
 *
 * A learner-selected distinct-Case target limits only the introduction of
 * captured Due/New Cases. Matured repeats remain first-class work, and future
 * required repeats keep the run waiting even after the distinct target is met.
 *
 * @param {any} descriptor
 * @param {{serverNow:number|Date,scheduledOrder?:'due_first'|'new_first'}} input
 * @returns {ScheduledWorkSelection}
 */
export function selectNextScheduledWork(descriptor, input) {
  assertDescriptor(descriptor);
  if (descriptor.currentReviewId) {
    throw new ScheduledStudyRunError('review-in-progress', 'Finish or discard the current Review before selecting more work.');
  }
  const serverNow = finiteTime(input.serverNow);
  const repeatEntries = /** @type {any[]} */ (descriptor.repeatEntries ?? []);
  const maturedRepeats = repeatEntries
    .filter((entry) => Number(entry.dueAt) <= serverNow)
    .sort((left, right) => Number(left.dueAt) - Number(right.dueAt) || String(left.caseId).localeCompare(String(right.caseId)));
  const matured = maturedRepeats[0];
  if (matured) {
    if (typeof matured.workProof !== 'string' || !matured.workProof) {
      throw new ScheduledStudyRunError('invalid-descriptor', 'Repeat work proof is missing.');
    }
    return {
      status: 'ready',
      work: {
        queueClass: 'repeat',
        caseId: matured.caseId,
        stateRevision: Number(matured.stateRevision),
        dueAt: Number(matured.dueAt),
        workProof: matured.workProof
      }
    };
  }

  const completedDistinctCases = new Set(descriptor.completedCaseIds ?? []).size;
  if (hasReachedStudyRunDistinctCaseTarget(descriptor.distinctCaseTarget, completedDistinctCases)) {
    const futureRepeat = firstFutureRepeat(repeatEntries, serverNow);
    return futureRepeat
      ? { status: 'waiting', nextRepeatDueAt: Number(futureRepeat.dueAt) }
      : { status: 'complete' };
  }

  const due = firstDue(descriptor);
  const nextNew = firstNew(descriptor);
  const newAllowed = Number(descriptor.consecutiveNewCompleted ?? 0) < MAX_CONSECUTIVE_NEW;
  const order = input.scheduledOrder ?? descriptor.scheduledOrder;
  if (order !== 'due_first' && order !== 'new_first') {
    throw new ScheduledStudyRunError('invalid-descriptor', 'Scheduled ordering preference is invalid.');
  }

  if (order === 'new_first') {
    if (nextNew && newAllowed) return { status: 'ready', work: capturedWork(descriptor, 'new', nextNew) };
    if (due) return { status: 'ready', work: capturedWork(descriptor, 'due', due) };
  } else {
    if (due) return { status: 'ready', work: capturedWork(descriptor, 'due', due) };
    if (nextNew && newAllowed) return { status: 'ready', work: capturedWork(descriptor, 'new', nextNew) };
  }

  const futureRepeat = firstFutureRepeat(repeatEntries, serverNow);
  if (futureRepeat) {
    return { status: 'waiting', nextRepeatDueAt: Number(futureRepeat.dueAt) };
  }
  if (nextNew && !newAllowed) {
    return { status: 'new-limit-reached', limit: MAX_CONSECUTIVE_NEW };
  }
  return { status: 'complete' };
}

/** @param {any} descriptor @param {ScheduledWork} work @param {string} reviewId */
export function beginScheduledWork(descriptor, work, reviewId) {
  assertDescriptor(descriptor);
  if (descriptor.currentReviewId) {
    throw new ScheduledStudyRunError('review-in-progress', 'A Scheduled Review is already in progress.');
  }
  if (!reviewId || !work?.caseId || !['due', 'new', 'repeat'].includes(work.queueClass)) {
    throw new ScheduledStudyRunError('work-mismatch', 'Scheduled work identity is invalid.');
  }
  return {
    ...descriptor,
    currentReviewId: reviewId,
    currentWork: {
      queueClass: work.queueClass,
      caseId: work.caseId,
      stateRevision: work.stateRevision ?? null,
      dueAt: work.dueAt ?? null
    }
  };
}

/** @param {any} descriptor @param {ScheduledWork} work */
export function skipScheduledWork(descriptor, work) {
  assertDescriptor(descriptor);
  if (descriptor.currentReviewId) {
    throw new ScheduledStudyRunError('review-in-progress', 'Discard the active Review before skipping its queue entry.');
  }
  if (work.queueClass === 'due') {
    const entry = firstDue(descriptor);
    if (!entry || entry.caseId !== work.caseId) throw new ScheduledStudyRunError('work-mismatch', 'Due queue cursor no longer matches this work item.');
    return { ...descriptor, duePosition: Number(descriptor.duePosition) + 1 };
  }
  if (work.queueClass === 'new') {
    const entry = firstNew(descriptor);
    if (!entry || entry.caseId !== work.caseId) throw new ScheduledStudyRunError('work-mismatch', 'New queue cursor no longer matches this work item.');
    return { ...descriptor, newPosition: Number(descriptor.newPosition) + 1 };
  }
  if (work.queueClass === 'repeat') {
    const currentRepeats = /** @type {any[]} */ (descriptor.repeatEntries ?? []);
    const repeatEntries = currentRepeats.filter((entry) => !(
      entry.caseId === work.caseId && Number(entry.stateRevision) === Number(work.stateRevision)
    ));
    if (repeatEntries.length === currentRepeats.length) {
      throw new ScheduledStudyRunError('work-mismatch', 'Repeat lane no longer contains this work item.');
    }
    return { ...descriptor, repeatEntries };
  }
  throw new ScheduledStudyRunError('work-mismatch', 'Scheduled work queue class is invalid.');
}

/**
 * Apply a committed/replayed server completion exactly once to browser-local
 * navigation state. Replays after the local descriptor has already advanced are
 * harmless because there is no current Review left to consume.
 *
 * @param {any} descriptor
 * @param {{eventId:string,caseId:string,queueClass:ScheduledQueueClass,repeatEntry:any|null}} result
 */
export function applyScheduledCompletion(descriptor, result) {
  assertDescriptor(descriptor);
  if (!descriptor.currentReviewId && !descriptor.currentWork) return descriptor;
  if (descriptor.currentReviewId !== result.eventId) {
    throw new ScheduledStudyRunError('work-mismatch', 'Completion receipt does not match the active browser Review.');
  }
  const work = descriptor.currentWork;
  if (!work || work.caseId !== result.caseId || work.queueClass !== result.queueClass) {
    throw new ScheduledStudyRunError('work-mismatch', 'Completion receipt does not match the active queue entry.');
  }

  let next = descriptor;
  if (work.queueClass === 'due') {
    const entry = firstDue(descriptor);
    if (!entry || entry.caseId !== work.caseId) throw new ScheduledStudyRunError('work-mismatch', 'Due queue cursor changed before completion was applied.');
    next = {
      ...next,
      duePosition: Number(next.duePosition) + 1,
      consecutiveNewCompleted: 0
    };
  } else if (work.queueClass === 'new') {
    const entry = firstNew(descriptor);
    if (!entry || entry.caseId !== work.caseId) throw new ScheduledStudyRunError('work-mismatch', 'New queue cursor changed before completion was applied.');
    next = {
      ...next,
      newPosition: Number(next.newPosition) + 1,
      consecutiveNewCompleted: Number(next.consecutiveNewCompleted ?? 0) + 1
    };
  } else {
    const currentRepeats = /** @type {any[]} */ (next.repeatEntries ?? []);
    next = {
      ...next,
      repeatEntries: currentRepeats.filter((entry) => !(
        entry.caseId === work.caseId && Number(entry.stateRevision) === Number(work.stateRevision)
      ))
    };
  }

  const nextRepeats = /** @type {any[]} */ (next.repeatEntries ?? []);
  const repeatsWithoutCase = nextRepeats.filter((entry) => entry.caseId !== result.caseId);
  const repeatEntries = result.repeatEntry
    ? [...repeatsWithoutCase, { ...result.repeatEntry }]
    : repeatsWithoutCase;
  const completedCaseIds = (next.completedCaseIds ?? []).includes(result.caseId)
    ? [...next.completedCaseIds]
    : [...(next.completedCaseIds ?? []), result.caseId];

  return {
    ...next,
    repeatEntries,
    completedCaseIds,
    currentReviewId: null,
    currentWork: null
  };
}

export const SCHEDULED_STUDY_CONSECUTIVE_NEW_LIMIT = MAX_CONSECUTIVE_NEW;
