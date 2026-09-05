import { STUDY_DATA_DELETION_PHASES } from './study-data-deletion-schema.js';

export const STUDY_DATA_DELETION_FENCE_ERROR = 'learner_study_data_deletion_in_progress';
export const STUDY_DATA_DELETION_COMPLETE_PHASE = 'complete';

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
