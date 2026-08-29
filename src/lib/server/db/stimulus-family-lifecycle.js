import { and, asc, desc, eq } from 'drizzle-orm';

import { caseAssets, stimulusGroupOptions, stimulusGroups } from './schema.js';
import { StimulusGroupInputError } from './stimulus-family-error.js';
import { requireStimulusGroup, requireStimulusImageAsset, requireStimulusProductionCase } from './stimulus-family-eligibility.js';
import { activeValue, coverage, optionalText, requiredText } from './stimulus-family-input.js';
import { validateStimulusCoverageFitsCase } from './stimulus-family-coverage.js';
import { validateStimulusFamilyLiveState } from './stimulus-family-live-state.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/** @param {LearningDb} db @param {{ caseId: string, name: string, specificQuestionMode?: string, minimumSpecificQuestions?: unknown, isActive?: unknown }} input */
export async function createStimulusGroup(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  await requireStimulusProductionCase(db, caseId);
  const name = requiredText(input.name, 'Stimulus Group name');
  const selected = coverage(input.specificQuestionMode, input.minimumSpecificQuestions);
  const nextIsActive = input.isActive == null ? true : activeValue(input.isActive);
  await validateStimulusCoverageFitsCase(db, caseId, null, selected, nextIsActive);
  const last = await db.select({ displayOrder: stimulusGroups.displayOrder }).from(stimulusGroups).where(eq(stimulusGroups.caseId, caseId)).orderBy(desc(stimulusGroups.displayOrder)).limit(1);
  const id = crypto.randomUUID();
  await db.insert(stimulusGroups).values({ id, caseId, name, displayOrder: (last[0]?.displayOrder ?? -1) + 1, selectionCount: 1, specificQuestionMode: selected.mode, minimumSpecificQuestions: selected.minimum, isActive: nextIsActive });
  return id;
}

/**
 * Start a new production stimulus family from one explicitly chosen ordinary
 * Case image. Unlike generic option insertion, the source relationship is
 * unambiguous: the Admin is promoting the Case's principal image into a new
 * family, so that same stable Asset becomes the explicit Original.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, assetId: string, name: string }} input
 */
export async function startStimulusGroupFromCaseAsset(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const assetId = requiredText(input.assetId, 'Asset');
  const name = requiredText(input.name, 'Stimulus Group name');
  await requireStimulusProductionCase(db, caseId);
  await requireStimulusImageAsset(db, assetId);

  const fixed = (await db.select({ captionMd: caseAssets.captionMd }).from(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId))).limit(1))[0];
  if (!fixed) throw new StimulusGroupInputError('Choose an ordinary image from this Case to start an alternative set.');

  const duplicate = (await db
    .select({ id: stimulusGroupOptions.id, removedFromCase: stimulusGroupOptions.removedFromCase })
    .from(stimulusGroupOptions)
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusGroupOptions.assetId, assetId)))
    .limit(1))[0];
  if (duplicate) {
    throw new StimulusGroupInputError(duplicate.removedFromCase
      ? 'That image has an archived Stimulus Option in this Case. Restore it to its original family instead of creating a different identity.'
      : 'That image is already a Stimulus Option in this Case.');
  }
  if (typeof db.batch !== 'function') throw new Error('Atomic database batch support is required to start a stimulus family.');

  await validateStimulusCoverageFitsCase(db, caseId, null, { mode: 'none', minimum: null }, true);
  const [lastGroup, currentFixed] = await Promise.all([
    db.select({ displayOrder: stimulusGroups.displayOrder }).from(stimulusGroups).where(eq(stimulusGroups.caseId, caseId)).orderBy(desc(stimulusGroups.displayOrder)).limit(1),
    db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(eq(caseAssets.caseId, caseId)).orderBy(asc(caseAssets.displayOrder))
  ]);
  const remaining = currentFixed.filter((row) => row.assetId !== assetId);
  const groupId = crypto.randomUUID();
  const optionId = crypto.randomUUID();
  const writes = [
    db.insert(stimulusGroups).values({ id: groupId, caseId, name, displayOrder: (lastGroup[0]?.displayOrder ?? -1) + 1, selectionCount: 1, specificQuestionMode: 'none', minimumSpecificQuestions: null, isActive: true }),
    db.insert(stimulusGroupOptions).values({ id: optionId, stimulusGroupId: groupId, assetId, displayOrder: 0, captionMd: optionalText(fixed.captionMd) }),
    db.update(stimulusGroups).set({ originalOptionId: optionId, updatedAt: new Date() }).where(eq(stimulusGroups.id, groupId)),
    db.delete(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId))),
    ...remaining.map((row, index) => db.update(caseAssets).set({ displayOrder: index }).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, row.assetId))))
  ];
  await db.batch(/** @type {[any, ...any[]]} */ (writes));
  return { caseId, groupId, optionId, assetId };
}

/** @param {LearningDb} db @param {{ groupId: string, name: string, specificQuestionMode?: string, minimumSpecificQuestions?: unknown, isActive?: unknown }} input */
export async function updateStimulusGroup(db, input) {
  const group = await requireStimulusGroup(db, requiredText(input.groupId, 'Stimulus Group'));
  const selected = coverage(input.specificQuestionMode, input.minimumSpecificQuestions);
  const nextIsActive = input.isActive == null ? group.isActive : activeValue(input.isActive);
  if (!group.isActive && nextIsActive) {
    await validateStimulusFamilyLiveState(db, group, { selected, state: { activateGroupId: group.id } });
  } else {
    await validateStimulusCoverageFitsCase(db, group.caseId, group.id, selected, nextIsActive);
  }
  await db.update(stimulusGroups).set({ name: requiredText(input.name, 'Stimulus Group name'), specificQuestionMode: selected.mode, minimumSpecificQuestions: selected.minimum, isActive: nextIsActive, updatedAt: new Date() }).where(eq(stimulusGroups.id, group.id));
}
