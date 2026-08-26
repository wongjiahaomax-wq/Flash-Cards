import { and, eq, inArray } from 'drizzle-orm';

import { ContentGuardError, requireProductionCase } from './content-guards.js';
import { addCaseTag, createTag, TagInputError } from './tag-library.js';
import { caseTags, tags } from './tag-schema.js';

type LearningDb = import('./index.js').LearningDb;
type TagRow = { id: string; name: string };
type BulkTagInput = { caseIds: unknown[]; tagId: unknown };

export const CASE_TAG_BULK_LIMIT = 60;

export class CaseTagBulkError extends Error {
  code: string;

  constructor(message: string, code = 'CASE_TAG_BULK_INVALID') {
    super(message);
    this.name = 'CaseTagBulkError';
    this.code = code;
  }
}

function requiredCaseId(value: unknown): string {
  const caseId = String(value ?? '').trim();
  if (!caseId) throw new CaseTagBulkError('A Case is required.', 'CASE_REQUIRED');
  return caseId;
}

function selectedCaseIds(values: unknown[]): string[] {
  const caseIds = [...new Set(values.map(requiredCaseId))];
  if (!caseIds.length) throw new CaseTagBulkError('Select at least one Case.', 'CASE_REQUIRED');
  if (caseIds.length > CASE_TAG_BULK_LIMIT) {
    throw new CaseTagBulkError(`Select no more than ${CASE_TAG_BULK_LIMIT} Cases at a time.`, 'CASE_BULK_LIMIT');
  }
  return caseIds;
}

function requiredTagId(value: unknown): string {
  const tagId = String(value ?? '').trim();
  if (!tagId) throw new TagInputError('Tag is required.');
  return tagId;
}

function requireBatchSupport(db: LearningDb) {
  if (typeof db.batch !== 'function') {
    throw new CaseTagBulkError(
      'Bulk Case Tag updates require database batch support; no Case Tags were changed.',
      'CASE_TAG_BULK_UNAVAILABLE'
    );
  }
}

async function runCaseTagBatch(db: LearningDb, writes: any[]) {
  if (!writes.length) return;
  requireBatchSupport(db);
  try {
    await db.batch(writes as [any, ...any[]]);
  } catch (error) {
    if (error instanceof TypeError && /batch is not a function/i.test(error.message)) {
      throw new CaseTagBulkError(
        'Bulk Case Tag updates require database batch support; no Case Tags were changed.',
        'CASE_TAG_BULK_UNAVAILABLE'
      );
    }
    throw error;
  }
}

async function requireActiveTag(db: LearningDb, tagIdValue: unknown): Promise<TagRow> {
  const tagId = requiredTagId(tagIdValue);
  const rows = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.isActive, true)))
    .limit(1);
  if (!rows[0]) throw new TagInputError('The selected Tag is missing or inactive.');
  return rows[0];
}

async function requireBulkProductionCases(db: LearningDb, caseIds: string[]) {
  try {
    await Promise.all(caseIds.map((caseId) => requireProductionCase(db, caseId)));
  } catch (error) {
    if (error instanceof ContentGuardError) {
      throw new CaseTagBulkError(
        'All selected Cases must be active Production Cases. No Case Tags were changed.',
        'PRODUCTION_CASE_REQUIRED'
      );
    }
    throw error;
  }
}

async function existingCaseMemberships(db: LearningDb, caseIds: string[], tagId: string) {
  return db
    .select({ caseId: caseTags.caseId })
    .from(caseTags)
    .where(and(eq(caseTags.tagId, tagId), inArray(caseTags.caseId, caseIds)));
}

async function prepareExistingTagBulk(db: LearningDb, input: BulkTagInput) {
  const caseIds = selectedCaseIds(input.caseIds);
  const tagId = requiredTagId(input.tagId);
  const [tag] = await Promise.all([
    requireActiveTag(db, tagId),
    requireBulkProductionCases(db, caseIds)
  ]);
  return { caseIds, tag };
}

/**
 * Add one active canonical Tag across an all-set validated selection of active
 * Production Cases. Existing memberships are kept, so mixed selections are
 * intentionally idempotent and unrelated Case Tags are untouched.
 */
export async function bulkAddCaseTag(db: LearningDb, input: BulkTagInput) {
  const { caseIds, tag } = await prepareExistingTagBulk(db, input);
  const currentRows = await existingCaseMemberships(db, caseIds, tag.id);
  const attached = new Set(currentRows.map((row) => row.caseId));
  const missingCaseIds = caseIds.filter((caseId) => !attached.has(caseId));
  const writes = missingCaseIds.map((caseId) => db.insert(caseTags).values({ caseId, tagId: tag.id }));
  await runCaseTagBatch(db, writes);
  return { tag, selectedCount: caseIds.length, changedCount: missingCaseIds.length };
}

/**
 * Remove one active canonical Tag from an all-set validated selection of
 * active Production Cases. Cases that do not currently have the Tag are left
 * unchanged and unrelated Case Tags are untouched.
 */
export async function bulkRemoveCaseTag(db: LearningDb, input: BulkTagInput) {
  const { caseIds, tag } = await prepareExistingTagBulk(db, input);
  const currentRows = await existingCaseMemberships(db, caseIds, tag.id);
  const attachedCaseIds = currentRows.map((row) => row.caseId);
  const writes = attachedCaseIds.map((caseId) => db
    .delete(caseTags)
    .where(and(eq(caseTags.caseId, caseId), eq(caseTags.tagId, tag.id))));
  await runCaseTagBatch(db, writes);
  return { tag, selectedCount: caseIds.length, changedCount: attachedCaseIds.length };
}

/**
 * Create one new canonical Tag and attach it to every selected active
 * Production Case. Case validation and batch availability are checked before
 * Tag creation. If the relationship batch fails, the just-created Tag is
 * removed so the bulk authoring operation does not leave an orphan behind.
 */
export async function bulkCreateAndAddCaseTag(
  db: LearningDb,
  input: { caseIds: unknown[]; name: unknown }
) {
  const caseIds = selectedCaseIds(input.caseIds);
  await requireBulkProductionCases(db, caseIds);
  requireBatchSupport(db);

  const tag = await createTag(db, input.name);
  try {
    const writes = caseIds.map((caseId) => db.insert(caseTags).values({ caseId, tagId: tag.id }));
    await runCaseTagBatch(db, writes);
  } catch (error) {
    try {
      await db.delete(tags).where(eq(tags.id, tag.id));
    } catch (cleanupError) {
      console.error('Unable to clean up the Tag created during a failed bulk Case Tag operation.', cleanupError);
    }
    throw error;
  }
  return { tag, selectedCount: caseIds.length, changedCount: caseIds.length };
}

/**
 * Create a new active global Tag and immediately attach it to an active
 * production Case. The two writes are treated as one authoring operation: if
 * the Case attachment fails after Tag creation, remove the newly created Tag
 * so the Case editor does not leave an unintended orphan behind.
 */
export async function createAndAddCaseTag(
  db: LearningDb,
  input: { caseId: unknown; name: unknown }
) {
  const tag = await createTag(db, input.name);
  try {
    await addCaseTag(db, { caseId: input.caseId, tagId: tag.id });
  } catch (error) {
    try {
      await db.delete(tags).where(eq(tags.id, tag.id));
    } catch (cleanupError) {
      console.error('Unable to clean up the Tag created during a failed Case Tag operation.', cleanupError);
    }
    throw error;
  }
  return tag;
}
