import { eq } from 'drizzle-orm';

import {
  ensureLearnerFsrsProfile,
  ensureLearnerPreferences
} from './fsrs-bootstrap.js';
import {
  learnerCaseEncounters,
  learnerCaseFsrs
} from './fsrs-schema.js';
import { resolveSystemStudySelection } from './study-navigation.ts';
import {
  StudyRunPlanningError,
  assertScheduledStudySelectionSize,
  buildFreeStudyRunDescriptor,
  buildScheduledStudyRunDescriptor
} from '../learning/study-run-planner.js';

/**
 * PR B intentionally reads learner-owned state in bounded table reads rather
 * than constructing a candidate-sized SQL IN list or issuing one query per Case.
 * The browser/run benchmark measures descriptor cost separately; later D1
 * evidence may justify a different indexed read shape.
 *
 * @param {import('./index.js').LearningDb} db
 * @param {string} userId
 */
async function loadLearnerRunPlanningState(db, userId) {
  return Promise.all([
    db.select().from(learnerCaseFsrs).where(eq(learnerCaseFsrs.userId, userId)),
    db.select().from(learnerCaseEncounters).where(eq(learnerCaseEncounters.userId, userId))
  ]);
}

/**
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   systemId:string,
 *   routes:readonly import('../learning/system-study-routes.ts').SystemStudySelectionRoute[],
 *   proofSecret:string,
 *   now?:Date|number|string,
 *   rng?:()=>number,
 *   runId?:string,
 *   membershipChunkSize?:number
 * }} input
 */
export async function planScheduledSystemStudyRun(input) {
  const requestNow = input.now ?? new Date();
  const selection = await resolveSystemStudySelection(input.db, {
    systemId: input.systemId,
    routes: input.routes
  });
  if (selection.candidates.length === 0) {
    throw new StudyRunPlanningError(
      'empty-selection',
      'No active study Cases are available for this selection.'
    );
  }

  // This guard intentionally runs before lazy FSRS/preference bootstrap or any
  // learner-state read. Oversized selections fail before a run can begin.
  assertScheduledStudySelectionSize(selection.candidates.length);

  const [profile, preferences] = await Promise.all([
    ensureLearnerFsrsProfile(input.db, input.userId),
    ensureLearnerPreferences(input.db, input.userId)
  ]);
  const [states, encounters] = await loadLearnerRunPlanningState(input.db, input.userId);

  return buildScheduledStudyRunDescriptor({
    userId: input.userId,
    systemId: selection.systemId,
    routes: selection.routes,
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
 * Free Study uses the same normalized systems-first scope and global Expanded
 * Learning preference, but it does not initialize/read FSRS profile/state.
 *
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   systemId:string,
 *   routes:readonly import('../learning/system-study-routes.ts').SystemStudySelectionRoute[],
 *   now?:Date|number|string,
 *   rng?:()=>number,
 *   runId?:string
 * }} input
 */
export async function planFreeSystemStudyRun(input) {
  const requestNow = input.now ?? new Date();
  const selection = await resolveSystemStudySelection(input.db, {
    systemId: input.systemId,
    routes: input.routes
  });
  if (selection.candidates.length === 0) {
    throw new StudyRunPlanningError(
      'empty-selection',
      'No active study Cases are available for this selection.'
    );
  }

  const preferences = await ensureLearnerPreferences(input.db, input.userId);
  return buildFreeStudyRunDescriptor({
    userId: input.userId,
    systemId: selection.systemId,
    routes: selection.routes,
    candidates: selection.candidates,
    preferences,
    now: requestNow,
    rng: input.rng,
    runId: input.runId
  });
}
