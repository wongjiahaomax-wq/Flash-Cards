import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** @param {string} name */
const timestamp = (name) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const learnerSystemMonthlyBuckets = sqliteTable(
  'learner_system_monthly_buckets',
  {
    userId: text('user_id').notNull(),
    systemId: text('system_id').notNull(),
    monthStart: integer('month_start', { mode: 'timestamp_ms' }).notNull(),
    scheduledCompleted: integer('scheduled_completed').notNull().default(0),
    scheduledAgain: integer('scheduled_again').notNull().default(0),
    scheduledHard: integer('scheduled_hard').notNull().default(0),
    scheduledGood: integer('scheduled_good').notNull().default(0),
    scheduledEasy: integer('scheduled_easy').notNull().default(0),
    firstCompletedAt: integer('first_completed_at', { mode: 'timestamp_ms' }).notNull(),
    lastCompletedAt: integer('last_completed_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.systemId, table.monthStart],
      name: 'learner_system_monthly_buckets_pk'
    }),
    index('learner_system_monthly_buckets_user_month_idx').on(
      table.userId,
      table.monthStart,
      table.systemId
    ),
    index('learner_system_monthly_buckets_system_month_idx').on(
      table.systemId,
      table.monthStart,
      table.userId
    ),
    index('learner_system_monthly_buckets_month_idx').on(
      table.monthStart,
      table.systemId,
      table.userId
    ),
    check(
      'learner_system_monthly_buckets_counts_check',
      sql`${table.scheduledCompleted} >= 0 and ${table.scheduledAgain} >= 0 and ${table.scheduledHard} >= 0 and ${table.scheduledGood} >= 0 and ${table.scheduledEasy} >= 0`
    ),
    check(
      'learner_system_monthly_buckets_time_check',
      sql`${table.monthStart} >= 0 and ${table.firstCompletedAt} >= ${table.monthStart} and ${table.lastCompletedAt} >= ${table.firstCompletedAt}`
    )
  ]
);

export const learnerAccountDeletions = sqliteTable(
  'learner_account_deletions',
  {
    userId: text('user_id').primaryKey(),
    phase: text('phase', {
      enum: [
        'auth_verifications',
        'free_receipts',
        'scheduled_events',
        'active_reviews',
        'optimizer_evidence',
        'case_state',
        'case_encounters',
        'monthly_buckets',
        'system_aggregates',
        'learner_aggregates',
        'preferences',
        'profile',
        'identity_ready'
      ]
    })
      .notNull()
      .default('auth_verifications'),
    requestedAt: timestamp('requested_at'),
    updatedAt: timestamp('updated_at'),
    batchesCompleted: integer('batches_completed').notNull().default(0)
  },
  (table) => [
    check('learner_account_deletions_batches_check', sql`${table.batchesCompleted} >= 0`)
  ]
);
