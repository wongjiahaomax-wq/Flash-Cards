import {
  deserializeFsrsParameters,
  getFsrsRetrievability
} from './fsrs-scheduler.js';
import {
  CAPTURED_MEMBERSHIP_CHUNK_SIZE,
  fingerprintStudyScope,
  issueCapturedMembershipProofs,
  issueScheduledRunBoundaryToken
} from './study-run-proof.js';

export const STUDY_RUN_DESCRIPTOR_VERSION = 2;
export const MAX_SCHEDULED_STUDY_CASES = 20_000;

/**
 * @typedef {{routeType:'topic'|'tag',routeId:string}} V2StudyRoute
 * @typedef {{systemId:string,mode:'all'}|{systemId:string,mode:'routes',routes:readonly V2StudyRoute[]}} V2SystemScope
 * @typedef {{systems:readonly V2SystemScope[]}} V2RunScope
 */

export class StudyRunPlanningError extends Error {
  /**
   * @param {'invalid-input'|'empty-selection'|'selection-too-large'|'state-boundary-mismatch'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'StudyRunPlanningError';
    this.code = code;
  }
}

/** @param {Date|number|string|null|undefined} value */
function timestampMs(value) {
  if (value == null) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** @param {() => number} rng */
function randomUnit(rng) {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new TypeError('Study run shuffle RNG must return a finite value in [0, 1).');
  }
  return value;
}

/** @template T @param {readonly T[]} values @param {() => number} rng */
export function shuffleStudyBag(values, rng = Math.random) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(randomUnit(rng) * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

/** @param {any} encounter */
export function hasPriorLearnerEncounter(encounter) {
  if (!encounter) return false;
  return Boolean(
    encounter.firstScheduledCompletedAt
    || encounter.freeFirstSeenAt
    || encounter.freeLastSeenAt
    || Number(encounter.freeTimesStudied ?? 0) > 0
  );
}

/** @param {number} candidateCount */
export function assertScheduledStudySelectionSize(candidateCount) {
  if (!Number.isInteger(candidateCount) || candidateCount < 0) {
    throw new StudyRunPlanningError('invalid-input', 'Scheduled Study candidate count must be a non-negative integer.');
  }
  if (candidateCount > MAX_SCHEDULED_STUDY_CASES) {
    throw new StudyRunPlanningError(
      'selection-too-large',
      `Scheduled Study supports at most ${MAX_SCHEDULED_STUDY_CASES.toLocaleString('en-US')} selected Cases. Narrow the selection before starting the run.`
    );
  }
}

/** @param {any} row */
function persistedCard(row) {
  const dueAt = timestampMs(row.dueAt);
  if (dueAt == null) throw new StudyRunPlanningError('invalid-input', 'Persisted learner FSRS state has an invalid due time.');
  return {
    dueAt,
    stability: Number(row.stability),
    difficulty: Number(row.difficulty),
    state: Number(row.state),
    elapsedDays: Number(row.elapsedDays),
    scheduledDays: Number(row.scheduledDays),
    learningSteps: Number(row.learningSteps),
    reps: Number(row.reps),
    lapses: Number(row.lapses),
    lastReviewAt: timestampMs(row.lastReviewAt)
  };
}

/** @param {any} row @param {any} profile */
function assertCurrentStateBoundary(row, profile) {
  if (
    Number(row.generation) !== Number(profile.generation)
    || Number(row.reviewSequenceEpoch) !== Number(profile.reviewSequenceEpoch)
    || Number(row.schedulerRevision) !== Number(profile.schedulerRevision)
    || String(row.schedulerLibraryVersion) !== String(profile.schedulerLibraryVersion)
  ) {
    throw new StudyRunPlanningError(
      'state-boundary-mismatch',
      `Learner FSRS state for Case ${String(row.caseId)} does not match the current scheduler/generation boundary.`
    );
  }
  if (!Number.isInteger(Number(row.stateRevision)) || Number(row.stateRevision) < 1) {
    throw new StudyRunPlanningError('invalid-input', 'Persisted learner FSRS state has an invalid state revision.');
  }
}

/** @param {readonly {id:string}[]} candidates */
function uniqueCandidates(candidates) {
  const byId = new Map();
  for (const candidate of candidates) {
    if (!candidate?.id) throw new StudyRunPlanningError('invalid-input', 'Study candidates require Case identifiers.');
    if (!byId.has(candidate.id)) byId.set(candidate.id, candidate);
  }
  return /** @type {{id:string}[]} */ ([...byId.values()]);
}

/**
 * @param {{runScope?:V2RunScope,systemId?:string,routes?:readonly V2StudyRoute[]}} input
 * @returns {V2RunScope}
 */
function canonicalRunScope(input) {
  if (input.runScope?.systems?.length) return input.runScope;
  // Internal single-System compatibility only: still emits/authenticates v2.
  if (input.systemId && Array.isArray(input.routes) && input.routes.length > 0) {
    return { systems: [{ systemId: input.systemId, mode: 'routes', routes: input.routes }] };
  }
  throw new StudyRunPlanningError('invalid-input', 'Study requires a normalized non-empty v2 run scope.');
}

/**
 * @param {{
 *   userId:string,
 *   runScope?:V2RunScope,
 *   systemId?:string,
 *   routes?:readonly V2StudyRoute[],
 *   candidates:readonly {id:string}[],
 *   profile:any,
 *   preferences:{scheduledOrder:'due_first'|'new_first',expandedLearning:boolean},
 *   states:readonly any[],
 *   encounters:readonly any[],
 *   proofSecret:string,
 *   now?:Date|number|string,
 *   rng?:()=>number,
 *   runId?:string,
 *   membershipChunkSize?:number
 * }} input
 */
export async function buildScheduledStudyRunDescriptor(input) {
  if (!input.userId) throw new StudyRunPlanningError('invalid-input', 'Scheduled Study requires a learner.');
  const runScope = canonicalRunScope(input);
  const runStartedAt = timestampMs(input.now ?? new Date());
  if (runStartedAt == null) throw new StudyRunPlanningError('invalid-input', 'Scheduled Study requires a valid server start time.');
  const runId = input.runId ?? globalThis.crypto.randomUUID();
  const candidates = uniqueCandidates(input.candidates);
  assertScheduledStudySelectionSize(candidates.length);
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const states = new Map(input.states.filter((row) => candidateIds.has(row.caseId)).map((row) => [row.caseId, row]));
  const encounters = new Map(input.encounters.filter((row) => candidateIds.has(row.caseId)).map((row) => [row.caseId, row]));

  for (const state of states.values()) assertCurrentStateBoundary(state, input.profile);

  const parameters = deserializeFsrsParameters(input.profile.parametersJson);
  const dueWithRisk = [];
  const unseen = [];
  const seen = [];

  for (const candidate of candidates) {
    const state = states.get(candidate.id);
    if (state) {
      const card = persistedCard(state);
      if (card.dueAt <= runStartedAt) {
        const retrievability = getFsrsRetrievability(card, runStartedAt, parameters);
        if (!Number.isFinite(retrievability)) {
          throw new StudyRunPlanningError('invalid-input', `FSRS retrievability for Case ${candidate.id} is not finite.`);
        }
        dueWithRisk.push({ caseId: candidate.id, stateRevision: Number(state.stateRevision), dueAt: card.dueAt, retrievability });
      }
      continue;
    }
    if (hasPriorLearnerEncounter(encounters.get(candidate.id))) seen.push(candidate.id);
    else unseen.push(candidate.id);
  }

  dueWithRisk.sort((left, right) =>
    left.retrievability - right.retrievability
    || left.dueAt - right.dueAt
    || left.caseId.localeCompare(right.caseId)
  );
  const dueMembership = dueWithRisk.map(({ caseId, stateRevision, dueAt }) => ({ caseId, stateRevision, dueAt }));
  const newMembership = [
    ...shuffleStudyBag(unseen, input.rng ?? Math.random),
    ...shuffleStudyBag(seen, input.rng ?? Math.random)
  ].map((caseId) => ({ caseId }));

  const scopeFingerprint = await fingerprintStudyScope(runScope);
  const boundary = {
    userId: input.userId,
    runId,
    runStartedAt,
    scopeFingerprint,
    generation: Number(input.profile.generation),
    reviewSequenceEpoch: Number(input.profile.reviewSequenceEpoch),
    parameterRevision: Number(input.profile.parameterRevision),
    schedulerRevision: Number(input.profile.schedulerRevision),
    schedulerLibraryVersion: String(input.profile.schedulerLibraryVersion)
  };
  const runToken = await issueScheduledRunBoundaryToken({ secret: input.proofSecret, boundary });
  const chunkSize = input.membershipChunkSize ?? CAPTURED_MEMBERSHIP_CHUNK_SIZE;
  const [dueProofs, newProofs] = await Promise.all([
    issueCapturedMembershipProofs({ secret: input.proofSecret, runToken, boundary, queueClass: 'due', entries: dueMembership, chunkSize }),
    issueCapturedMembershipProofs({ secret: input.proofSecret, runToken, boundary, queueClass: 'new', entries: newMembership, chunkSize })
  ]);

  return {
    version: STUDY_RUN_DESCRIPTOR_VERSION,
    kind: 'scheduled',
    userId: input.userId,
    runId,
    runStartedAt,
    selectedScope: runScope,
    scopeFingerprint,
    runBoundaryToken: runToken,
    schedulerBoundary: {
      generation: boundary.generation,
      reviewSequenceEpoch: boundary.reviewSequenceEpoch,
      parameterRevision: boundary.parameterRevision,
      schedulerRevision: boundary.schedulerRevision,
      schedulerLibraryVersion: boundary.schedulerLibraryVersion
    },
    scheduledOrder: input.preferences.scheduledOrder,
    expandedLearning: Boolean(input.preferences.expandedLearning),
    capturedDue: dueMembership.map((entry, index) => ({ ...entry, proofIndex: Math.floor(index / chunkSize) })),
    duePosition: 0,
    capturedNew: newMembership.map((entry, index) => ({ ...entry, proofIndex: Math.floor(index / chunkSize) })),
    newPosition: 0,
    membershipProofs: {
      version: STUDY_RUN_DESCRIPTOR_VERSION,
      chunkSize,
      due: dueProofs,
      new: newProofs
    },
    repeatEntries: [],
    completedCaseIds: [],
    consecutiveNewCompleted: 0,
    currentReviewId: null,
    currentWork: null
  };
}

/**
 * @param {{
 *   userId:string,
 *   runScope?:V2RunScope,
 *   systemId?:string,
 *   routes?:readonly V2StudyRoute[],
 *   candidates:readonly {id:string}[],
 *   preferences:{expandedLearning:boolean},
 *   now?:Date|number|string,
 *   rng?:()=>number,
 *   runId?:string
 * }} input
 */
export function buildFreeStudyRunDescriptor(input) {
  if (!input.userId) throw new StudyRunPlanningError('invalid-input', 'Free Study requires a learner.');
  const runScope = canonicalRunScope(input);
  const runStartedAt = timestampMs(input.now ?? new Date());
  if (runStartedAt == null) throw new StudyRunPlanningError('invalid-input', 'Free Study requires a valid server start time.');
  const candidates = uniqueCandidates(input.candidates);
  return {
    version: STUDY_RUN_DESCRIPTOR_VERSION,
    kind: 'free',
    userId: input.userId,
    runId: input.runId ?? globalThis.crypto.randomUUID(),
    runStartedAt,
    selectedScope: runScope,
    expandedLearning: Boolean(input.preferences.expandedLearning),
    bag: shuffleStudyBag(candidates.map((candidate) => candidate.id), input.rng ?? Math.random),
    position: 0,
    currentReviewId: null
  };
}
