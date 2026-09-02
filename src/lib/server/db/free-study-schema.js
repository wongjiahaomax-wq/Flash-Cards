import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const FREE_COMPLETION_RECEIPT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const freeReviewCompletionReceipts = sqliteTable(
  'free_review_completion_receipts',
  {
    id: text('id').primaryKey(),
    // Better Auth owns the `user` table outside Drizzle's application schema.
    userId: text('user_id').notNull(),
    caseId: text('case_id').notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull(),
    resultingFreeTimesStudied: integer('resulting_free_times_studied').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer) + 604800000)`)
  },
  (table) => [
    index('free_review_completion_receipts_expiry_idx').on(
      table.expiresAt,
      table.userId,
      table.id
    ),
    index('free_review_completion_receipts_user_idx').on(table.userId, table.id),
    check(
      'free_review_completion_receipts_count_check',
      sql`${table.resultingFreeTimesStudied} >= 1`
    ),
    check(
      'free_review_completion_receipts_expiry_check',
      sql`${table.expiresAt} > ${table.completedAt}`
    )
  ]
);
