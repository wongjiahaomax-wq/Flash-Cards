import { eq } from 'drizzle-orm';

import {
  FSRS_LIBRARY_VERSION,
  FSRS_SCHEDULER_REVISION,
  createDefaultFsrsParameters,
  serializeFsrsParameters
} from '../learning/fsrs-scheduler.js';
import { learnerFsrsProfiles, learnerPreferences } from './fsrs-schema.js';

export const DEFAULT_DETAILED_HISTORY_RETENTION = '24m';

/**
 * @param {string} userId
 * @returns {{userId:string, expandedLearning:false, scheduledOrder:'due_first'}}
 */
export function initialLearnerPreferences(userId) {
  return {
    userId,
    expandedLearning: false,
    scheduledOrder: 'due_first'
  };
}

/**
 * @param {string} userId
 * @returns {{
 *   userId:string,
 *   generation:1,
 *   reviewSequenceEpoch:1,
 *   parameterRevision:1,
 *   schedulerRevision:number,
 *   schedulerLibraryVersion:string,
 *   parametersJson:string,
 *   detailedHistoryRetention:'24m'
 * }}
 */
export function initialLearnerFsrsProfile(userId) {
  return {
    userId,
    generation: 1,
    reviewSequenceEpoch: 1,
    parameterRevision: 1,
    schedulerRevision: FSRS_SCHEDULER_REVISION,
    schedulerLibraryVersion: FSRS_LIBRARY_VERSION,
    parametersJson: serializeFsrsParameters(createDefaultFsrsParameters()),
    detailedHistoryRetention: DEFAULT_DETAILED_HISTORY_RETENTION
  };
}

/**
 * Shared conflict-safe primitive: the database uniqueness constraint decides the
 * winner, then every contender re-reads that same persisted row.
 *
 * @template T
 * @param {() => unknown} insertIfAbsent
 * @param {() => Promise<T|null|undefined>} readWinner
 * @returns {Promise<T>}
 */
export async function ensureDeterministicBootstrapRow(insertIfAbsent, readWinner) {
  await insertIfAbsent();
  const row = await readWinner();
  if (!row) {
    throw new Error('Learner bootstrap insert completed without a readable persisted row.');
  }
  return row;
}

/**
 * Lazily establishes persistent learner preferences. This must not be called
 * merely because a Better Auth account exists.
 *
 * @param {import('./index.js').LearningDb} db
 * @param {string} userId
 */
export async function ensureLearnerPreferences(db, userId) {
  const defaults = initialLearnerPreferences(userId);
  return ensureDeterministicBootstrapRow(
    () => db.insert(learnerPreferences).values(defaults).onConflictDoNothing(),
    async () => {
      const rows = await db
        .select()
        .from(learnerPreferences)
        .where(eq(learnerPreferences.userId, userId))
        .limit(1);
      return rows[0] ?? null;
    }
  );
}

/**
 * Lazily establishes the first deterministic FSRS profile only when a Scheduled
 * operation (or another reviewed persistent-profile owner) requires one.
 *
 * @param {import('./index.js').LearningDb} db
 * @param {string} userId
 */
export async function ensureLearnerFsrsProfile(db, userId) {
  const defaults = initialLearnerFsrsProfile(userId);
  return ensureDeterministicBootstrapRow(
    () => db.insert(learnerFsrsProfiles).values(defaults).onConflictDoNothing(),
    async () => {
      const rows = await db
        .select()
        .from(learnerFsrsProfiles)
        .where(eq(learnerFsrsProfiles.userId, userId))
        .limit(1);
      return rows[0] ?? null;
    }
  );
}

/**
 * Non-creating read used by future Reset semantics: absence is a legitimate
 * uninitialized state and must not create an FSRS generation merely to reset it.
 *
 * @param {import('./index.js').LearningDb} db
 * @param {string} userId
 */
export async function getLearnerFsrsProfileIfInitialized(db, userId) {
  const rows = await db
    .select()
    .from(learnerFsrsProfiles)
    .where(eq(learnerFsrsProfiles.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}