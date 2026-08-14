import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core';

const timestamp = (name) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const activeFlag = () => integer('is_active', { mode: 'boolean' }).notNull().default(true);

export const concepts = sqliteTable(
  'concepts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    descriptionMd: text('description_md'),
    parentId: text('parent_id').references(() => concepts.id, { onDelete: 'restrict' }),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    uniqueIndex('concepts_slug_unique').on(table.slug),
    index('concepts_parent_idx').on(table.parentId),
    check('concepts_parent_not_self', sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`)
  ]
);

export const cases = sqliteTable(
  'cases',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    vignetteMd: text('vignette_md'),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [index('cases_active_idx').on(table.isActive)]
);

export const caseConcepts = sqliteTable(
  'case_concepts',
  {
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    conceptId: text('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at')
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.conceptId], name: 'case_concepts_pk' }),
    index('case_concepts_concept_idx').on(table.conceptId),
    index('case_concepts_case_role_idx').on(table.caseId, table.role),
    check('case_concepts_role_check', sql`${table.role} in ('primary', 'secondary')`)
  ]
);

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull().default('image'),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    originalFilename: text('original_filename'),
    altText: text('alt_text'),
    sourceLabel: text('source_label'),
    sourceUrl: text('source_url'),
    licence: text('licence'),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    uniqueIndex('assets_storage_key_unique').on(table.storageKey),
    index('assets_active_idx').on(table.isActive)
  ]
);

export const caseAssets = sqliteTable(
  'case_assets',
  {
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    displayOrder: integer('display_order').notNull(),
    captionMd: text('caption_md'),
    createdAt: timestamp('created_at')
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.assetId], name: 'case_assets_pk' }),
    uniqueIndex('case_assets_case_order_unique').on(table.caseId, table.displayOrder),
    index('case_assets_asset_idx').on(table.assetId),
    check('case_assets_display_order_nonnegative', sql`${table.displayOrder} >= 0`)
  ]
);

export const questionPrompts = sqliteTable(
  'question_prompts',
  {
    id: text('id').primaryKey(),
    promptMd: text('prompt_md').notNull(),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [index('question_prompts_active_idx').on(table.isActive)]
);

export const conceptQuestions = sqliteTable(
  'concept_questions',
  {
    id: text('id').primaryKey(),
    conceptId: text('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'restrict' }),
    questionPromptId: text('question_prompt_id')
      .notNull()
      .references(() => questionPrompts.id, { onDelete: 'restrict' }),
    answerMd: text('answer_md').notNull(),
    inheritToDescendants: integer('inherit_to_descendants', { mode: 'boolean' })
      .notNull()
      .default(false),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    uniqueIndex('concept_questions_concept_prompt_unique').on(
      table.conceptId,
      table.questionPromptId
    ),
    index('concept_questions_prompt_idx').on(table.questionPromptId),
    index('concept_questions_concept_active_idx').on(table.conceptId, table.isActive)
  ]
);

export const caseQuestions = sqliteTable(
  'case_questions',
  {
    id: text('id').primaryKey(),
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    questionPromptId: text('question_prompt_id')
      .notNull()
      .references(() => questionPrompts.id, { onDelete: 'restrict' }),
    answerMd: text('answer_md').notNull(),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    uniqueIndex('case_questions_case_prompt_unique').on(table.caseId, table.questionPromptId),
    index('case_questions_prompt_idx').on(table.questionPromptId),
    index('case_questions_case_active_idx').on(table.caseId, table.isActive)
  ]
);

export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    primaryConceptId: text('primary_concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'restrict' }),
    caseTitleSnapshot: text('case_title_snapshot').notNull(),
    vignetteSnapshotMd: text('vignette_snapshot_md'),
    status: text('status').notNull().default('started'),
    rating: text('rating'),
    startedAt: timestamp('started_at'),
    revealedAt: integer('revealed_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' })
  },
  (table) => [
    index('reviews_user_completed_idx').on(table.userId, table.completedAt),
    index('reviews_case_completed_idx').on(table.caseId, table.completedAt),
    index('reviews_concept_completed_idx').on(table.primaryConceptId, table.completedAt),
    check('reviews_status_check', sql`${table.status} in ('started', 'completed')`),
    check('reviews_rating_check', sql`${table.rating} is null or ${table.rating} in ('again', 'good')`)
  ]
);

export const reviewQuestions = sqliteTable(
  'review_questions',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'restrict' }),
    questionPromptId: text('question_prompt_id')
      .notNull()
      .references(() => questionPrompts.id, { onDelete: 'restrict' }),
    sourceType: text('source_type').notNull(),
    sourceConceptId: text('source_concept_id').references(() => concepts.id, { onDelete: 'restrict' }),
    displayOrder: integer('display_order').notNull(),
    promptSnapshotMd: text('prompt_snapshot_md').notNull(),
    answerSnapshotMd: text('answer_snapshot_md').notNull()
  },
  (table) => [
    uniqueIndex('review_questions_review_order_unique').on(table.reviewId, table.displayOrder),
    uniqueIndex('review_questions_review_prompt_unique').on(table.reviewId, table.questionPromptId),
    index('review_questions_prompt_idx').on(table.questionPromptId),
    check(
      'review_questions_source_type_check',
      sql`${table.sourceType} in ('case', 'concept', 'ancestor_concept')`
    ),
    check('review_questions_display_order_nonnegative', sql`${table.displayOrder} >= 0`)
  ]
);

export const reviewAssets = sqliteTable(
  'review_assets',
  {
    id: text('id').primaryKey(),
    reviewId: text('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'restrict' }),
    assetId: text('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    displayOrder: integer('display_order').notNull(),
    storageKeySnapshot: text('storage_key_snapshot').notNull(),
    captionSnapshotMd: text('caption_snapshot_md'),
    altTextSnapshot: text('alt_text_snapshot')
  },
  (table) => [
    uniqueIndex('review_assets_review_order_unique').on(table.reviewId, table.displayOrder),
    uniqueIndex('review_assets_review_asset_unique').on(table.reviewId, table.assetId),
    check('review_assets_display_order_nonnegative', sql`${table.displayOrder} >= 0`)
  ]
);
