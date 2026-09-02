import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { cases } from './schema.js';

/** @param {string} name */
const timestamp = (name) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const learnerPreferences = sqliteTable(
  'learner_preferences',
  {
    // Better Auth owns the `user` table outside Drizzle's application schema.
    userId: text('user_id').primaryKey(),
    expandedLearning: integer('expanded_learning', { mode: 'boolean' }).notNull().default(false),
    scheduledOrder: text('scheduled_order', { enum: ['due_first', 'new_first'] })
      .notNull()
      .default('due_first'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    check(
      'learner_preferences_expanded_learning_check',
      sql`${table.expandedLearning} in (0, 1)`
    ),
    check(
      'learner_preferences_scheduled_order_check',
      sql`${table.scheduledOrder} in ('due_first', 'new_first')`
    )
  ]
);

export const learnerFsrsProfiles = sqliteTable(
  'learner_fsrs_profiles',
  {
    userId: text('user_id').primaryKey(),
    generation: integer('generation').notNull().default(1),
    reviewSequenceEpoch: integer('review_sequence_epoch').notNull().default(1),
    parameterRevision: integer('parameter_revision').notNull().default(1),
    schedulerRevision: integer('scheduler_revision').notNull().default(1),
    schedulerLibraryVersion: text('scheduler_library_version').notNull(),
    parametersJson: text('parameters_json').notNull(),
    detailedHistoryRetention: text('detailed_history_retention', {
      enum: ['24m', '36m', '60m', 'indefinite']
    })
      .notNull()
      .default('24m'),
    lastOptimizedAt: integer('last_optimized_at', { mode: 'timestamp_ms' }),
    lastDetailedCleanupAt: integer('last_detailed_cleanup_at', { mode: 'timestamp_ms' }),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    check('learner_fsrs_profiles_generation_check', sql`${table.generation} >= 1`),
    check(
      'learner_fsrs_profiles_review_sequence_epoch_check',
      sql`${table.reviewSequenceEpoch} >= 1`
    ),
    check(
      'learner_fsrs_profiles_parameter_revision_check',
      sql`${table.parameterRevision} >= 1`
    ),
    check(
      'learner_fsrs_profiles_scheduler_revision_check',
      sql`${table.schedulerRevision} >= 1`
    ),
    check(
      'learner_fsrs_profiles_history_retention_check',
      sql`${table.detailedHistoryRetention} in ('24m', '36m', '60m', 'indefinite')`
    )
  ]
);

export const learnerCaseFsrs = sqliteTable(
  'learner_case_fsrs',
  {
    userId: text('user_id').notNull(),
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    dueAt: integer('due_at', { mode: 'timestamp_ms' }).notNull(),
    stability: real('stability').notNull().default(0),
    difficulty: real('difficulty').notNull().default(0),
    state: integer('state').notNull().default(0),
    elapsedDays: integer('elapsed_days').notNull().default(0),
    scheduledDays: integer('scheduled_days').notNull().default(0),
    learningSteps: integer('learning_steps').notNull().default(0),
    reps: integer('reps').notNull().default(0),
    lapses: integer('lapses').notNull().default(0),
    lastReviewAt: integer('last_review_at', { mode: 'timestamp_ms' }),
    generation: integer('generation').notNull(),
    reviewSequenceEpoch: integer('review_sequence_epoch').notNull(),
    parameterRevision: integer('parameter_revision').notNull(),
    schedulerRevision: integer('scheduler_revision').notNull(),
    schedulerLibraryVersion: text('scheduler_library_version').notNull(),
    stateRevision: integer('state_revision').notNull().default(1),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.caseId], name: 'learner_case_fsrs_pk' }),
    index('learner_case_fsrs_due_idx').on(table.userId, table.dueAt, table.caseId),
    check('learner_case_fsrs_state_check', sql`${table.state} between 0 and 3`),
    check(
      'learner_case_fsrs_counter_check',
      sql`${table.elapsedDays} >= 0 and ${table.scheduledDays} >= 0 and ${table.learningSteps} >= 0 and ${table.reps} >= 0 and ${table.lapses} >= 0`
    ),
    check(
      'learner_case_fsrs_boundary_check',
      sql`${table.generation} >= 1 and ${table.reviewSequenceEpoch} >= 1 and ${table.parameterRevision} >= 1 and ${table.schedulerRevision} >= 1 and ${table.stateRevision} >= 1`
    )
  ]
);

export const learnerCaseEncounters = sqliteTable(
  'learner_case_encounters',
  {
    userId: text('user_id').notNull(),
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    firstScheduledCompletedAt: integer('first_scheduled_completed_at', { mode: 'timestamp_ms' }),
    freeFirstSeenAt: integer('free_first_seen_at', { mode: 'timestamp_ms' }),
    freeLastSeenAt: integer('free_last_seen_at', { mode: 'timestamp_ms' }),
    freeTimesStudied: integer('free_times_studied').notNull().default(0),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.caseId], name: 'learner_case_encounters_pk' }),
    index('learner_case_encounters_scheduled_idx').on(
      table.userId,
      table.firstScheduledCompletedAt,
      table.caseId
    ),
    check(
      'learner_case_encounters_free_times_studied_check',
      sql`${table.freeTimesStudied} >= 0`
    )
  ]
);

export const scheduledReviewEvents = sqliteTable(
  'scheduled_review_events',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    caseId: text('case_id').notNull(),
    caseTitleSnapshot: text('case_title_snapshot').notNull(),
    systemId: text('system_id').notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull(),
    rating: text('rating', { enum: ['again', 'hard', 'good', 'easy'] }).notNull(),
    contentMode: text('content_mode', { enum: ['original', 'expanded'] }).notNull(),
    generation: integer('generation').notNull(),
    reviewSequenceEpoch: integer('review_sequence_epoch').notNull(),
    sequenceNo: integer('sequence_no').notNull(),
    parameterRevision: integer('parameter_revision').notNull(),
    schedulerRevision: integer('scheduler_revision').notNull(),
    schedulerLibraryVersion: text('scheduler_library_version').notNull(),
    resultingStateRevision: integer('resulting_state_revision').notNull(),
    nextDueAt: integer('next_due_at', { mode: 'timestamp_ms' }).notNull(),
    // Part D completion context is compact retry/proof provenance, not a persisted run/session snapshot.
    queueClass: text('queue_class', { enum: ['due', 'new', 'repeat'] }),
    runId: text('run_id'),
    scopeFingerprint: text('scope_fingerprint'),
    runStartedAt: integer('run_started_at', { mode: 'timestamp_ms' }),
    resultingState: integer('resulting_state')
  },
  (table) => [
    uniqueIndex('scheduled_review_events_sequence_unique').on(
      table.userId,
      table.caseId,
      table.generation,
      table.reviewSequenceEpoch,
      table.sequenceNo
    ),
    index('scheduled_review_events_user_completed_idx').on(table.userId, table.completedAt, table.id),
    index('scheduled_review_events_user_generation_completed_idx').on(
      table.userId,
      table.generation,
      table.completedAt,
      table.id
    ),
    index('scheduled_review_events_user_system_completed_idx').on(
      table.userId,
      table.systemId,
      table.completedAt,
      table.id
    ),
    check(
      'scheduled_review_events_rating_check',
      sql`${table.rating} in ('again', 'hard', 'good', 'easy')`
    ),
    check(
      'scheduled_review_events_content_mode_check',
      sql`${table.contentMode} in ('original', 'expanded')`
    ),
    check(
      'scheduled_review_events_boundary_check',
      sql`${table.generation} >= 1 and ${table.reviewSequenceEpoch} >= 1 and ${table.sequenceNo} >= 1 and ${table.parameterRevision} >= 1 and ${table.schedulerRevision} >= 1 and ${table.resultingStateRevision} >= 1`
    )
  ]
);

export const learnerOptimizerEvidence = sqliteTable(
  'learner_optimizer_evidence',
  {
    eventId: text('event_id').primaryKey(),
    userId: text('user_id').notNull(),
    caseId: text('case_id').notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }).notNull(),
    rating: text('rating', { enum: ['again', 'hard', 'good', 'easy'] }).notNull(),
    generation: integer('generation').notNull(),
    reviewSequenceEpoch: integer('review_sequence_epoch').notNull(),
    sequenceNo: integer('sequence_no').notNull()
  },
  (table) => [
    uniqueIndex('learner_optimizer_evidence_sequence_unique').on(
      table.userId,
      table.caseId,
      table.generation,
      table.reviewSequenceEpoch,
      table.sequenceNo
    ),
    index('learner_optimizer_evidence_optimizer_idx').on(
      table.userId,
      table.generation,
      table.caseId,
      table.reviewSequenceEpoch,
      table.sequenceNo,
      table.eventId
    ),
    check(
      'learner_optimizer_evidence_rating_check',
      sql`${table.rating} in ('again', 'hard', 'good', 'easy')`
    ),
    check(
      'learner_optimizer_evidence_boundary_check',
      sql`${table.generation} >= 1 and ${table.reviewSequenceEpoch} >= 1 and ${table.sequenceNo} >= 1`
    )
  ]
);

export const learnerAggregates = sqliteTable(
  'learner_aggregates',
  {
    userId: text('user_id').primaryKey(),
    scheduledCompleted: integer('scheduled_completed').notNull().default(0),
    scheduledAgain: integer('scheduled_again').notNull().default(0),
    scheduledHard: integer('scheduled_hard').notNull().default(0),
    scheduledGood: integer('scheduled_good').notNull().default(0),
    scheduledEasy: integer('scheduled_easy').notNull().default(0),
    freeCompleted: integer('free_completed').notNull().default(0),
    firstActivityAt: integer('first_activity_at', { mode: 'timestamp_ms' }),
    lastActivityAt: integer('last_activity_at', { mode: 'timestamp_ms' }),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    check(
      'learner_aggregates_counts_check',
      sql`${table.scheduledCompleted} >= 0 and ${table.scheduledAgain} >= 0 and ${table.scheduledHard} >= 0 and ${table.scheduledGood} >= 0 and ${table.scheduledEasy} >= 0 and ${table.freeCompleted} >= 0`
    )
  ]
);

export const learnerSystemAggregates = sqliteTable(
  'learner_system_aggregates',
  {
    userId: text('user_id').notNull(),
    systemId: text('system_id').notNull(),
    scheduledCompleted: integer('scheduled_completed').notNull().default(0),
    scheduledAgain: integer('scheduled_again').notNull().default(0),
    scheduledHard: integer('scheduled_hard').notNull().default(0),
    scheduledGood: integer('scheduled_good').notNull().default(0),
    scheduledEasy: integer('scheduled_easy').notNull().default(0),
    firstCompletedAt: integer('first_completed_at', { mode: 'timestamp_ms' }),
    lastCompletedAt: integer('last_completed_at', { mode: 'timestamp_ms' }),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.systemId],
      name: 'learner_system_aggregates_pk'
    }),
    index('learner_system_aggregates_user_idx').on(table.userId, table.systemId),
    check(
      'learner_system_aggregates_counts_check',
      sql`${table.scheduledCompleted} >= 0 and ${table.scheduledAgain} >= 0 and ${table.scheduledHard} >= 0 and ${table.scheduledGood} >= 0 and ${table.scheduledEasy} >= 0`
    )
  ]
);
