import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { ContentGuardError, requireProductionCase, requireProductionImageAsset } from './content-guards.js';
import { caseAssets, stimulusGroupOptions, stimulusGroups } from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class SimpleStimulusCurationInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'SimpleStimulusCurationInputError';
  }
}

/** @param {unknown} value @param {string} label */
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new SimpleStimulusCurationInputError(`${label} is required.`);
  return text;
}

/** @param {LearningDb} db @param {string} caseId */
async function requireCase(db, caseId) {
  try {
    await requireProductionCase(db, caseId);
  } catch (error) {
    if (error instanceof ContentGuardError) {
      throw new SimpleStimulusCurationInputError('The selected Case is missing or inactive.');
    }
    throw error;
  }
}

/** @param {LearningDb} db @param {string} assetId */
async function requireImage(db, assetId) {
  try {
    await requireProductionImageAsset(db, assetId);
  } catch (error) {
    if (error instanceof ContentGuardError) {
      throw new SimpleStimulusCurationInputError('The selected image is missing, inactive, or not a production image.');
    }
    throw error;
  }
}

/**
 * Assign the common two-image Case workflow in one atomic operation.
 * The author chooses one ordinary Case image as Original and another as
 * Alternative. The underlying stimulus-group record is an implementation
 * detail and receives a stable internal label rather than asking the author
 * to invent a family name.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, originalAssetId: string, alternativeAssetId: string }} input
 */
export async function assignSimpleStimulusRoles(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const originalAssetId = requiredText(input.originalAssetId, 'Original image');
  const alternativeAssetId = requiredText(input.alternativeAssetId, 'Alternative image');
  if (originalAssetId === alternativeAssetId) {
    throw new SimpleStimulusCurationInputError('Choose two different images for Original and Alternative.');
  }

  await requireCase(db, caseId);
  await Promise.all([requireImage(db, originalAssetId), requireImage(db, alternativeAssetId)]);

  const existingActiveGroup = (await db
    .select({ id: stimulusGroups.id })
    .from(stimulusGroups)
    .where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusGroups.isActive, true)))
    .limit(1))[0];
  if (existingActiveGroup) {
    throw new SimpleStimulusCurationInputError('This Case already has assigned Original/Alternative images. Use the existing role controls instead.');
  }

  const selectedAssetIds = [originalAssetId, alternativeAssetId];
  const currentFixed = await db
    .select({ assetId: caseAssets.assetId, captionMd: caseAssets.captionMd })
    .from(caseAssets)
    .where(eq(caseAssets.caseId, caseId))
    .orderBy(asc(caseAssets.displayOrder));
  const originalFixed = currentFixed.find((row) => row.assetId === originalAssetId);
  const alternativeFixed = currentFixed.find((row) => row.assetId === alternativeAssetId);
  if (!originalFixed || !alternativeFixed) {
    throw new SimpleStimulusCurationInputError('Both selected images must currently belong to this Case.');
  }

  const duplicate = (await db
    .select({ optionId: stimulusGroupOptions.id, removedFromCase: stimulusGroupOptions.removedFromCase })
    .from(stimulusGroupOptions)
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .where(and(
      eq(stimulusGroups.caseId, caseId),
      inArray(stimulusGroupOptions.assetId, selectedAssetIds)
    ))
    .limit(1))[0];
  if (duplicate) {
    throw new SimpleStimulusCurationInputError(
      duplicate.removedFromCase
        ? 'One of these images has archived stimulus history in this Case. Restore it through the existing image controls instead.'
        : 'One of these images is already assigned as a stimulus in this Case.'
    );
  }

  if (typeof db.batch !== 'function') {
    throw new Error('Atomic database batch support is required to assign stimulus roles.');
  }

  const lastGroup = await db
    .select({ displayOrder: stimulusGroups.displayOrder })
    .from(stimulusGroups)
    .where(eq(stimulusGroups.caseId, caseId))
    .orderBy(desc(stimulusGroups.displayOrder))
    .limit(1);

  const remaining = currentFixed.filter((row) => !selectedAssetIds.includes(row.assetId));
  const groupId = crypto.randomUUID();
  const originalOptionId = crypto.randomUUID();
  const alternativeOptionId = crypto.randomUUID();

  const groupInsert = db.insert(stimulusGroups).values({
    id: groupId,
    caseId,
    name: 'Primary stimulus',
    displayOrder: (lastGroup[0]?.displayOrder ?? -1) + 1,
    selectionCount: 1,
    specificQuestionMode: 'none',
    minimumSpecificQuestions: null,
    isActive: true
  });
  const originalInsert = db.insert(stimulusGroupOptions).values({
    id: originalOptionId,
    stimulusGroupId: groupId,
    assetId: originalAssetId,
    displayOrder: 0,
    captionMd: originalFixed.captionMd ?? null
  });
  const alternativeInsert = db.insert(stimulusGroupOptions).values({
    id: alternativeOptionId,
    stimulusGroupId: groupId,
    assetId: alternativeAssetId,
    displayOrder: 1,
    captionMd: alternativeFixed.captionMd ?? null
  });
  const originalUpdate = db
    .update(stimulusGroups)
    .set({ originalOptionId, updatedAt: new Date() })
    .where(eq(stimulusGroups.id, groupId));
  const fixedDelete = db
    .delete(caseAssets)
    .where(and(eq(caseAssets.caseId, caseId), inArray(caseAssets.assetId, selectedAssetIds)));
  const reorderStatements = remaining.map((row, index) => db
    .update(caseAssets)
    .set({ displayOrder: index })
    .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, row.assetId))));

  await db.batch([
    groupInsert,
    originalInsert,
    alternativeInsert,
    originalUpdate,
    fixedDelete,
    ...reorderStatements
  ]);

  return { caseId, groupId, originalOptionId, alternativeOptionId };
}
