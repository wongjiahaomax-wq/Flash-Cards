import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { caseAssets, cases, stimulusGroupOptions, stimulusGroups } from './schema.js';
import { StimulusGroupInputError } from './stimulus-family-error.js';
import { requireStimulusGroup, requireStimulusImageAsset } from './stimulus-family-eligibility.js';
import { optionalText, requiredText } from './stimulus-family-input.js';
import { validateNewStimulusOptionCoverage } from './stimulus-family-coverage.js';
import { validateStimulusFamilyLiveState, validateStimulusOptionRestoration } from './stimulus-family-live-state.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/** @param {LearningDb} db @param {string} groupId @param {string} assetId @param {string | null | undefined} captionMd */
export async function addStimulusOption(db, groupId, assetId, captionMd = null) {
  const group = await requireStimulusGroup(db, requiredText(groupId, 'Stimulus Group'));
  await requireStimulusImageAsset(db, requiredText(assetId, 'Asset'));
  const duplicate = await db.select({ id: stimulusGroupOptions.id, groupId: stimulusGroupOptions.stimulusGroupId, removedFromCase: stimulusGroupOptions.removedFromCase }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).where(and(eq(stimulusGroups.caseId, group.caseId), eq(stimulusGroupOptions.assetId, assetId))).limit(1);
  const fixed = await db.select({ captionMd: caseAssets.captionMd }).from(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId))).limit(1);
  if (duplicate[0]) {
    if (duplicate[0].removedFromCase && duplicate[0].groupId === group.id) {
      await validateStimulusOptionRestoration(db, duplicate[0].id);
      const caption = optionalText(captionMd);
      await db.update(stimulusGroupOptions).set({ isActive: true, removedFromCase: false, ...(caption ? { captionMd: caption } : {}) }).where(eq(stimulusGroupOptions.id, duplicate[0].id));
      return duplicate[0].id;
    }
    throw new StimulusGroupInputError(duplicate[0].removedFromCase
      ? 'That Asset has a removed relationship in another alternative set in this Case. Restore it from that set before adding it elsewhere.'
      : 'That Asset is already used in this Case. Convert or remove the existing attachment first.');
  }
  if (fixed[0]) throw new StimulusGroupInputError('That Asset is already used in this Case. Convert or remove the existing attachment first.');
  await validateNewStimulusOptionCoverage(db, group);
  const last = await db.select({ displayOrder: stimulusGroupOptions.displayOrder }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.stimulusGroupId, group.id)).orderBy(desc(stimulusGroupOptions.displayOrder)).limit(1);
  const id = crypto.randomUUID();
  await db.insert(stimulusGroupOptions).values({ id, stimulusGroupId: group.id, assetId, displayOrder: (last[0]?.displayOrder ?? -1) + 1, captionMd: optionalText(captionMd) });
  return id;
}

/** @param {LearningDb} db @param {string} groupId @param {string} assetId */
export async function convertCaseAssetToStimulusOption(db, groupId, assetId) {
  const group = await requireStimulusGroup(db, groupId);
  await requireStimulusImageAsset(db, assetId);
  const fixed = (await db.select({ captionMd: caseAssets.captionMd }).from(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId))).limit(1))[0];
  if (!fixed) return addStimulusOption(db, groupId, assetId);
  const duplicate = (await db.select({ id: stimulusGroupOptions.id, groupId: stimulusGroupOptions.stimulusGroupId, removedFromCase: stimulusGroupOptions.removedFromCase }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).where(and(eq(stimulusGroups.caseId, group.caseId), eq(stimulusGroupOptions.assetId, assetId))).limit(1))[0];
  if (duplicate) {
    if (!duplicate.removedFromCase || duplicate.groupId !== group.id) throw new StimulusGroupInputError(duplicate.removedFromCase
      ? 'That Asset has a removed relationship in another alternative set in this Case. Restore it from that set before moving it elsewhere.'
      : 'That Asset is already used as a Stimulus Option in this Case.');
    await validateStimulusOptionRestoration(db, duplicate.id);
    const remaining = (await db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(eq(caseAssets.caseId, group.caseId)).orderBy(asc(caseAssets.displayOrder))).filter((row) => row.assetId !== assetId);
    const restore = db.update(stimulusGroupOptions).set({ isActive: true, removedFromCase: false }).where(eq(stimulusGroupOptions.id, duplicate.id));
    const fixedDelete = db.delete(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId)));
    const reorderStatements = remaining.map((row, index) => db.update(caseAssets).set({ displayOrder: index }).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, row.assetId))));
    if (typeof db.batch === 'function') await db.batch([restore, fixedDelete, ...reorderStatements]);
    else { await restore; await fixedDelete; for (const statement of reorderStatements) await statement; }
    return duplicate.id;
  }

  await validateNewStimulusOptionCoverage(db, group);
  const last = await db.select({ displayOrder: stimulusGroupOptions.displayOrder }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.stimulusGroupId, group.id)).orderBy(desc(stimulusGroupOptions.displayOrder)).limit(1);
  const remaining = (await db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(eq(caseAssets.caseId, group.caseId)).orderBy(asc(caseAssets.displayOrder))).filter((row) => row.assetId !== assetId);
  const optionId = crypto.randomUUID();
  const writes = [
    db.insert(stimulusGroupOptions).values({ id: optionId, stimulusGroupId: group.id, assetId, displayOrder: (last[0]?.displayOrder ?? -1) + 1, captionMd: optionalText(fixed.captionMd) }),
    db.delete(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId))),
    ...remaining.map((row, index) => db.update(caseAssets).set({ displayOrder: index }).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, row.assetId))))
  ];
  if (typeof db.batch === 'function') await db.batch(/** @type {[any, ...any[]]} */ (writes));
  else for (const write of writes) await write;
  return optionId;
}

/** @param {LearningDb} db @param {string} optionId @param {boolean} isActive */
export async function setStimulusOptionActive(db, optionId, isActive) {
  const row = (await db.select({ id: stimulusGroupOptions.id, groupId: stimulusGroupOptions.stimulusGroupId, removedFromCase: stimulusGroupOptions.removedFromCase, groupIsActive: stimulusGroups.isActive, originalOptionId: stimulusGroups.originalOptionId }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).innerJoin(cases, eq(cases.id, stimulusGroups.caseId)).where(and(eq(stimulusGroupOptions.id, optionId), eq(cases.isActive, true), isNull(cases.previewSessionId))).limit(1))[0];
  if (!row) throw new StimulusGroupInputError('The selected Stimulus Option is missing.');
  if (row.removedFromCase) throw new StimulusGroupInputError('The selected Stimulus Option has been removed from this Case. Add the Asset again to restore it.');
  if (!isActive && row.originalOptionId === row.id) throw new StimulusGroupInputError('Choose another Original stimulus before deactivating this image.');
  if (isActive && row.groupIsActive) {
    const group = await requireStimulusGroup(db, row.groupId);
    await validateStimulusFamilyLiveState(db, group, { selected: { mode: group.specificQuestionMode, minimum: group.minimumSpecificQuestions }, state: { activateOptionId: row.id } });
  }
  await db.update(stimulusGroupOptions).set({ isActive }).where(eq(stimulusGroupOptions.id, optionId));
}

/** @param {LearningDb} db @param {string} optionId */
export async function removeStimulusOptionFromCase(db, optionId) {
  const row = (await db.select({ id: stimulusGroupOptions.id, removedFromCase: stimulusGroupOptions.removedFromCase, originalOptionId: stimulusGroups.originalOptionId }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).innerJoin(cases, eq(cases.id, stimulusGroups.caseId)).where(and(eq(stimulusGroupOptions.id, optionId), eq(cases.isActive, true), isNull(cases.previewSessionId))).limit(1))[0];
  if (!row) throw new StimulusGroupInputError('The selected Stimulus Option is missing.');
  if (row.removedFromCase) return;
  if (row.originalOptionId === row.id) throw new StimulusGroupInputError('Choose another Original stimulus before removing this image from the Case.');
  await db.update(stimulusGroupOptions).set({ isActive: false, removedFromCase: true }).where(eq(stimulusGroupOptions.id, optionId));
}

/** @param {LearningDb} db @param {string} groupId @param {string} optionId @param {'up'|'down'} direction */
export async function moveStimulusOption(db, groupId, optionId, direction) {
  await requireStimulusGroup(db, groupId);
  const rows = await db.select({ id: stimulusGroupOptions.id }).from(stimulusGroupOptions).where(and(eq(stimulusGroupOptions.stimulusGroupId, groupId), eq(stimulusGroupOptions.removedFromCase, false))).orderBy(asc(stimulusGroupOptions.displayOrder));
  const index = rows.findIndex((row) => row.id === optionId);
  const next = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : -1;
  if (index < 0) throw new StimulusGroupInputError('The selected Stimulus Option is missing.');
  if (next < 0 || next >= rows.length) return false;
  [rows[index], rows[next]] = [rows[next], rows[index]];
  for (const [order, row] of rows.entries()) await db.update(stimulusGroupOptions).set({ displayOrder: rows.length + order + 1 }).where(eq(stimulusGroupOptions.id, row.id));
  for (const [order, row] of rows.entries()) await db.update(stimulusGroupOptions).set({ displayOrder: order }).where(eq(stimulusGroupOptions.id, row.id));
  return true;
}
