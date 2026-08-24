import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from 'drizzle-orm/sqlite-core';

import { caseQuestions, cases, concepts, questionPrompts } from './schema.js';

/** @param {string} name */
const timestamp = (name) =>
  integer(name, { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const activeFlag = () => integer('is_active', { mode: 'boolean' }).notNull().default(true);

/**
 * Flat, administrator-curated clinical Tags.
 *
 * Tags deliberately remain separate from Topics. Learner visibility is
 * contextual and comes only from explicit System↔Tag curation.
 */
export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    uniqueIndex('tags_normalized_name_unique').on(table.normalizedName),
    index('tags_active_name_idx').on(table.isActive, table.name)
  ]
);

/**
 * Explicit learner-navigation exposure of one Tag inside one System.
 * A Tag may be exposed in several Systems; display order is System-local.
 */
export const systemTags = sqliteTable(
  'system_tags',
  {
    systemConceptId: text('system_concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'restrict' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at')
  },
  (table) => [
    primaryKey({ columns: [table.systemConceptId, table.tagId], name: 'system_tags_pk' }),
    uniqueIndex('system_tags_system_order_unique').on(table.systemConceptId, table.displayOrder),
    index('system_tags_tag_system_idx').on(table.tagId, table.systemConceptId)
  ]
);

/** Clinical concepts covered by a Case. */
export const caseTags = sqliteTable(
  'case_tags',
  {
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'restrict' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at')
  },
  (table) => [
    primaryKey({ columns: [table.caseId, table.tagId], name: 'case_tags_pk' }),
    index('case_tags_tag_case_idx').on(table.tagId, table.caseId)
  ]
);

/**
 * Knowledge tested by one contextual Case Question.
 *
 * Stage A intentionally starts at case_questions rather than question_prompts:
 * reusable prompt wording has no intrinsic clinical meaning.
 */
export const caseQuestionTags = sqliteTable(
  'case_question_tags',
  {
    caseQuestionId: text('case_question_id')
      .notNull()
      .references(() => caseQuestions.id, { onDelete: 'restrict' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at')
  },
  (table) => [
    primaryKey({ columns: [table.caseQuestionId, table.tagId], name: 'case_question_tags_pk' }),
    index('case_question_tags_tag_question_idx').on(table.tagId, table.caseQuestionId)
  ]
);

/**
 * Reusable medical meaning and answer for Tag-scoped reuse.
 *
 * question_prompts remains wording only. reuse_scope_tag_id is exactly one
 * eligibility Tag and is deliberately independent from descriptive Tags.
 */
export const sharedQuestions = sqliteTable(
  'shared_questions',
  {
    id: text('id').primaryKey(),
    questionPromptId: text('question_prompt_id')
      .notNull()
      .references(() => questionPrompts.id, { onDelete: 'restrict' }),
    answerMd: text('answer_md').notNull(),
    reuseScopeTagId: text('reuse_scope_tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
    isActive: activeFlag(),
    createdAt: timestamp('created_at'),
    updatedAt: timestamp('updated_at')
  },
  (table) => [
    index('shared_questions_prompt_idx').on(table.questionPromptId),
    index('shared_questions_scope_active_idx').on(table.reuseScopeTagId, table.isActive),
    index('shared_questions_active_idx').on(table.isActive),
    uniqueIndex('shared_questions_active_prompt_unique')
      .on(table.questionPromptId)
      .where(sql`${table.isActive} = true`)
  ]
);

/** Descriptive clinical Tags saying what a Shared Question teaches/tests. */
export const sharedQuestionTags = sqliteTable(
  'shared_question_tags',
  {
    sharedQuestionId: text('shared_question_id')
      .notNull()
      .references(() => sharedQuestions.id, { onDelete: 'restrict' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at')
  },
  (table) => [
    primaryKey({ columns: [table.sharedQuestionId, table.tagId], name: 'shared_question_tags_pk' }),
    index('shared_question_tags_tag_question_idx').on(table.tagId, table.sharedQuestionId)
  ]
);
