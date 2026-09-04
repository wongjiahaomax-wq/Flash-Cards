import { eq } from 'drizzle-orm';

import {
  ensureLearnerFsrsProfile,
  ensureLearnerPreferences
} from './fsrs-bootstrap.js';
import {
  learnerCaseEncounters,
  learnerCaseFsrs
} from './fsrs-schema.js';
import {
  resolveMultiSystemStudySelection,
  singleSystemRoutesScope
} from './study-navigation.ts';
import {
  StudyRunPlanningError,
  assertScheduledStudySelectionSize,
  buildFreeStudyRunDescriptor,
  buildScheduledStudyRunDescriptor
} from '../learning/study-run-planner.js';
import { assertScheduledStudyRouteCount } from '../learning/study-run-envelope.js';
import { totalNormalizedMultiSystemRouteCount } from '../learning/multi-system-study-scope.ts';

/** @typedef {Awaited<ReturnType<typeof resolveMultiSystemStudySelection>>} StudySelection */
/** @typedef {import('../learning/system-study-routes.ts').SystemStudySelectionRoute} SystemStudySelectionRoute */

/**
 * PR B intentionally reads learner-owned state in bounded table reads rather
 * than constructing a candidate-sized SQL IN list or issuing one query per Case.
 * @param {import('./index.js').LearningDb} db
 * @param {string} userId
 */
async function loadLearnerRunPlanningState(db, userId) {
  return Promise.all([
    db.select().from(learnerCaseFsrs).where(eq(learnerCaseFsrs.userId, userId)),
    db.select().from(learnerCaseEncounters).where(eq(learnerCaseEncounters.userId, userId))
  ]);
}

/** @param {StudySelection} selection */
function assertResolvedSelection(selection) {
  assertScheduledStudyRouteCount(totalNormalizedMultiSystemRouteCount(selection.runScope));
  if (selection.candidates.length === 0) {
    throw new StudyRunPlanningError('empty-selection', 'No active study Cases are available for this selection.');
  }
  assertScheduledStudySelectionSize(selection.candidates.length);
}

/**
 * Canonical v2 Scheduled planner. Raw scope validation runs inside
 * resolveMultiSystemStudySelection before taxonomy/state work.
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   systems:readonly unknown[],
 *   proofSecret:string,
 *   now?:Date|number|string,
 *   rng?:()=>number,
 *   runId?:string,
 *   membershipChunkSize?:number
 * }} input
 */
export async function planScheduledMultiSystemStudyRun(input) {
  const requestNow = input.now ?? new Date();
  const selection = await resolveMultiSystemStudySelection(input.db, { systems: input.systems });
  assertResolvedSelection(selection);

  // Bootstrap/state reads remain after the scope/candidate envelope gates so a
  // rejected request cannot create learner runtime rows.
  const [profile, preferences] = await Promise.all([
    ensureLearnerFsrsProfile(input.db, input.userId),
    ensureLearnerPreferences(input.db, input.userId)
  ]);
  const [states, encounters] = await loadLearnerRunPlanningState(input.db, input.userId);

  return buildScheduledStudyRunDescriptor({
    userId: input.userId,
    runScope: selection.runScope,
    candidates: selection.candidates,
    profile,
    preferences,
    states,
    encounters,
    proofSecret: input.proofSecret,
    now: requestNow,
    rng: input.rng,
    runId: input.runId,
    membershipChunkSize: input.membershipChunkSize
  });
}

/**
 * Canonical v2 Free planner.
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   systems:readonly unknown[],
 *   now?:Date|number|string,
 *   rng?:()=>number,
 *   runId?:string
 * }} input
 */
export async function planFreeMultiSystemStudyRun(input) {
  const requestNow = input.now ?? new Date();
  const selection = await resolveMultiSystemStudySelection(input.db, { systems: input.systems });
  if (selection.candidates.length === 0) {
    throw new StudyRunPlanningError('empty-selection', 'No active study Cases are available for this selection.');
  }
  assertScheduledStudySelectionSize(selection.candidates.length);

  const preferences = await ensureLearnerPreferences(input.db, input.userId);
  return buildFreeStudyRunDescriptor({
    userId: input.userId,
    runScope: selection.runScope,
    candidates: selection.candidates,
    preferences,
    now: requestNow,
    rng: input.rng,
    runId: input.runId
  });
}

/**
 * Existing single-System /study entry point. It is intentionally retained as a
 * valid special case, but now delegates to and emits the v2 multi-System runtime.
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   systemId:string,
 *   routes:readonly SystemStudySelectionRoute[],
 *   proofSecret:string,
 *   now?:Date|number|string,
 *   rng?:()=>number,
 *   runId?:string,
 *   membershipChunkSize?:number
 * }} input
 */
export async function planScheduledSystemStudyRun(input) {
  return planScheduledMultiSystemStudyRun({
    ...input,
    systems: singleSystemRoutesScope(input.systemId, input.routes)
  });
}

/**
 * Existing single-System Free Study entry point, emitting v2 state.
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   systemId:string,
 *   routes:readonly SystemStudySelectionRoute[],
 *   now?:Date|number|string,
 *   rng?:()=>number,
 *   runId?:string
 * }} input
 */
export async function planFreeSystemStudyRun(input) {
  return planFreeMultiSystemStudyRun({
    ...input,
    systems: singleSystemRoutesScope(input.systemId, input.routes)
  });
}
