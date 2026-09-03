import { initialLearnerFsrsProfile } from './fsrs-bootstrap.js';
import { buildDetailedHistoryCleanupStatements } from './fsrs-retention.js';

const DATABASE_NOW_MS_SQL = "cast((julianday('now') - 2440587.5) * 86400000 as integer)";

/** @param {unknown} value @param {string} label */
function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new TypeError(`${label} is required.`);
  return normalized;
}

/** @param {import('./index.js').LearningDb} db */
function requireD1Client(db) {
  const client = db.$client;
  if (!client || typeof client.prepare !== 'function' || typeof client.batch !== 'function') {
    throw new Error('FSRS Reset/Fresh requires a Cloudflare D1 client with atomic batch support.');
  }
  return client;
}

/** @param {D1Database} client @param {string} userId */
async function readProfile(client, userId) {
  const row = await client.prepare(`
    SELECT
      user_id,
      generation,
      review_sequence_epoch,
      parameter_revision,
      scheduler_revision,
      scheduler_library_version,
      parameters_json,
      detailed_history_retention,
      last_optimized_at,
      last_detailed_cleanup_at
    FROM learner_fsrs_profiles
    WHERE user_id = ?
    LIMIT 1
  `).bind(userId).first();
  if (!row) return null;
  return {
    userId: String(row.user_id),
    generation: Number(row.generation),
    reviewSequenceEpoch: Number(row.review_sequence_epoch),
    parameterRevision: Number(row.parameter_revision),
    schedulerRevision: Number(row.scheduler_revision),
    schedulerLibraryVersion: String(row.scheduler_library_version),
    parametersJson: String(row.parameters_json),
    detailedHistoryRetention: String(row.detailed_history_retention),
    lastOptimizedAt: row.last_optimized_at == null ? null : Number(row.last_optimized_at),
    lastDetailedCleanupAt: row.last_detailed_cleanup_at == null ? null : Number(row.last_detailed_cleanup_at)
  };
}

/** @param {D1Database} client @param {string} userId */
function deleteActiveReview(client, userId) {
  return client.prepare('DELETE FROM active_reviews WHERE user_id = ?').bind(userId);
}

/** @param {D1Database} client @param {string} userId */
function deleteCurrentCaseState(client, userId) {
  return client.prepare('DELETE FROM learner_case_fsrs WHERE user_id = ?').bind(userId);
}

/** @param {D1Database} client @param {string} userId */
function pruneOldGenerationOptimizerEvidence(client, userId) {
  return client.prepare(`
    DELETE FROM learner_optimizer_evidence
    WHERE user_id = ?
      AND generation < (
        SELECT generation
        FROM learner_fsrs_profiles
        WHERE user_id = ?
      )
  `).bind(userId, userId);
}

/**
 * Reset only current scheduling state. An uninitialized learner stays
 * uninitialized; Free-only activity does not gain an FSRS profile merely because
 * Reset was requested. The active Review delete and epoch change are in the same
 * D1 transaction, so no old Review can survive the committed boundary.
 *
 * @param {{db:import('./index.js').LearningDb,userId:string}} input
 */
export async function resetLearnerFsrsProgress(input) {
  const userId = requiredString(input.userId, 'Learner');
  const client = requireD1Client(input.db);
  const cleanup = buildDetailedHistoryCleanupStatements(client, userId, { force: true });

  await client.batch([
    deleteActiveReview(client, userId),
    deleteCurrentCaseState(client, userId),
    ...cleanup,
    pruneOldGenerationOptimizerEvidence(client, userId),
    client.prepare(`
      UPDATE learner_fsrs_profiles
      SET review_sequence_epoch = review_sequence_epoch + 1,
          updated_at = ${DATABASE_NOW_MS_SQL}
      WHERE user_id = ?
    `).bind(userId)
  ]);

  const profile = await readProfile(client, userId);
  return {
    operation: 'reset-progress',
    initialized: profile !== null,
    profile
  };
}

/**
 * Start a new default-parameter FSRS generation. Existing learners advance both
 * generation and review-sequence epoch and publish a new parameter revision;
 * never-initialized learners receive the ordinary generation/epoch/revision 1
 * bootstrap instead of an artificial generation 2.
 *
 * Historical Scheduled display rows and compact encounters/aggregates are
 * preserved. Optimizer-only evidence from generations that became permanently
 * ineligible after Fresh is pruned inside this same bounded learner transaction.
 *
 * @param {{db:import('./index.js').LearningDb,userId:string}} input
 */
export async function freshLearnerFsrsStart(input) {
  const userId = requiredString(input.userId, 'Learner');
  const client = requireD1Client(input.db);
  const defaults = initialLearnerFsrsProfile(userId);
  const cleanup = buildDetailedHistoryCleanupStatements(client, userId, { force: true });

  await client.batch([
    deleteActiveReview(client, userId),
    deleteCurrentCaseState(client, userId),
    client.prepare(`
      INSERT INTO learner_fsrs_profiles (
        user_id,
        generation,
        review_sequence_epoch,
        parameter_revision,
        scheduler_revision,
        scheduler_library_version,
        parameters_json,
        detailed_history_retention,
        last_optimized_at,
        last_detailed_cleanup_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ${DATABASE_NOW_MS_SQL})
      ON CONFLICT(user_id) DO UPDATE SET
        generation = learner_fsrs_profiles.generation + 1,
        review_sequence_epoch = learner_fsrs_profiles.review_sequence_epoch + 1,
        parameter_revision = learner_fsrs_profiles.parameter_revision + 1,
        scheduler_revision = excluded.scheduler_revision,
        scheduler_library_version = excluded.scheduler_library_version,
        parameters_json = excluded.parameters_json,
        last_optimized_at = NULL,
        last_detailed_cleanup_at = ${DATABASE_NOW_MS_SQL},
        updated_at = ${DATABASE_NOW_MS_SQL}
    `).bind(
      defaults.userId,
      defaults.generation,
      defaults.reviewSequenceEpoch,
      defaults.parameterRevision,
      defaults.schedulerRevision,
      defaults.schedulerLibraryVersion,
      defaults.parametersJson,
      defaults.detailedHistoryRetention
    ),
    ...cleanup,
    pruneOldGenerationOptimizerEvidence(client, userId)
  ]);

  const profile = await readProfile(client, userId);
  if (!profile) throw new Error('Fresh FSRS Start committed without a learner FSRS profile.');
  return {
    operation: 'fresh-fsrs-start',
    profile
  };
}
