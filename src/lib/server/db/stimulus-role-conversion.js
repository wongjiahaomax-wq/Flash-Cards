import { and, desc, eq, isNull } from 'drizzle-orm';

import { assets, caseAssets, cases, stimulusGroupOptions, stimulusGroups } from './schema.js';
import { StimulusGroupInputError } from './stimulus-groups.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/**
 * Move an eligible non-Original stimulus option back to the Case's always-shown
 * supporting images without recreating its Asset or deleting the option row.
 *
 * The option relationship is archived (`removed_from_case = true`) so exact
 * option identity and historical provenance remain available. The same Asset ID
 * is attached through `case_assets` with the option caption carried across.
 *
 * When `expectedCaseId` is supplied, ownership is validated before either
 * relationship is mutated. This keeps route-supplied Case context at the
 * mutation boundary instead of validating it after the write.
 *
 * @param {LearningDb} db
 * @param {string} optionId
 * @param {string | null} [expectedCaseId]
 */
export async function convertStimulusOptionToSupporting(db, optionId, expectedCaseId = null) {
  const cleanOptionId = String(optionId ?? '').trim();
  const cleanExpectedCaseId = expectedCaseId == null ? null : String(expectedCaseId).trim();
  if (!cleanOptionId) throw new StimulusGroupInputError('Stimulus option is required.');
  if (expectedCaseId != null && !cleanExpectedCaseId) throw new StimulusGroupInputError('Case is required.');

  const option = (await db
    .select({
      id: stimulusGroupOptions.id,
      groupId: stimulusGroupOptions.stimulusGroupId,
      caseId: stimulusGroups.caseId,
      assetId: stimulusGroupOptions.assetId,
      captionMd: stimulusGroupOptions.captionMd,
      isActive: stimulusGroupOptions.isActive,
      removedFromCase: stimulusGroupOptions.removedFromCase,
      originalOptionId: stimulusGroups.originalOptionId,
      groupIsActive: stimulusGroups.isActive,
      assetIsActive: assets.isActive
    })
    .from(stimulusGroupOptions)
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
    .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
    .where(and(
      eq(stimulusGroupOptions.id, cleanOptionId),
      eq(cases.isActive, true),
      isNull(cases.previewSessionId)
    ))
    .limit(1))[0];

  if (!option || !option.groupIsActive || !option.isActive || option.removedFromCase || !option.assetIsActive) {
    throw new StimulusGroupInputError('The selected stimulus option is missing or inactive.');
  }
  if (cleanExpectedCaseId && option.caseId !== cleanExpectedCaseId) {
    throw new StimulusGroupInputError('The selected stimulus option does not belong to this Case.');
  }
  if (option.originalOptionId === option.id) {
    throw new StimulusGroupInputError('Choose another Original stimulus before moving this image to Always shown / supporting.');
  }

  const duplicate = (await db
    .select({ assetId: caseAssets.assetId })
    .from(caseAssets)
    .where(and(eq(caseAssets.caseId, option.caseId), eq(caseAssets.assetId, option.assetId)))
    .limit(1))[0];
  if (duplicate) {
    throw new StimulusGroupInputError('This image is already attached as an always-shown supporting image for the Case.');
  }

  const lastSupporting = (await db
    .select({ displayOrder: caseAssets.displayOrder })
    .from(caseAssets)
    .where(eq(caseAssets.caseId, option.caseId))
    .orderBy(desc(caseAssets.displayOrder))
    .limit(1))[0];

  const attachSupporting = db.insert(caseAssets).values({
    caseId: option.caseId,
    assetId: option.assetId,
    displayOrder: (lastSupporting?.displayOrder ?? -1) + 1,
    captionMd: option.captionMd
  });
  const archiveOption = db
    .update(stimulusGroupOptions)
    .set({ isActive: false, removedFromCase: true })
    .where(eq(stimulusGroupOptions.id, option.id));

  if (typeof db.batch === 'function') {
    await db.batch(/** @type {[any, ...any[]]} */ ([attachSupporting, archiveOption]));
  } else {
    await attachSupporting;
    try {
      await archiveOption;
    } catch (error) {
      await db
        .delete(caseAssets)
        .where(and(eq(caseAssets.caseId, option.caseId), eq(caseAssets.assetId, option.assetId)))
        .catch(() => {});
      throw error;
    }
  }

  return { caseId: option.caseId, groupId: option.groupId, optionId: option.id, assetId: option.assetId };
}
