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

/** @param {string} name */
const timestamp = (name) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const activeFlag = () => integer('is_active', { mode: 'boolean' }).notNull().default(true);

export const previewSessions = sqliteTable(
  'preview_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    status: text('status').notNull().default('active'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    uniqueIndex('preview_sessions_one_live_user_unique')
      .on(table.userId)
      .where(sql`${table.status} in ('active', 'cleanup_required')`),
    index('preview_sessions_expiry_idx').on(table.expiresAt, table.status),
    check('preview_sessions_status_check', sql`${table.status} in ('active', 'cleanup_required', 'cleaned')`)
  ]
);

export const concepts = sqliteTable(
  'concepts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    descriptionMd: text('description_md'),
    parentId: text('parent_id').references(
      /** @returns {import('drizzle-orm/sqlite-core').AnySQLiteColumn} */ () => concepts.id,
      { onDelete: 'restrict' }
    ),
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
    questionSelectionMode: text('question_selection_mode').notNull().default('automatic'),
    questionCount: integer('question_count'),
    previewSessionId: text('preview_session_id').references(() => previewSessions.id, { onDelete: 'restrict' }),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    index('cases_active_idx').on(table.isActive),
    index('cases_preview_session_idx').on(table.previewSessionId),
    check('cases_question_selection_mode_check', sql`${table.questionSelectionMode} in ('automatic', 'all', 'fixed')`),
    check('cases_question_count_check', sql`${table.questionCount} is null or ${table.questionCount} > 0`),
    check(
      'cases_fixed_question_count_check',
      sql`${table.questionSelectionMode} <> 'fixed' or ${table.questionCount} is not null`
    )
  ]
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

export const imageCollections = sqliteTable(
  'image_collections',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    uniqueIndex('image_collections_name_unique').on(table.name),
    index('image_collections_name_idx').on(table.name)
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
    imageCollectionId: text('image_collection_id').references(() => imageCollections.id, { onDelete: 'set null' }),
    previewSessionId: text('preview_session_id').references(() => previewSessions.id, { onDelete: 'restrict' }),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    uniqueIndex('assets_storage_key_unique').on(table.storageKey),
    index('assets_active_idx').on(table.isActive),
    index('assets_image_collection_idx').on(table.imageCollectionId),
    index('assets_preview_session_idx').on(table.previewSessionId)
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

export const stimulusGroups = sqliteTable(
  'stimulus_groups',
  {
    id: text('id').primaryKey(),
    caseId: text('case_id').notNull().references(() => cases.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull(),
    selectionCount: integer('selection_count').notNull().default(1),
    specificQuestionMode: text('specific_question_mode').notNull().default('none'),
    minimumSpecificQuestions: integer('minimum_specific_questions'),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    index('stimulus_groups_case_idx').on(table.caseId, table.displayOrder),
    index('stimulus_groups_active_idx').on(table.caseId, table.isActive),
    check('stimulus_groups_display_order_nonnegative', sql`${table.displayOrder} >= 0`),
    check('stimulus_groups_selection_count_positive', sql`${table.selectionCount} > 0`),
    check('stimulus_groups_specific_mode_check', sql`${table.specificQuestionMode} in ('none', 'minimum', 'all')`),
    check(
      'stimulus_groups_minimum_check',
      sql`${table.minimumSpecificQuestions} is null or ${table.minimumSpecificQuestions} > 0`
    )
  ]
);

export const stimulusGroupOptions = sqliteTable(
  'stimulus_group_options',
  {
    id: text('id').primaryKey(),
    stimulusGroupId: text('stimulus_group_id').notNull().references(() => stimulusGroups.id, { onDelete: 'restrict' }),
    assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'restrict' }),
    displayOrder: integer('display_order').notNull(),
    captionMd: text('caption_md'),
    isActive: activeFlag(),
    createdAt: timestamp('created_at')
  },
  (table) => [
    uniqueIndex('stimulus_group_options_group_asset_unique').on(table.stimulusGroupId, table.assetId),
    uniqueIndex('stimulus_group_options_group_order_unique').on(table.stimulusGroupId, table.displayOrder),
    index('stimulus_group_options_asset_idx').on(table.assetId),
    index('stimulus_group_options_active_idx').on(table.stimulusGroupId, table.isActive),
    check('stimulus_group_options_display_order_nonnegative', sql`${table.displayOrder} >= 0`)
  ]
);

export const questionPrompts = sqliteTable(
  'question_prompts',
  {
    id: text('id').primaryKey(),
    promptMd: text('prompt_md').notNull(),
    previewSessionId: text('preview_session_id').references(() => previewSessions.id, { onDelete: 'restrict' }),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    index('question_prompts_active_idx').on(table.isActive),
    index('question_prompts_preview_session_idx').on(table.previewSessionId)
  ]
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

export const stimulusGroupQuestions = sqliteTable(
  'stimulus_group_questions',
  {
    id: text('id').primaryKey(),
    stimulusGroupId: text('stimulus_group_id').notNull().references(() => stimulusGroups.id, { onDelete: 'restrict' }),
    questionPromptId: text('question_prompt_id').notNull().references(() => questionPrompts.id, { onDelete: 'restrict' }),
    answerMd: text('answer_md').notNull(),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    uniqueIndex('stimulus_group_questions_group_prompt_unique').on(table.stimulusGroupId, table.questionPromptId),
    index('stimulus_group_questions_prompt_idx').on(table.questionPromptId),
    index('stimulus_group_questions_group_active_idx').on(table.stimulusGroupId, table.isActive)
  ]
);

export const stimulusOptionQuestions = sqliteTable(
  'stimulus_option_questions',
  {
    id: text('id').primaryKey(),
    stimulusGroupOptionId: text('stimulus_group_option_id').notNull().references(() => stimulusGroupOptions.id, { onDelete: 'restrict' }),
    questionPromptId: text('question_prompt_id').notNull().references(() => questionPrompts.id, { onDelete: 'restrict' }),
    answerMd: text('answer_md').notNull(),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    uniqueIndex('stimulus_option_questions_option_prompt_unique').on(table.stimulusGroupOptionId, table.questionPromptId),
    index('stimulus_option_questions_prompt_idx').on(table.questionPromptId),
    index('stimulus_option_questions_option_active_idx').on(table.stimulusGroupOptionId, table.isActive)
  ]
);

export const assetQuestions = sqliteTable(
  'asset_questions',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'restrict' }),
    questionPromptId: text('question_prompt_id').notNull().references(() => questionPrompts.id, { onDelete: 'restrict' }),
    answerMd: text('answer_md').notNull(),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    uniqueIndex('asset_questions_asset_prompt_unique').on(table.assetId, table.questionPromptId),
    index('asset_questions_prompt_idx').on(table.questionPromptId),
    index('asset_questions_asset_active_idx').on(table.assetId, table.isActive)
  ]
);

export const stimulusOptionAssetQuestions = sqliteTable(
  'stimulus_option_asset_questions',
  {
    stimulusGroupOptionId: text('stimulus_group_option_id').notNull().references(() => stimulusGroupOptions.id, { onDelete: 'restrict' }),
    assetQuestionId: text('asset_question_id').notNull().references(() => assetQuestions.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at')
  },
  (table) => [
    primaryKey({ columns: [table.stimulusGroupOptionId, table.assetQuestionId], name: 'stimulus_option_asset_questions_pk' }),
    index('stimulus_option_asset_questions_question_idx').on(table.assetQuestionId)
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
    studyConceptId: text('study_concept_id')
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
    index('reviews_study_concept_completed_idx').on(table.studyConceptId, table.completedAt),
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
    sourceStimulusGroupId: text('source_stimulus_group_id').references(() => stimulusGroups.id, { onDelete: 'restrict' }),
    sourceStimulusOptionId: text('source_stimulus_option_id').references(() => stimulusGroupOptions.id, { onDelete: 'restrict' }),
    sourceAssetQuestionId: text('source_asset_question_id').references(() => assetQuestions.id, { onDelete: 'restrict' }),
    // The D1 migration enforces this FK to shared_questions. Declaring it here
    // would create a schema.js <-> tag-schema.js module cycle for one nullable
    // provenance field, so Drizzle keeps the column shape without the callback.
    sourceSharedQuestionId: text('source_shared_question_id'),
    displayOrder: integer('display_order').notNull(),
    promptSnapshotMd: text('prompt_snapshot_md').notNull(),
    answerSnapshotMd: text('answer_snapshot_md').notNull()
  },
  (table) => [
    uniqueIndex('review_questions_review_order_unique').on(table.reviewId, table.displayOrder),
    uniqueIndex('review_questions_review_prompt_unique').on(table.reviewId, table.questionPromptId),
    index('review_questions_prompt_idx').on(table.questionPromptId),
    index('review_questions_asset_question_idx').on(table.sourceAssetQuestionId),
    index('review_questions_shared_question_idx').on(table.sourceSharedQuestionId),
    check(
      'review_questions_source_type_check',
      sql`${table.sourceType} in ('case', 'concept', 'ancestor_concept', 'stimulus_group', 'asset', 'stimulus_option', 'tag_shared')`
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
    altTextSnapshot: text('alt_text_snapshot'),
    sourceStimulusGroupId: text('source_stimulus_group_id').references(() => stimulusGroups.id, { onDelete: 'restrict' }),
    sourceStimulusOptionId: text('source_stimulus_option_id').references(() => stimulusGroupOptions.id, { onDelete: 'restrict' })
  },
  (table) => [
    uniqueIndex('review_assets_review_order_unique').on(table.reviewId, table.displayOrder),
    uniqueIndex('review_assets_review_asset_unique').on(table.reviewId, table.assetId),
    check('review_assets_display_order_nonnegative', sql`${table.displayOrder} >= 0`)
  ]
);