import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { activeReviews } from './active-review-schema.js';
import {
  FREE_COMPLETION_RECEIPT_TTL_MS,
  freeReviewCompletionReceipts
} from './free-study-schema.js';
import { learnerAggregates, learnerCaseEncounters } from './fsrs-schema.js';

const DATABASE_NOW_MS = sql`cast((julianday('now') - 2440587.5) * 86400000 as integer)`;
const DEFAULT_RECEIPT_CLEANUP_LIMIT = 100;
const MAX_RECEIPT_CLEANUP_LIMIT = 500;

export class FreeReviewCompletionError extends Error {
  /**
   * @param {'invalid-input'|'unavailable'|'unrevealed'|'expired'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = 'FreeReviewCompletionError';
    this.code = code;
  }
}

/** @param {unknown} value @param {string} label */
function requiredString(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    throw new FreeReviewCompletionError('invalid-input', `${label} is required.`);
  }
  return normalized;
}

/** @param {Date|number|string|null|undefined} value */
function timestampMs(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

/** @param {unknown} cause */
function databaseErrorMessage(cause) {
  return cause instanceof Error ? cause.message : String(cause ?? '');
}

/** @param {import('./index.js').LearningDb} db @param {string} userId @param {string} reviewId */
async function readReceipt(db, userId, reviewId) {
  const rows = await db
    .select()
    .from(freeReviewCompletionReceipts)
    .where(and(
      eq(freeReviewCompletionReceipts.id, reviewId),
      eq(freeReviewCompletionReceipts.userId, userId)
    ))
    .limit(1);
  return rows[0] ?? null;
}

/** @param {import('./index.js').LearningDb} db @param {string} userId @param {string} reviewId */
async function readCompletableActiveReview(db, userId, reviewId) {
  const rows = await db
    .select()
    .from(activeReviews)
    .where(and(
      eq(activeReviews.id, reviewId),
      eq(activeReviews.userId, userId),
      eq(activeReviews.studyMode, 'free'),
      sql`${activeReviews.expiresAt} > ${DATABASE_NOW_MS}`
    ))
    .limit(1);
  return rows[0] ?? null;
}

/** @param {any} receipt */
function completionResponse(receipt) {
  return {
    receiptId: receipt.id,
    caseId: receipt.caseId,
    completedAt: /** @type {Date} */ (receipt.completedAt).getTime(),
    freeTimesStudied: Number(receipt.resultingFreeTimesStudied),
    receiptExpiresAt: /** @type {Date} */ (receipt.expiresAt).getTime()
  };
}

/** @param {unknown} cause */
function mappedWriteError(cause) {
  if (cause instanceof FreeReviewCompletionError) return cause;
  const message = databaseErrorMessage(cause);
  if (message.includes('free_completion_unrevealed')) {
    return new FreeReviewCompletionError('unrevealed', 'Reveal the answers before completing this Free Review.');
  }
  if (message.includes('free_completion_expired')) {
    return new FreeReviewCompletionError('expired', 'This active Free Review expired before completion could commit.');
  }
  if (message.includes('free_completion_active_review_changed')) {
    return new FreeReviewCompletionError('unavailable', 'This active Free Review is no longer available for completion.');
  }
  return cause;
}

/**
 * Complete one frozen Free Study Review exactly once. Free completion writes no
 * FSRS state, Scheduled event, optimizer evidence, rating, or System aggregate.
 * The short-lived receipt exists only to make a lost-response retry safe.
 *
 * @param {{
 *   db:import('./index.js').LearningDb,
 *   userId:string,
 *   reviewId:string,
 *   now?:Date|number|string
 * }} input
 */
export async function completeFreeReview(input) {
  const userId = requiredString(input.userId, 'Learner');
  const reviewId = requiredString(input.reviewId, 'Active Review');
  const completedAt = timestampMs(input.now ?? new Date());
  if (completedAt == null) {
    throw new FreeReviewCompletionError('invalid-input', 'Free completion time is invalid.');
  }

  const existingReceipt = await readReceipt(input.db, userId, reviewId);
  if (existingReceipt) {
    return { status: 'replayed', ...completionResponse(existingReceipt) };
  }

  const activeReview = await readCompletableActiveReview(input.db, userId, reviewId);
  if (!activeReview) {
    const racedReceipt = await readReceipt(input.db, userId, reviewId);
    if (racedReceipt) {
      return { status: 'replayed', ...completionResponse(racedReceipt) };
    }
    throw new FreeReviewCompletionError(
      'unavailable',
      'No unexpired active Free Review is available to complete.'
    );
  }
  if (!activeReview.revealedAt) {
    throw new FreeReviewCompletionError(
      'unrevealed',
      'Reveal the answers before completing this Free Review.'
    );
  }

  const client = input.db.$client;
  if (!client || typeof client.prepare !== 'function' || typeof client.batch !== 'function') {
    throw new Error('Free Review completion requires a Cloudflare D1 client with atomic batch support.');
  }

  const writes = [
    client.prepare(`
      INSERT INTO free_review_completion_receipts (
        id, user_id, case_id, completed_at, resulting_free_times_studied
      ) VALUES (
        ?, ?, ?, ?,
        coalesce((
          SELECT free_times_studied
          FROM learner_case_encounters
          WHERE user_id = ? AND case_id = ?
        ), 0) + 1
      )
    `).bind(
      reviewId,
      userId,
      activeReview.caseId,
      completedAt,
      userId,
      activeReview.caseId
    ),
    client.prepare(`
      INSERT INTO learner_case_encounters (
        user_id, case_id, free_first_seen_at, free_last_seen_at, free_times_studied
      ) VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(user_id, case_id) DO UPDATE SET
        free_first_seen_at = coalesce(
          learner_case_encounters.free_first_seen_at,
          excluded.free_first_seen_at
        ),
        free_last_seen_at = excluded.free_last_seen_at,
        free_times_studied = learner_case_encounters.free_times_studied + 1,
        updated_at = cast((julianday('now') - 2440587.5) * 86400000 as integer)
    `).bind(userId, activeReview.caseId, completedAt, completedAt),
    client.prepare(`
      INSERT INTO learner_aggregates (
        user_id, free_completed, first_activity_at, last_activity_at
      ) VALUES (?, 1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        free_completed = learner_aggregates.free_completed + 1,
        first_activity_at = coalesce(
          learner_aggregates.first_activity_at,
          excluded.first_activity_at
        ),
        last_activity_at = excluded.last_activity_at,
        updated_at = cast((julianday('now') - 2440587.5) * 86400000 as integer)
    `).bind(userId, completedAt, completedAt),
    client.prepare(`
      DELETE FROM active_reviews
      WHERE id = ? AND user_id = ? AND study_mode = 'free'
    `).bind(reviewId, userId)
  ];

  try {
    await client.batch(writes);
  } catch (cause) {
    const committed = await readReceipt(input.db, userId, reviewId);
    if (committed) {
      return { status: 'replayed', ...completionResponse(committed) };
    }
    throw mappedWriteError(cause);
  }

  const receipt = await readReceipt(input.db, userId, reviewId);
  if (!receipt) {
    throw new Error('Free Review completion committed without a retry receipt.');
  }
  return { status: 'completed', ...completionResponse(receipt) };
}

/**
 * Bounded maintenance cleanup for expired retry receipts. Receipt expiry is not
 * required before a learner can continue studying; it only bounds retry storage.
 *
 * @param {import('./index.js').LearningDb} db
 * @param {{limit?:number}} [options]
 */
export async function cleanupExpiredFreeCompletionReceipts(db, options = {}) {
  const limit = options.limit ?? DEFAULT_RECEIPT_CLEANUP_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RECEIPT_CLEANUP_LIMIT) {
    throw new FreeReviewCompletionError(
      'invalid-input',
      `Free receipt cleanup limit must be an integer from 1 to ${MAX_RECEIPT_CLEANUP_LIMIT}.`
    );
  }

  const expired = await db
    .select({ id: freeReviewCompletionReceipts.id })
    .from(freeReviewCompletionReceipts)
    .where(sql`${freeReviewCompletionReceipts.expiresAt} <= ${DATABASE_NOW_MS}`)
    .orderBy(asc(freeReviewCompletionReceipts.expiresAt), asc(freeReviewCompletionReceipts.id))
    .limit(limit);
  if (expired.length === 0) return [];

  return db
    .delete(freeReviewCompletionReceipts)
    .where(inArray(freeReviewCompletionReceipts.id, expired.map((row) => row.id)))
    .returning({
      id: freeReviewCompletionReceipts.id,
      userId: freeReviewCompletionReceipts.userId,
      caseId: freeReviewCompletionReceipts.caseId
    });
}

export { FREE_COMPLETION_RECEIPT_TTL_MS };
