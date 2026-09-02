import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { assets, cases, concepts } from './schema.js';

/** @param {string} name */
const writeTimestamp = (name) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer))`);

export const activeReviews = sqliteTable(
  'active_reviews',
  {
    id: text('id').primaryKey(),
    // Better Auth owns the `user` table outside Drizzle's application schema.
    userId: text('user_id').notNull(),
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    systemId: text('system_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'restrict' }),
    studyMode: text('study_mode', { enum: ['scheduled', 'free'] }).notNull(),
    contentMode: text('content_mode', { enum: ['original', 'expanded'] }).notNull(),
    queueClass: text('queue_class', { enum: ['due', 'new', 'repeat'] }),
    runId: text('run_id').notNull(),
    scopeFingerprint: text('scope_fingerprint').notNull(),
    scopeJson: text('scope_json').notNull(),
    generation: integer('generation'),
    reviewSequenceEpoch: integer('review_sequence_epoch'),
    parameterRevision: integer('parameter_revision'),
    schedulerRevision: integer('scheduler_revision'),
    schedulerLibraryVersion: text('scheduler_library_version'),
    expectedStateRevision: integer('expected_state_revision'),
    expectedDueAt: integer('expected_due_at', { mode: 'timestamp_ms' }),
    runStartedAt: integer('run_started_at', { mode: 'timestamp_ms' }),
    caseTitleSnapshot: text('case_title_snapshot').notNull(),
    vignetteSnapshotMd: text('vignette_snapshot_md'),
    snapshotVersion: integer('snapshot_version').notNull().default(1),
    startedAt: writeTimestamp('started_at'),
    revealedAt: integer('revealed_at', { mode: 'timestamp_ms' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(cast((julianday('now') - 2440587.5) * 86400000 as integer) + 604800000)`)
  },
  (table) => [
    uniqueIndex('active_reviews_one_per_user_unique').on(table.userId),
    index('active_reviews_expiry_idx').on(table.expiresAt, table.userId),
    index('active_reviews_case_idx').on(table.caseId, table.userId),
    index('active_reviews_asset_lifecycle_context_idx').on(table.systemId, table.userId),
    check('active_reviews_study_mode_check', sql`${table.studyMode} in ('scheduled', 'free')`),
    check('active_reviews_content_mode_check', sql`${table.contentMode} in ('original', 'expanded')`),
    check(
      'active_reviews_queue_class_check',
      sql`${table.queueClass} is null or ${table.queueClass} in ('due', 'new', 'repeat')`
    ),
    check('active_reviews_scope_json_check', sql`json_valid(${table.scopeJson})`),
    check(
      'active_reviews_scope_system_check',
      sql`json_extract(${table.scopeJson}, '$.systemId') = ${table.systemId}`
    ),
    check('active_reviews_snapshot_version_check', sql`${table.snapshotVersion} = 1`),
    check('active_reviews_expiry_check', sql`${table.expiresAt} > ${table.startedAt}`),
    check(
      'active_reviews_mode_boundary_check',
      sql`(
        ${table.studyMode} = 'free'
        and ${table.queueClass} is null
        and ${table.generation} is null
        and ${table.reviewSequenceEpoch} is null
        and ${table.parameterRevision} is null
        and ${table.schedulerRevision} is null
        and ${table.schedulerLibraryVersion} is null
        and ${table.expectedStateRevision} is null
        and ${table.expectedDueAt} is null
        and ${table.runStartedAt} is null
      ) or (
        ${table.studyMode} = 'scheduled'
        and ${table.queueClass} is not null
        and ${table.generation} >= 1
        and ${table.reviewSequenceEpoch} >= 1
        and ${table.parameterRevision} >= 1
        and ${table.schedulerRevision} >= 1
        and ${table.schedulerLibraryVersion} is not null
        and ${table.runStartedAt} is not null
        and (
          (${table.queueClass} = 'new' and ${table.expectedStateRevision} is null and ${table.expectedDueAt} is null)
          or (${table.queueClass} in ('due', 'repeat') and ${table.expectedStateRevision} >= 1 and ${table.expectedDueAt} is not null)
        )
      )`
    )
  ]
);

export const activeReviewQuestions = sqliteTable(
  'active_review_questions',
  {
    id: text('id').primaryKey(),
    activeReviewId: text('active_review_id')
      .notNull()
      .references(() => activeReviews.id, { onDelete: 'cascade' }),
    questionPromptId: text('question_prompt_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceConceptId: text('source_concept_id'),
    sourceStimulusGroupId: text('source_stimulus_group_id'),
    sourceStimulusOptionId: text('source_stimulus_option_id'),
    sourceAssetQuestionId: text('source_asset_question_id'),
    sourceSharedQuestionId: text('source_shared_question_id'),
    displayOrder: integer('display_order').notNull(),
    promptSnapshotMd: text('prompt_snapshot_md').notNull(),
    answerSnapshotMd: text('answer_snapshot_md').notNull()
  },
  (table) => [
    uniqueIndex('active_review_questions_order_unique').on(table.activeReviewId, table.displayOrder),
    index('active_review_questions_review_idx').on(table.activeReviewId, table.displayOrder),
    check('active_review_questions_display_order_check', sql`${table.displayOrder} >= 0`)
  ]
);

export const activeReviewAssets = sqliteTable(
  'active_review_assets',
  {
    id: text('id').primaryKey(),
    activeReviewId: text('active_review_id')
      .notNull()
      .references(() => activeReviews.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    displayOrder: integer('display_order').notNull(),
    storageKeySnapshot: text('storage_key_snapshot').notNull(),
    captionSnapshotMd: text('caption_snapshot_md'),
    altTextSnapshot: text('alt_text_snapshot'),
    sourceStimulusGroupId: text('source_stimulus_group_id'),
    sourceStimulusOptionId: text('source_stimulus_option_id')
  },
  (table) => [
    uniqueIndex('active_review_assets_order_unique').on(table.activeReviewId, table.displayOrder),
    uniqueIndex('active_review_assets_asset_unique').on(table.activeReviewId, table.assetId),
    index('active_review_assets_asset_idx').on(table.assetId, table.activeReviewId),
    check('active_review_assets_display_order_check', sql`${table.displayOrder} >= 0`)
  ]
);
