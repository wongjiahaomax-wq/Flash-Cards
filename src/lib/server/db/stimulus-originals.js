import { and, eq, isNull } from 'drizzle-orm';

import { assets, cases, stimulusGroupOptions, stimulusGroups } from './schema.js';
import { StimulusGroupInputError } from './stimulus-groups.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/**
 * Change the canonical Original for one production stimulus family without
 * replacing or recreating the option row. Option IDs, captions, exact-image
 * questions and reusable-question opt-ins therefore remain stable.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 * @param {string} groupId
 * @param {string} optionId
 */
export async function setStimulusGroupOriginal(db, caseId, groupId, optionId) {
  const cleanCaseId = String(caseId ?? '').trim();
  const cleanGroupId = String(groupId ?? '').trim();
  const cleanOptionId = String(optionId ?? '').trim();
  if (!cleanCaseId) throw new StimulusGroupInputError('Case is required.');
  if (!cleanGroupId) throw new StimulusGroupInputError('Stimulus family is required.');
  if (!cleanOptionId) throw new StimulusGroupInputError('Choose an Original stimulus.');

  const productionCase = (await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(
      eq(cases.id, cleanCaseId),
      eq(cases.isActive, true),
      isNull(cases.previewSessionId)
    ))
    .limit(1))[0];
  if (!productionCase) {
    throw new StimulusGroupInputError('The selected Case is missing, inactive, or not a production Case.');
  }

  const group = (await db
    .select({
      id: stimulusGroups.id,
      caseId: stimulusGroups.caseId,
      isActive: stimulusGroups.isActive
    })
    .from(stimulusGroups)
    .where(and(
      eq(stimulusGroups.id, cleanGroupId),
      eq(stimulusGroups.caseId, cleanCaseId),
      eq(stimulusGroups.isActive, true)
    ))
    .limit(1))[0];
  if (!group) {
    throw new StimulusGroupInputError('The selected stimulus family does not belong to this Case or is inactive.');
  }

  const option = (await db
    .select({ id: stimulusGroupOptions.id })
    .from(stimulusGroupOptions)
    .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
    .where(and(
      eq(stimulusGroupOptions.id, cleanOptionId),
      eq(stimulusGroupOptions.stimulusGroupId, cleanGroupId),
      eq(stimulusGroupOptions.isActive, true),
      eq(stimulusGroupOptions.removedFromCase, false),
      eq(assets.isActive, true)
    ))
    .limit(1))[0];
  if (!option) {
    throw new StimulusGroupInputError('The Original must be an active eligible image in this stimulus family.');
  }

  await db
    .update(stimulusGroups)
    .set({ originalOptionId: cleanOptionId, updatedAt: new Date() })
    .where(and(
      eq(stimulusGroups.id, cleanGroupId),
      eq(stimulusGroups.caseId, cleanCaseId),
      eq(stimulusGroups.isActive, true)
    ));

  return { caseId: cleanCaseId, groupId: cleanGroupId, optionId: cleanOptionId };
}
