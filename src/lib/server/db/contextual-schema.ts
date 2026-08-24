import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const activeFlag = () => integer('is_active', { mode: 'boolean' }).notNull().default(true);

/**
 * Additive 0015 view of `concepts`.
 *
 * The long-standing `concepts` export in schema.js intentionally keeps the
 * pre-0015 shape so established Topic-only code can run during a migration
 * rollout. Code that requires System/Topic classification must use this table
 * shape and therefore requires migration 0015.
 */
export const taxonomyConcepts = sqliteTable('concepts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  descriptionMd: text('description_md'),
  kind: text('kind').notNull().default('topic'),
  parentId: text('parent_id'),
  isActive: activeFlag(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
});

/**
 * Additive 0015 view of `reviews` for contextual route provenance.
 * Established Topic-only review code continues to use the pre-0015 `reviews`
 * shape from schema.js; contextual System/Tag routes use this view.
 */
export const reviewsWithRouteProvenance = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  caseId: text('case_id').notNull(),
  primaryConceptId: text('primary_concept_id').notNull(),
  studyConceptId: text('study_concept_id').notNull(),
  studySystemConceptId: text('study_system_concept_id'),
  routeType: text('route_type').notNull().default('topic'),
  studyTagId: text('study_tag_id'),
  caseTitleSnapshot: text('case_title_snapshot').notNull(),
  vignetteSnapshotMd: text('vignette_snapshot_md'),
  questionPoolMode: text('question_pool_mode').notNull().default('expanded'),
  status: text('status').notNull().default('started'),
  rating: text('rating'),
  startedAt: timestamp('started_at'),
  revealedAt: integer('revealed_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' })
});
