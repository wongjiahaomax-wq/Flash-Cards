import { and, eq, isNull } from 'drizzle-orm';

import { assets, cases, stimulusGroupOptions, stimulusGroups } from './schema.js';
import { StimulusGroupInputError } from './stimulus-groups.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/**
 * Change the canonical Original for one stimulus family without replacing or
 * recreating the option row. Option IDs, captions, exact-image questions and
 * reusable-question opt-ins therefore remain stable.
 *
 * @param {LearningDb} db
 * @param {string} groupId
 * @param {string} optionId
 * @param {{ previewSessionId?: string | null }} [scope]
 */
export async function setStimulusGroupOriginal(db, groupId, optionId, scope = {}) {
  const cleanGroupId = String(groupId ?? '').trim();
  const cleanOptionId = String(optionId ?? '').trim();
  if (!cleanGroupId) throw new StimulusGroupInputError('Stimulus family is required.');
  if (!cleanOptionId) throw new StimulusGroupInputError('Choose an Original stimulus.');

  const previewSessionId = scope.previewSessionId ?? null;
  const group = (await db
    .select({
      id: stimulusGroups.id,
      caseId: stimulusGroups.caseId,
      isActive: stimulusGroups.isActive,
      previewSessionId: cases.previewSessionId
    })
    .from(stimulusGroups)
    .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
    .where(and(
      eq(stimulusGroups.id, cleanGroupId),
      eq(stimulusGroups.isActive, true),
      eq(cases.isActive, true),
      previewSessionId ? eq(cases.previewSessionId, previewSessionId) : isNull(cases.previewSessionId)
    ))
    .limit(1))[0];
  if (!group) throw new StimulusGroupInputError('The selected stimulus family is missing or inactive.');

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
    .where(eq(stimulusGroups.id, cleanGroupId));

  return { caseId: group.caseId, groupId: cleanGroupId, optionId: cleanOptionId };
}
