import { STUDY_DATA_DELETION_PHASES } from './study-data-deletion-schema.js';

export { STUDY_DATA_DELETION_FENCE_ERROR } from './study-data-deletion-fence.js';
export const STUDY_DATA_DELETION_COMPLETE_PHASE = 'complete';
export const STUDY_DATA_DELETION_BATCH_SIZE = 1_000;

const DATABASE_NOW_MS_SQL = "cast((julianday('now') - 2440587.5) * 86400000 as integer)";

export type StudyDataDeletionPhase = (typeof STUDY_DATA_DELETION_PHASES)[number];

export class StudyDataDeletionError extends Error {
  code: 'invalid-input' | 'user-not-found';

  constructor(code: StudyDataDeletionError['code'], message: string) {
    super(message);
    this.name = 'StudyDataDeletionError';
    this.code = code;
  }
}

function requiredUserId(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new StudyDataDeletionError('invalid-input', 'User is required.');
  return normalized;
}

function requireD1Client(db: import('./index.js').LearningDb): D1Database {
  const client = db.$client;
  if (!client || typeof client.prepare !== 'function' || typeof client.batch !== 'function') {
    throw new Error('Study-data deletion requires a Cloudflare D1 client with atomic batch support.');
  }
  return client;
}

type StudyDataDeletionRow = {
  user_id: string;
  phase: StudyDataDeletionPhase;
  requested_at: number;
  updated_at: number;
  batches_completed: number;
  completed_at: number | null;
};

type DeletionPhaseDescriptor = {
  phase: Exclude<StudyDataDeletionPhase, 'verify_empty' | 'complete'>;
  table: string;
  predicate: string;
  next: StudyDataDeletionPhase;
};

/**
 * The authoritative self-service study-data ownership boundary. Keep this
 * deliberately explicit: account deletion can reuse these descriptors later
 * without making self-service cleanup touch auth or learner preferences.
 */
export const STUDY_DATA_DELETION_DESCRIPTORS: readonly DeletionPhaseDescriptor[] = [
  { phase: 'active_reviews', table: 'active_reviews', predicate: 'user_id = ?', next: 'free_receipts' },
  { phase: 'free_receipts', table: 'free_review_completion_receipts', predicate: 'user_id = ?', next: 'scheduled_events' },
  { phase: 'scheduled_events', table: 'scheduled_review_events', predicate: 'user_id = ?', next: 'optimizer_evidence' },
  { phase: 'optimizer_evidence', table: 'learner_optimizer_evidence', predicate: 'user_id = ?', next: 'case_state' },
  { phase: 'case_state', table: 'learner_case_fsrs', predicate: 'user_id = ?', next: 'case_encounters' },
  { phase: 'case_encounters', table: 'learner_case_encounters', predicate: 'user_id = ?', next: 'monthly_buckets' },
  { phase: 'monthly_buckets', table: 'learner_system_monthly_buckets', predicate: 'user_id = ?', next: 'system_aggregates' },
  { phase: 'system_aggregates', table: 'learner_system_aggregates', predicate: 'user_id = ?', next: 'learner_aggregates' },
  { phase: 'learner_aggregates', table: 'learner_aggregates', predicate: 'user_id = ?', next: 'legacy_review_questions' },
  { phase: 'legacy_review_questions', table: 'review_questions', predicate: 'review_id IN (SELECT id FROM reviews WHERE user_id = ?)', next: 'legacy_review_assets' },
  { phase: 'legacy_review_assets', table: 'review_assets', predicate: 'review_id IN (SELECT id FROM reviews WHERE user_id = ?)', next: 'legacy_reviews' },
  { phase: 'legacy_reviews', table: 'reviews', predicate: 'user_id = ?', next: 'profile' },
  { phase: 'profile', table: 'learner_fsrs_profiles', predicate: 'user_id = ?', next: 'verify_empty' }
];

async function readMarker(client: D1Database, userId: string) {
  return await client.prepare(`
    SELECT user_id, phase, requested_at, updated_at, batches_completed, completed_at
    FROM learner_study_data_deletions
    WHERE user_id = ?
    LIMIT 1
  `).bind(userId).first<StudyDataDeletionRow>();
}

function markerResult(row: StudyDataDeletionRow) {
  return {
    userId: String(row.user_id),
    phase: row.phase,
    requestedAt: Number(row.requested_at),
    updatedAt: Number(row.updated_at),
    batchesCompleted: Number(row.batches_completed),
    completedAt: row.completed_at == null ? null : Number(row.completed_at),
    inProgress: row.phase !== STUDY_DATA_DELETION_COMPLETE_PHASE
  };
}

function changes(result: D1Result): number {
  return Number(result?.meta?.changes ?? 0);
}

function requiredBatchSize(value: number | undefined) {
  const batchSize = value ?? STUDY_DATA_DELETION_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > STUDY_DATA_DELETION_BATCH_SIZE) {
    throw new StudyDataDeletionError(
      'invalid-input',
      `Deletion batch size must be an integer from 1 to ${STUDY_DATA_DELETION_BATCH_SIZE}.`
    );
  }
  return batchSize;
}

async function firstRemainingPhase(client: D1Database, userId: string): Promise<StudyDataDeletionPhase> {
  for (const descriptor of STUDY_DATA_DELETION_DESCRIPTORS) {
    const remaining = await client.prepare(`
      SELECT 1 AS present FROM ${descriptor.table} WHERE ${descriptor.predicate} LIMIT 1
    `).bind(userId).first();
    if (remaining) return descriptor.phase;
  }
  return STUDY_DATA_DELETION_COMPLETE_PHASE;
}

/**
 * Create the durable self-service fence. An active marker is deliberately a
 * no-op so retries cannot rewind bounded progress. A completed marker is
 * atomically reactivated for a later, explicit deletion request.
 */
export async function beginStudyDataDeletion(input: {
  db: import('./index.js').LearningDb;
  userId: string;
}) {
  const userId = requiredUserId(input.userId);
  const client = requireD1Client(input.db);
  const user = await client.prepare('SELECT id FROM user WHERE id = ? LIMIT 1').bind(userId).first();
  if (!user) {
    throw new StudyDataDeletionError('user-not-found', 'The account no longer exists.');
  }

  await client.batch([
    client.prepare(`
      INSERT INTO learner_study_data_deletions (
        user_id, phase, requested_at, updated_at, batches_completed, completed_at
      ) VALUES (?, 'active_reviews', (unixepoch() * 1000), (unixepoch() * 1000), 0, NULL)
      ON CONFLICT(user_id) DO UPDATE SET
        phase = 'active_reviews',
        requested_at = excluded.requested_at,
        updated_at = excluded.updated_at,
        batches_completed = 0,
        completed_at = NULL
      WHERE learner_study_data_deletions.phase = 'complete'
    `).bind(userId)
  ]);

  const marker = await readMarker(client, userId);
  if (!marker) throw new Error('Study-data deletion started without a durable marker.');
  return markerResult(marker);
}

export async function getStudyDataDeletionStatus(
  db: import('./index.js').LearningDb,
  userIdInput: string
) {
  const userId = requiredUserId(userIdInput);
  const marker = await readMarker(requireD1Client(db), userId);
  return marker ? markerResult(marker) : null;
}

export async function isStudyDataDeletionActive(
  db: import('./index.js').LearningDb,
  userIdInput: string
) {
  const userId = requiredUserId(userIdInput);
  const client = requireD1Client(db);
  const row = await client.prepare(`
    SELECT phase
    FROM learner_study_data_deletions
    WHERE user_id = ?
    LIMIT 1
  `).bind(userId).first<{ phase: StudyDataDeletionPhase }>();
  return Boolean(row && row.phase !== STUDY_DATA_DELETION_COMPLETE_PHASE);
}

/**
 * Advance one bounded cleanup chunk. The marker stays fencing until every
 * study-owned table has been rescanned empty; it never deletes auth identity,
 * sessions, linked accounts, or learner preferences.
 */
export async function advanceStudyDataDeletion(input: {
  db: import('./index.js').LearningDb;
  userId: string;
  batchSize?: number;
}) {
  const userId = requiredUserId(input.userId);
  const batchSize = requiredBatchSize(input.batchSize);
  const client = requireD1Client(input.db);
  let marker = await readMarker(client, userId);
  if (!marker) {
    await beginStudyDataDeletion({ db: input.db, userId });
    marker = await readMarker(client, userId);
  }
  if (!marker) throw new Error('Study-data deletion started without a durable marker.');

  let phase = marker.phase;
  if (phase === STUDY_DATA_DELETION_COMPLETE_PHASE) {
    const remainingPhase = await firstRemainingPhase(client, userId);
    if (remainingPhase === STUDY_DATA_DELETION_COMPLETE_PHASE) {
      return { userId, phase, rowsDeleted: 0, complete: true };
    }
    await client.prepare(`
      UPDATE learner_study_data_deletions
      SET phase = ?, completed_at = NULL, updated_at = ${DATABASE_NOW_MS_SQL}
      WHERE user_id = ?
    `).bind(remainingPhase, userId).run();
    return { userId, phase: remainingPhase, rowsDeleted: 0, complete: false };
  }

  if (phase === 'verify_empty') {
    const remainingPhase = await firstRemainingPhase(client, userId);
    if (remainingPhase === STUDY_DATA_DELETION_COMPLETE_PHASE) {
      await client.prepare(`
        UPDATE learner_study_data_deletions
        SET phase = 'complete', completed_at = ${DATABASE_NOW_MS_SQL},
            batches_completed = batches_completed + 1, updated_at = ${DATABASE_NOW_MS_SQL}
        WHERE user_id = ?
      `).bind(userId).run();
      return { userId, phase: STUDY_DATA_DELETION_COMPLETE_PHASE, rowsDeleted: 0, complete: true };
    }
    await client.prepare(`
      UPDATE learner_study_data_deletions
      SET phase = ?, batches_completed = batches_completed + 1, updated_at = ${DATABASE_NOW_MS_SQL}
      WHERE user_id = ?
    `).bind(remainingPhase, userId).run();
    return { userId, phase: remainingPhase, rowsDeleted: 0, complete: false };
  }

  const descriptor = STUDY_DATA_DELETION_DESCRIPTORS.find((candidate) => candidate.phase === phase);
  if (!descriptor) throw new Error(`Unsupported study-data deletion phase: ${phase}`);

  const deleted = await client.prepare(`
    DELETE FROM ${descriptor.table}
    WHERE rowid IN (
      SELECT rowid FROM ${descriptor.table} WHERE ${descriptor.predicate} LIMIT ?
    )
  `).bind(userId, batchSize).run();
  const rowsDeleted = changes(deleted);
  const remaining = await client.prepare(`
    SELECT 1 AS present FROM ${descriptor.table} WHERE ${descriptor.predicate} LIMIT 1
  `).bind(userId).first();
  phase = remaining ? descriptor.phase : descriptor.next;

  await client.prepare(`
    UPDATE learner_study_data_deletions
    SET phase = ?, batches_completed = batches_completed + 1, updated_at = ${DATABASE_NOW_MS_SQL}
    WHERE user_id = ?
  `).bind(phase, userId).run();

  return { userId, phase, rowsDeleted, complete: false };
}
