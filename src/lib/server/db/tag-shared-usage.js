import { and, asc, eq, isNull } from 'drizzle-orm';

import { listTags } from './tag-library.js';
import { questionPrompts } from './schema.js';
import { sharedQuestions, sharedQuestionTags, tags } from './tag-schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/**
 * Add current active Shared Question usage counts to the canonical Tag list.
 * Reuse-scope and descriptive usage remain separate because only the former
 * controls learner eligibility.
 *
 * @param {LearningDb} db
 * @param {{ search?: string, activeOnly?: boolean }} [filters]
 */
export async function listTagsWithSharedQuestionUsage(db, filters = {}) {
  const [tagRows, reuseRows, descriptiveRows] = await Promise.all([
    listTags(db, filters),
    db.select({ tagId: sharedQuestions.reuseScopeTagId, sharedQuestionId: sharedQuestions.id })
      .from(sharedQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
      .innerJoin(tags, eq(tags.id, sharedQuestions.reuseScopeTagId))
      .where(and(
        eq(sharedQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId),
        eq(tags.isActive, true)
      )),
    db.select({ tagId: sharedQuestionTags.tagId, sharedQuestionId: sharedQuestionTags.sharedQuestionId })
      .from(sharedQuestionTags)
      .innerJoin(sharedQuestions, eq(sharedQuestions.id, sharedQuestionTags.sharedQuestionId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
      .innerJoin(tags, eq(tags.id, sharedQuestionTags.tagId))
      .where(and(
        eq(sharedQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId),
        eq(tags.isActive, true)
      ))
  ]);

  const reuseCounts = new Map();
  for (const row of reuseRows) reuseCounts.set(row.tagId, (reuseCounts.get(row.tagId) ?? 0) + 1);
  const descriptiveCounts = new Map();
  for (const row of descriptiveRows) descriptiveCounts.set(row.tagId, (descriptiveCounts.get(row.tagId) ?? 0) + 1);

  return tagRows.map((tag) => ({
    ...tag,
    activeSharedReuseScopeCount: reuseCounts.get(tag.id) ?? 0,
    activeSharedDescriptiveCount: descriptiveCounts.get(tag.id) ?? 0
  }));
}

/**
 * Return all production Shared Question Tag relationships for Admin curation,
 * including inactive Shared Questions/Tags. Scope and descriptive usages are
 * deliberately emitted as separate rows.
 *
 * @param {LearningDb} db
 */
export async function listSharedQuestionTagUsages(db) {
  const [reuseRows, descriptiveRows] = await Promise.all([
    db.select({
      sharedQuestionId: sharedQuestions.id,
      promptMd: questionPrompts.promptMd,
      sharedQuestionIsActive: sharedQuestions.isActive,
      tagId: sharedQuestions.reuseScopeTagId,
      tagName: tags.name,
      tagIsActive: tags.isActive
    }).from(sharedQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
      .innerJoin(tags, eq(tags.id, sharedQuestions.reuseScopeTagId))
      .where(isNull(questionPrompts.previewSessionId))
      .orderBy(asc(questionPrompts.promptMd), asc(tags.name), asc(sharedQuestions.id)),
    db.select({
      sharedQuestionId: sharedQuestions.id,
      promptMd: questionPrompts.promptMd,
      sharedQuestionIsActive: sharedQuestions.isActive,
      tagId: sharedQuestionTags.tagId,
      tagName: tags.name,
      tagIsActive: tags.isActive
    }).from(sharedQuestionTags)
      .innerJoin(sharedQuestions, eq(sharedQuestions.id, sharedQuestionTags.sharedQuestionId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, sharedQuestions.questionPromptId))
      .innerJoin(tags, eq(tags.id, sharedQuestionTags.tagId))
      .where(isNull(questionPrompts.previewSessionId))
      .orderBy(asc(questionPrompts.promptMd), asc(tags.name), asc(sharedQuestions.id))
  ]);

  return [
    ...reuseRows.map((row) => ({ ...row, usageType: 'reuse_scope' })),
    ...descriptiveRows.map((row) => ({ ...row, usageType: 'descriptive' }))
  ].sort((left, right) => left.promptMd.localeCompare(right.promptMd) || left.tagName.localeCompare(right.tagName));
}
