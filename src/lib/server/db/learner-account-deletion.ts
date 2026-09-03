export const LEARNER_ACCOUNT_DELETION_BATCH_SIZE = 1_000;

const DATABASE_NOW_MS_SQL = "cast((julianday('now') - 2440587.5) * 86400000 as integer)";

const PHASES = [
  { phase: 'auth_verifications', table: 'verification', userColumn: 'value', next: 'free_receipts' },
  { phase: 'free_receipts', table: 'free_review_completion_receipts', userColumn: 'user_id', next: 'scheduled_events' },
  { phase: 'scheduled_events', table: 'scheduled_review_events', userColumn: 'user_id', next: 'active_reviews' },
  { phase: 'active_reviews', table: 'active_reviews', userColumn: 'user_id', next: 'optimizer_evidence' },
  { phase: 'optimizer_evidence', table: 'learner_optimizer_evidence', userColumn: 'user_id', next: 'case_state' },
  { phase: 'case_state', table: 'learner_case_fsrs', userColumn: 'user_id', next: 'case_encounters' },
  { phase: 'case_encounters', table: 'learner_case_encounters', userColumn: 'user_id', next: 'monthly_buckets' },
  { phase: 'monthly_buckets', table: 'learner_system_monthly_buckets', userColumn: 'user_id', next: 'system_aggregates' },
  { phase: 'system_aggregates', table: 'learner_system_aggregates', userColumn: 'user_id', next: 'learner_aggregates' },
  { phase: 'learner_aggregates', table: 'learner_aggregates', userColumn: 'user_id', next: 'preferences' },
  { phase: 'preferences', table: 'learner_preferences', userColumn: 'user_id', next: 'profile' },
  { phase: 'profile', table: 'learner_fsrs_profiles', userColumn: 'user_id', next: 'identity_ready' }
] as const;

export type LearnerAccountDeletionPhase = (typeof PHASES)[number]['phase'] | 'identity_ready';

export class LearnerAccountDeletionError extends Error {
  code: 'invalid-input' | 'learner-not-found' | 'not-learner';

  constructor(code: LearnerAccountDeletionError['code'], message: string) {
    super(message);
    this.name = 'LearnerAccountDeletionError';
    this.code = code;
  }
}

function requiredString(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new LearnerAccountDeletionError('invalid-input', `${label} is required.`);
  return normalized;
}

function requireD1Client(db: import('./index.js').LearningDb): D1Database {
  const client = db.$client;
  if (!client || typeof client.prepare !== 'function' || typeof client.batch !== 'function') {
    throw new Error('Learner account deletion requires a Cloudflare D1 client with atomic batch support.');
  }
  return client;
}

function changes(result: D1Result): number {
  return Number(result?.meta?.changes ?? 0);
}

async function readLearner(client: D1Database, userId: string) {
  return await client.prepare(`
    SELECT id, name, email, COALESCE(role, 'user') AS role, COALESCE(banned, 0) AS banned
    FROM user
    WHERE id = ?
    LIMIT 1
  `).bind(userId).first<Record<string, unknown>>();
}

async function readDeletion(client: D1Database, userId: string) {
  return await client.prepare(`
    SELECT user_id, phase, requested_at, updated_at, batches_completed
    FROM learner_account_deletions
    WHERE user_id = ?
    LIMIT 1
  `).bind(userId).first<Record<string, unknown>>();
}

async function revokeAccess(client: D1Database, userId: string) {
  await client.batch([
    client.prepare(`
      UPDATE user
      SET banned = 1,
          banReason = 'Account deletion in progress',
          banExpires = NULL,
          updatedAt = ${DATABASE_NOW_MS_SQL}
      WHERE id = ? AND (role IS NULL OR role = 'user')
    `).bind(userId),
    client.prepare('DELETE FROM session WHERE userId = ?').bind(userId)
  ]);
}

/**
 * Start or resume the destructive flow. Access revocation and the durable deletion
 * marker commit together; migration guards then reject new sessions and active
 * Reviews while deletion remains in progress.
 */
export async function beginLearnerAccountDeletion(input: {
  db: import('./index.js').LearningDb;
  userId: string;
}) {
  const userId = requiredString(input.userId, 'Learner');
  const client = requireD1Client(input.db);
  const learner = await readLearner(client, userId);
  if (!learner) {
    throw new LearnerAccountDeletionError('learner-not-found', 'The selected learner account no longer exists.');
  }
  if (String(learner.role) !== 'user') {
    throw new LearnerAccountDeletionError('not-learner', 'Only normal learner accounts can use the FSRS account-deletion flow.');
  }

  await client.batch([
    client.prepare(`
      INSERT INTO learner_account_deletions (user_id, phase)
      VALUES (?, 'auth_verifications')
      ON CONFLICT(user_id) DO NOTHING
    `).bind(userId),
    client.prepare(`
      UPDATE user
      SET banned = 1,
          banReason = 'Account deletion in progress',
          banExpires = NULL,
          updatedAt = ${DATABASE_NOW_MS_SQL}
      WHERE id = ? AND (role IS NULL OR role = 'user')
    `).bind(userId),
    client.prepare('DELETE FROM session WHERE userId = ?').bind(userId)
  ]);

  const deletion = await readDeletion(client, userId);
  if (!deletion) throw new Error('Learner deletion started without a durable deletion marker.');
  return {
    userId,
    email: String(learner.email ?? ''),
    phase: String(deletion.phase) as LearnerAccountDeletionPhase,
    batchesCompleted: Number(deletion.batches_completed ?? 0)
  };
}

const FIRST_REMAINING_PHASE_SQL = `
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM verification WHERE value = ? LIMIT 1) THEN 'auth_verifications'
    WHEN EXISTS (SELECT 1 FROM free_review_completion_receipts WHERE user_id = ? LIMIT 1) THEN 'free_receipts'
    WHEN EXISTS (SELECT 1 FROM scheduled_review_events WHERE user_id = ? LIMIT 1) THEN 'scheduled_events'
    WHEN EXISTS (SELECT 1 FROM active_reviews WHERE user_id = ? LIMIT 1) THEN 'active_reviews'
    WHEN EXISTS (SELECT 1 FROM learner_optimizer_evidence WHERE user_id = ? LIMIT 1) THEN 'optimizer_evidence'
    WHEN EXISTS (SELECT 1 FROM learner_case_fsrs WHERE user_id = ? LIMIT 1) THEN 'case_state'
    WHEN EXISTS (SELECT 1 FROM learner_case_encounters WHERE user_id = ? LIMIT 1) THEN 'case_encounters'
    WHEN EXISTS (SELECT 1 FROM learner_system_monthly_buckets WHERE user_id = ? LIMIT 1) THEN 'monthly_buckets'
    WHEN EXISTS (SELECT 1 FROM learner_system_aggregates WHERE user_id = ? LIMIT 1) THEN 'system_aggregates'
    WHEN EXISTS (SELECT 1 FROM learner_aggregates WHERE user_id = ? LIMIT 1) THEN 'learner_aggregates'
    WHEN EXISTS (SELECT 1 FROM learner_preferences WHERE user_id = ? LIMIT 1) THEN 'preferences'
    WHEN EXISTS (SELECT 1 FROM learner_fsrs_profiles WHERE user_id = ? LIMIT 1) THEN 'profile'
    ELSE 'identity_ready'
  END AS phase
`;

async function firstRemainingPhase(client: D1Database, userId: string): Promise<LearnerAccountDeletionPhase> {
  const row = await client.prepare(FIRST_REMAINING_PHASE_SQL)
    .bind(...Array(12).fill(userId))
    .first<{ phase: LearnerAccountDeletionPhase }>();
  return row?.phase ?? 'identity_ready';
}

/**
 * Delete at most one bounded child-table chunk. Repeated calls are intentionally
 * safe: the durable phase can move only after its current table is empty, and a
 * final full learner-row rescan repairs any in-flight write that committed before
 * access revocation became authoritative. Better Auth 1.6.25 reset-password
 * verification rows carry the learner user id in verification.value, so they are
 * explicitly staged even though the Better Auth verification table has no user FK.
 */
export async function advanceLearnerAccountDeletion(input: {
  db: import('./index.js').LearningDb;
  userId: string;
  batchSize?: number;
}) {
  const userId = requiredString(input.userId, 'Learner');
  const batchSize = input.batchSize ?? LEARNER_ACCOUNT_DELETION_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > LEARNER_ACCOUNT_DELETION_BATCH_SIZE) {
    throw new LearnerAccountDeletionError(
      'invalid-input',
      `Deletion batch size must be an integer from 1 to ${LEARNER_ACCOUNT_DELETION_BATCH_SIZE}.`
    );
  }

  const client = requireD1Client(input.db);
  const learner = await readLearner(client, userId);
  if (!learner) return { userId, deleted: true, readyForIdentityDelete: false, rowsDeleted: 0, phase: null };
  if (String(learner.role) !== 'user') {
    throw new LearnerAccountDeletionError('not-learner', 'Only normal learner accounts can use the FSRS account-deletion flow.');
  }

  let deletion = await readDeletion(client, userId);
  if (!deletion) {
    await beginLearnerAccountDeletion({ db: input.db, userId });
    deletion = await readDeletion(client, userId);
  } else {
    await revokeAccess(client, userId);
  }
  if (!deletion) throw new Error('Learner deletion marker disappeared while the learner identity still exists.');

  let phase = String(deletion.phase) as LearnerAccountDeletionPhase;
  if (phase === 'identity_ready') {
    const remainingPhase = await firstRemainingPhase(client, userId);
    if (remainingPhase !== 'identity_ready') {
      await client.prepare(`
        UPDATE learner_account_deletions
        SET phase = ?, updated_at = ${DATABASE_NOW_MS_SQL}
        WHERE user_id = ?
      `).bind(remainingPhase, userId).run();
      return { userId, deleted: false, readyForIdentityDelete: false, rowsDeleted: 0, phase: remainingPhase };
    }
    return { userId, deleted: false, readyForIdentityDelete: true, rowsDeleted: 0, phase };
  }

  const descriptor = PHASES.find((candidate) => candidate.phase === phase);
  if (!descriptor) throw new Error(`Unsupported learner deletion phase: ${phase}`);

  const deleteResult = await client.prepare(`
    DELETE FROM ${descriptor.table}
    WHERE rowid IN (
      SELECT rowid FROM ${descriptor.table} WHERE ${descriptor.userColumn} = ? LIMIT ?
    )
  `).bind(userId, batchSize).run();
  const rowsDeleted = changes(deleteResult);
  const remaining = await client.prepare(`
    SELECT 1 AS present FROM ${descriptor.table} WHERE ${descriptor.userColumn} = ? LIMIT 1
  `).bind(userId).first();

  if (!remaining) {
    phase = descriptor.next;
    await client.prepare(`
      UPDATE learner_account_deletions
      SET phase = ?,
          batches_completed = batches_completed + 1,
          updated_at = ${DATABASE_NOW_MS_SQL}
      WHERE user_id = ?
    `).bind(phase, userId).run();
  } else {
    await client.prepare(`
      UPDATE learner_account_deletions
      SET batches_completed = batches_completed + 1,
          updated_at = ${DATABASE_NOW_MS_SQL}
      WHERE user_id = ?
    `).bind(userId).run();
  }

  return {
    userId,
    deleted: false,
    readyForIdentityDelete: false,
    rowsDeleted,
    phase
  };
}

export async function getLearnerAccountDeletionStatus(
  db: import('./index.js').LearningDb,
  userIdInput: string
) {
  const userId = requiredString(userIdInput, 'Learner');
  const client = requireD1Client(db);
  const learner = await readLearner(client, userId);
  if (!learner) return { userId, deleted: true, inProgress: false, phase: null, batchesCompleted: 0 };
  const deletion = await readDeletion(client, userId);
  return {
    userId,
    deleted: false,
    inProgress: Boolean(deletion),
    phase: deletion ? String(deletion.phase) as LearnerAccountDeletionPhase : null,
    batchesCompleted: Number(deletion?.batches_completed ?? 0),
    banned: Boolean(Number(learner.banned ?? 0))
  };
}
