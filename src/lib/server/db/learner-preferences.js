import { eq, sql } from 'drizzle-orm';

import { ensureLearnerPreferences } from './fsrs-bootstrap.js';
import { learnerPreferences } from './fsrs-schema.js';

const DATABASE_NOW_MS = sql`cast((julianday('now') - 2440587.5) * 86400000 as integer)`;

export class LearnerPreferenceError extends Error {
  /** @param {'invalid-input'} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'LearnerPreferenceError';
    this.code = code;
  }
}

/** @param {unknown} value */
function requiredUserId(value) {
  const userId = typeof value === 'string' ? value.trim() : '';
  if (!userId) throw new LearnerPreferenceError('invalid-input', 'Learner is required.');
  return userId;
}

/**
 * Persist the global Expanded Learning preference without touching FSRS profile
 * or learner×Case scheduling state. Both Scheduled and Free active-Review
 * creation read this same learner_preferences row before freezing content.
 *
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   expandedLearning:boolean
 * }} input
 */
export async function setExpandedLearningPreference(input) {
  const userId = requiredUserId(input.userId);
  if (typeof input.expandedLearning !== 'boolean') {
    throw new LearnerPreferenceError(
      'invalid-input',
      'Expanded Learning preference must be enabled or disabled.'
    );
  }

  await ensureLearnerPreferences(input.db, userId);
  const rows = await input.db
    .update(learnerPreferences)
    .set({
      expandedLearning: input.expandedLearning,
      updatedAt: DATABASE_NOW_MS
    })
    .where(eq(learnerPreferences.userId, userId))
    .returning();
  const preference = rows[0];
  if (!preference) {
    throw new Error('Expanded Learning preference update completed without a persisted row.');
  }
  return preference;
}
