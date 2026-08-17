import { and, asc, desc, eq, inArray, like, notInArray, or } from 'drizzle-orm';

import { getTeachingImageUrl } from '../storage/media.js';
import {
  assets,
  caseAssets,
  cases,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups
} from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export const ADMIN_IMAGE_BULK_LIMIT = 30;
export const CASE_IMAGE_PICKER_LIMIT = 60;

export class AdminImageWorkflowInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AdminImageWorkflowInputError';
  }
}

/** @param {unknown[]} values */
function normalizeAssetIds(values) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

/** @param {LearningDb} db @param {string} caseId */
async function requireActiveCase(db, caseId) {
  const id = String(caseId ?? '').trim();
  if (!id) throw new AdminImageWorkflowInputError('Case is required.');
  const row = (
    await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.id, id), eq(cases.isActive, true)))
      .limit(1)
  )[0];
  if (!row) throw new AdminImageWorkflowInputError('The selected Case is missing or inactive.');
  return row;
}

/** @param {unknown[]} values */
function boundedAssetIds(values) {
  const ids = normalizeAssetIds(values);
  if (ids.length === 0) throw new AdminImageWorkflowInputError('Select at least one image.');
  if (ids.length > ADMIN_IMAGE_BULK_LIMIT) {
    throw new AdminImageWorkflowInputError(
      `A single bulk image action is limited to ${ADMIN_IMAGE_BULK_LIMIT} Assets. Select a smaller batch.`
    );
  }
  return ids;
}

/** @param {LearningDb} db @param {string[]} assetIds */
async function requireActiveImageAssets(db, assetIds) {
  const rows = await db
    .select({ id: assets.id, type: assets.type, isActive: assets.isActive })
    .from(assets)
    .where(inArray(assets.id, assetIds));
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const assetId of assetIds) {
    const row = byId.get(assetId);
    if (!row || !row.isActive) {
      throw new AdminImageWorkflowInputError(`Asset ${assetId} is missing or inactive.`);
    }
    if (row.type !== 'image') {
      throw new AdminImageWorkflowInputError(`Asset ${assetId} is not an image.`);
    }
  }
}

/**
 * Search active image Assets that are not already used by this Case. This is
 * intentionally bounded so the Case editor never needs the whole Asset Library.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 * @param {{ search?: string, limit?: number }} [options]
 */
export async function listCaseImagePicker(db, caseId, options = {}) {
  await requireActiveCase(db, caseId);
  const limit = Math.max(1, Math.min(Number(options.limit ?? CASE_IMAGE_PICKER_LIMIT), CASE_IMAGE_PICKER_LIMIT));
  const search = String(options.search ?? '').trim();
  const [fixedRows, groupedRows] = await Promise.all([
    db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(eq(caseAssets.caseId, caseId)),
    db
      .select({ assetId: stimulusGroupOptions.assetId })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .where(eq(stimulusGroups.caseId, caseId))
  ]);
  const usedIds = [...new Set([...fixedRows, ...groupedRows].map((row) => row.assetId))];
  const conditions = [eq(assets.isActive, true), eq(assets.type, 'image')];
  if (usedIds.length) conditions.push(notInArray(assets.id, usedIds));
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(assets.originalFilename, pattern),
        like(assets.altText, pattern),
        like(assets.sourceLabel, pattern),
        like(assets.sourceUrl, pattern)
      )
    );
  }
  const rows = await db
    .select({
      id: assets.id,
      originalFilename: assets.originalFilename,
      altText: assets.altText,
      sourceLabel: assets.sourceLabel,
      sourceUrl: assets.sourceUrl,
      licence: assets.licence,
      mimeType: assets.mimeType,
      createdAt: assets.createdAt
    })
    .from(assets)
    .where(and(...conditions))
    .orderBy(desc(assets.createdAt), desc(assets.id))
    .limit(limit + 1);

  return {
    assets: rows.slice(0, limit).map((asset) => ({ ...asset, imageUrl: getTeachingImageUrl(asset.id) })),
    hasMore: rows.length > limit,
    limit,
    search
  };
}

/**
 * Attach a prevalidated bounded set as fixed Case Assets. Existing fixed
 * relationships are idempotent no-ops; Assets already used as alternatives in
 * the same Case are rejected rather than silently moved.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 * @param {unknown[]} submittedAssetIds
 */
export async function attachAssetsToCase(db, caseId, submittedAssetIds) {
  await requireActiveCase(db, caseId);
  const assetIds = boundedAssetIds(submittedAssetIds);
  await requireActiveImageAssets(db, assetIds);

  const [fixedRows, groupedRows] = await Promise.all([
    db
      .select({ assetId: caseAssets.assetId })
      .from(caseAssets)
      .where(and(eq(caseAssets.caseId, caseId), inArray(caseAssets.assetId, assetIds))),
    db
      .select({ assetId: stimulusGroupOptions.assetId })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .where(and(eq(stimulusGroups.caseId, caseId), inArray(stimulusGroupOptions.assetId, assetIds)))
  ]);
  if (groupedRows.length) {
    throw new AdminImageWorkflowInputError(
      'One or more selected Assets are already alternative images in this Case. Manage those Assets from their alternative set.'
    );
  }

  const existing = new Set(fixedRows.map((row) => row.assetId));
  const newIds = assetIds.filter((id) => !existing.has(id));
  if (!newIds.length) {
    return { requestedCount: assetIds.length, attachedCount: 0, alreadyAttachedCount: assetIds.length };
  }

  const last = (
    await db
      .select({ displayOrder: caseAssets.displayOrder })
      .from(caseAssets)
      .where(eq(caseAssets.caseId, caseId))
      .orderBy(desc(caseAssets.displayOrder))
      .limit(1)
  )[0];
  const startOrder = (last?.displayOrder ?? -1) + 1;
  const statements = newIds.map((assetId, index) =>
    db.insert(caseAssets).values({ caseId, assetId, displayOrder: startOrder + index, captionMd: null })
  );

  try {
    if (typeof db.batch === 'function') await db.batch(statements);
    else for (const statement of statements) await statement;
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new AdminImageWorkflowInputError('The Case image list changed while attaching. Refresh and try again.');
    }
    throw error;
  }

  return {
    requestedCount: assetIds.length,
    attachedCount: newIds.length,
    alreadyAttachedCount: assetIds.length - newIds.length
  };
}

/** @param {LearningDb} db */
export async function listActiveStimulusGroupTargets(db) {
  return db
    .select({
      id: stimulusGroups.id,
      name: stimulusGroups.name,
      caseId: stimulusGroups.caseId,
      caseTitle: cases.title,
      displayOrder: stimulusGroups.displayOrder
    })
    .from(stimulusGroups)
    .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
    .where(and(eq(stimulusGroups.isActive, true), eq(cases.isActive, true)))
    .orderBy(asc(cases.title), asc(stimulusGroups.displayOrder), asc(stimulusGroups.name));
}

/**
 * Add Assets to one existing active Case alternative set. This deliberately
 * does not implement a cross-set "move": option-specific questions/captions
 * make moving a relationship a separate authoring decision.
 *
 * @param {LearningDb} db
 * @param {string} groupId
 * @param {unknown[]} submittedAssetIds
 * @param {{ expectedCaseId?: string | null }} [options]
 */
export async function bulkAddAssetsToStimulusGroup(db, groupId, submittedAssetIds, options = {}) {
  const normalizedGroupId = String(groupId ?? '').trim();
  if (!normalizedGroupId) throw new AdminImageWorkflowInputError('Choose an alternative image set.');
  const group = (
    await db
      .select({
        id: stimulusGroups.id,
        caseId: stimulusGroups.caseId,
        specificQuestionMode: stimulusGroups.specificQuestionMode,
        minimumSpecificQuestions: stimulusGroups.minimumSpecificQuestions
      })
      .from(stimulusGroups)
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(eq(stimulusGroups.id, normalizedGroupId), eq(stimulusGroups.isActive, true), eq(cases.isActive, true)))
      .limit(1)
  )[0];
  if (!group) {
    throw new AdminImageWorkflowInputError('The selected alternative image set is missing or inactive.');
  }
  if (options.expectedCaseId && group.caseId !== options.expectedCaseId) {
    throw new AdminImageWorkflowInputError('The selected alternative image set does not belong to this Case.');
  }

  const assetIds = boundedAssetIds(submittedAssetIds);
  await requireActiveImageAssets(db, assetIds);

  const [fixedRows, optionRows] = await Promise.all([
    db
      .select({ assetId: caseAssets.assetId })
      .from(caseAssets)
      .where(and(eq(caseAssets.caseId, group.caseId), inArray(caseAssets.assetId, assetIds))),
    db
      .select({
        id: stimulusGroupOptions.id,
        assetId: stimulusGroupOptions.assetId,
        groupId: stimulusGroupOptions.stimulusGroupId,
        isActive: stimulusGroupOptions.isActive
      })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .where(and(eq(stimulusGroups.caseId, group.caseId), inArray(stimulusGroupOptions.assetId, assetIds)))
  ]);
  if (fixedRows.length) {
    throw new AdminImageWorkflowInputError(
      'One or more selected Assets are fixed images in the target Case. Convert them from the Case editor instead of moving them implicitly.'
    );
  }

  const byAsset = new Map(optionRows.map((row) => [row.assetId, row]));
  for (const assetId of assetIds) {
    const existing = byAsset.get(assetId);
    if (!existing) continue;
    if (existing.groupId !== group.id) {
      throw new AdminImageWorkflowInputError(
        'One or more selected Assets already belong to another alternative set in the target Case. No relationships were moved.'
      );
    }
    if (!existing.isActive) {
      throw new AdminImageWorkflowInputError(
        'One or more selected Assets already exist in this set but are inactive. Reactivate them from the Case editor.'
      );
    }
  }

  if (group.specificQuestionMode === 'minimum') {
    const groupQuestions = await db
      .select({ id: stimulusGroupQuestions.id })
      .from(stimulusGroupQuestions)
      .where(and(eq(stimulusGroupQuestions.stimulusGroupId, group.id), eq(stimulusGroupQuestions.isActive, true)));
    const minimum = group.minimumSpecificQuestions ?? 0;
    if (groupQuestions.length < minimum) {
      throw new AdminImageWorkflowInputError(
        `New images would have only ${groupQuestions.length} set-wide specific questions, below this set's minimum of ${minimum}. Add set-wide questions or change coverage first.`
      );
    }
  }

  const newIds = assetIds.filter((id) => !byAsset.has(id));
  if (!newIds.length) {
    return { caseId: group.caseId, requestedCount: assetIds.length, addedCount: 0, alreadyPresentCount: assetIds.length };
  }
  const last = (
    await db
      .select({ displayOrder: stimulusGroupOptions.displayOrder })
      .from(stimulusGroupOptions)
      .where(eq(stimulusGroupOptions.stimulusGroupId, group.id))
      .orderBy(desc(stimulusGroupOptions.displayOrder))
      .limit(1)
  )[0];
  const startOrder = (last?.displayOrder ?? -1) + 1;
  const statements = newIds.map((assetId, index) =>
    db.insert(stimulusGroupOptions).values({
      id: crypto.randomUUID(),
      stimulusGroupId: group.id,
      assetId,
      displayOrder: startOrder + index,
      captionMd: null,
      isActive: true
    })
  );
  try {
    if (typeof db.batch === 'function') await db.batch(statements);
    else for (const statement of statements) await statement;
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new AdminImageWorkflowInputError('The alternative image set changed while updating. Refresh and try again.');
    }
    throw error;
  }

  return {
    caseId: group.caseId,
    requestedCount: assetIds.length,
    addedCount: newIds.length,
    alreadyPresentCount: assetIds.length - newIds.length
  };
}

/**
 * Preserve the existing authoring ability to give an alternative image a
 * Case-specific caption even when the option was added through the multi-picker.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 * @param {string} optionId
 * @param {unknown} captionMd
 */
export async function updateStimulusOptionCaption(db, caseId, optionId, captionMd) {
  const normalizedCaseId = String(caseId ?? '').trim();
  const normalizedOptionId = String(optionId ?? '').trim();
  if (!normalizedCaseId || !normalizedOptionId) {
    throw new AdminImageWorkflowInputError('Case and alternative image are required.');
  }
  const option = (
    await db
      .select({ id: stimulusGroupOptions.id })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(
        and(
          eq(stimulusGroupOptions.id, normalizedOptionId),
          eq(stimulusGroups.caseId, normalizedCaseId),
          eq(cases.isActive, true)
        )
      )
      .limit(1)
  )[0];
  if (!option) throw new AdminImageWorkflowInputError('That alternative image is not attached to this active Case.');
  const normalizedCaption = String(captionMd ?? '').trim() || null;
  await db.update(stimulusGroupOptions).set({ captionMd: normalizedCaption, updatedAt: new Date() }).where(eq(stimulusGroupOptions.id, option.id));
}
