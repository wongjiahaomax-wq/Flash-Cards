import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const timestamp = (name: string) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/**
 * Compatibility-only table shapes for code paths that intentionally remain
 * usable against a database before migration 0015 has been applied.
 *
 * These definitions are not part of drizzle.config.js and are not the
 * authoritative application schema. The canonical post-0015 definitions live
 * in schema.js.
 */
export const pre0015Concepts = sqliteTable('concepts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  descriptionMd: text('description_md'),
  parentId: text('parent_id'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at')
});

export const pre0015Reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  caseId: text('case_id').notNull(),
  primaryConceptId: text('primary_concept_id').notNull(),
  studyConceptId: text('study_concept_id').notNull(),
  caseTitleSnapshot: text('case_title_snapshot').notNull(),
  vignetteSnapshotMd: text('vignette_snapshot_md'),
  questionPoolMode: text('question_pool_mode').notNull().default('expanded'),
  status: text('status').notNull().default('started'),
  rating: text('rating'),
  startedAt: timestamp('started_at'),
  revealedAt: integer('revealed_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' })
});
