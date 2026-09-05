import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The phases are declared now so the durable marker can carry the complete
 * staged-deletion state machine before later tranches add its workers.
 */
export const STUDY_DATA_DELETION_PHASES = [
  'active_reviews',
  'free_receipts',
  'scheduled_events',
  'optimizer_evidence',
  'case_state',
  'case_encounters',
  'monthly_buckets',
  'system_aggregates',
  'learner_aggregates',
  'legacy_review_questions',
  'legacy_review_assets',
  'legacy_reviews',
  'profile',
  'verify_empty',
  'complete'
];

/** @param {string} name */
const timestamp = (name) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const learnerStudyDataDeletions = sqliteTable(
  'learner_study_data_deletions',
  {
    // Better Auth owns the `user` table outside Drizzle's application schema.
    userId: text('user_id').primaryKey(),
    phase: text('phase')
      .notNull()
      .default('active_reviews'),
    requestedAt: timestamp('requested_at'),
    updatedAt: timestamp('updated_at'),
    batchesCompleted: integer('batches_completed').notNull().default(0),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' })
  },
  (table) => [
    check(
      'learner_study_data_deletions_phase_check',
      sql`${table.phase} in ('active_reviews', 'free_receipts', 'scheduled_events', 'optimizer_evidence', 'case_state', 'case_encounters', 'monthly_buckets', 'system_aggregates', 'learner_aggregates', 'legacy_review_questions', 'legacy_review_assets', 'legacy_reviews', 'profile', 'verify_empty', 'complete')`
    ),
    check(
      'learner_study_data_deletions_batches_check',
      sql`${table.batchesCompleted} >= 0`
    ),
    check(
      'learner_study_data_deletions_completion_check',
      sql`(${table.phase} = 'complete' and ${table.completedAt} is not null) or (${table.phase} <> 'complete' and ${table.completedAt} is null)`
    )
  ]
);
