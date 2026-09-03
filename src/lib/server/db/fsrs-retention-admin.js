import { initialLearnerFsrsProfile } from './fsrs-bootstrap.js';
import { buildDetailedHistoryCleanupStatements } from './fsrs-retention.js';

const DATABASE_NOW_MS_SQL = "cast((julianday('now') - 2440587.5) * 86400000 as integer)";

export const DETAILED_HISTORY_RETENTION_POLICIES = Object.freeze([
  '24m',
  '36m',
  '60m',
  'indefinite'
]);

export class LearnerRetentionError extends Error {
  /** @param {'invalid-input'|'learner-not-found'} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'LearnerRetentionError';
    this.code = code;
  }
}

/** @param {unknown} value @param {string} label */
function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new LearnerRetentionError('invalid-input', `${label} is required.`);
  return normalized;
}

/** @param {unknown} value */
export function parseDetailedHistoryRetention(value) {
  const normalized = requiredString(value, 'Detailed-history retention');
  if (!DETAILED_HISTORY_RETENTION_POLICIES.includes(normalized)) {
    throw new LearnerRetentionError(
      'invalid-input',
      'Detailed-history retention must be 24 months, 36 months, 60 months, or Indefinite.'
    );
  }
  return /** @type {'24m'|'36m'|'60m'|'indefinite'} */ (normalized);
}

/** @param {import('./index.js').LearningDb} db */
function requireD1Client(db) {
  const client = db.$client;
  if (!client || typeof client.prepare !== 'function' || typeof client.batch !== 'function') {
    throw new Error('Learner retention administration requires a Cloudflare D1 client with atomic batch support.');
  }
  return client;
}

/** @param {unknown} result */
function resultRows(result) {
  return Array.isArray(/** @type {any} */ (result)?.results)
    ? /** @type {Record<string, any>[]} */ (/** @type {any} */ (result).results)
    : [];
}

/**
 * List normal learner accounts and their effective detailed-history retention.
 * A never-initialized learner has no profile row yet, so the effective policy is
 * the locked 24-month default until an explicit Admin override persists one.
 *
 * @param {import('./index.js').LearningDb} db
 */
export async function listLearnerDetailedHistoryRetention(db) {
  const client = requireD1Client(db);
  const result = await client.prepare(`
    SELECT
      u.id AS user_id,
      u.name,
      u.email,
      p.user_id AS profile_user_id,
      COALESCE(p.detailed_history_retention, '24m') AS detailed_history_retention
    FROM user u
    LEFT JOIN learner_fsrs_profiles p ON p.user_id = u.id
    WHERE u.role IS NULL OR u.role = 'user'
    ORDER BY lower(u.name), lower(u.email), u.id
  `).all();

  return resultRows(result).map((row) => ({
    userId: String(row.user_id),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    profileInitialized: row.profile_user_id != null,
    detailedHistoryRetention: parseDetailedHistoryRetention(row.detailed_history_retention)
  }));
}

/**
 * Persist one Admin retention override. The readiness contract explicitly
 * permits this reviewed persistence owner to create a never-initialized learner's
 * normal generation/epoch/revision-1 FSRS profile solely to store the override.
 * Canonical scheduler/default parameter JSON therefore comes from the same
 * bootstrap owner as first Scheduled Study.
 *
 * The policy update and forced learner-scoped detailed-history cleanup share one
 * D1 batch. Optimizer evidence, encounters and aggregates are not retention
 * targets and are left untouched.
 *
 * @param {{db:import('./index.js').LearningDb,userId:string,retention:unknown}} input
 */
export async function setLearnerDetailedHistoryRetention(input) {
  const userId = requiredString(input.userId, 'Learner');
  const retention = parseDetailedHistoryRetention(input.retention);
  const client = requireD1Client(input.db);

  const account = await client.prepare(`
    SELECT id, COALESCE(role, 'user') AS role
    FROM user
    WHERE id = ?
    LIMIT 1
  `).bind(userId).first();
  if (!account || String(account.role) !== 'user') {
    throw new LearnerRetentionError('learner-not-found', 'The selected learner account no longer exists.');
  }

  const defaults = initialLearnerFsrsProfile(userId);
  const cleanup = buildDetailedHistoryCleanupStatements(client, userId, { force: true });

  await client.batch([
    client.prepare(`
      INSERT INTO learner_fsrs_profiles (
        user_id,
        generation,
        review_sequence_epoch,
        parameter_revision,
        scheduler_revision,
        scheduler_library_version,
        parameters_json,
        detailed_history_retention
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO NOTHING
    `).bind(
      defaults.userId,
      defaults.generation,
      defaults.reviewSequenceEpoch,
      defaults.parameterRevision,
      defaults.schedulerRevision,
      defaults.schedulerLibraryVersion,
      defaults.parametersJson,
      retention
    ),
    client.prepare(`
      UPDATE learner_fsrs_profiles
      SET detailed_history_retention = ?,
          updated_at = ${DATABASE_NOW_MS_SQL}
      WHERE user_id = ?
    `).bind(retention, userId),
    ...cleanup
  ]);

  const profile = await client.prepare(`
    SELECT generation, review_sequence_epoch, parameter_revision,
           scheduler_revision, scheduler_library_version, parameters_json,
           detailed_history_retention
    FROM learner_fsrs_profiles
    WHERE user_id = ?
    LIMIT 1
  `).bind(userId).first();
  if (!profile) {
    throw new Error('Learner retention override committed without a readable FSRS profile.');
  }

  return {
    userId,
    retention: parseDetailedHistoryRetention(profile.detailed_history_retention),
    profile: {
      generation: Number(profile.generation),
      reviewSequenceEpoch: Number(profile.review_sequence_epoch),
      parameterRevision: Number(profile.parameter_revision),
      schedulerRevision: Number(profile.scheduler_revision),
      schedulerLibraryVersion: String(profile.scheduler_library_version),
      parametersJson: String(profile.parameters_json)
    }
  };
}
