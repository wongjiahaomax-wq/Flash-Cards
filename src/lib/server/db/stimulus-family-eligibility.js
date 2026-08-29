import { and, eq, isNull } from 'drizzle-orm';

import { ContentGuardError, requireProductionCase, requireProductionImageAsset } from './content-guards.js';
import { cases, stimulusGroups } from './schema.js';
import { StimulusGroupInputError } from './stimulus-family-error.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/** @param {LearningDb} db @param {string} caseId */
export async function requireStimulusProductionCase(db, caseId) {
  try {
    await requireProductionCase(db, caseId);
  } catch (error) {
    if (error instanceof ContentGuardError) {
      throw new StimulusGroupInputError('The selected Case is missing or inactive.');
    }
    throw error;
  }
}

/** @param {LearningDb} db @param {string} groupId */
export async function requireStimulusGroup(db, groupId) {
  const row = (
    await db
      .select({
        id: stimulusGroups.id,
        caseId: stimulusGroups.caseId,
        isActive: stimulusGroups.isActive,
        specificQuestionMode: stimulusGroups.specificQuestionMode,
        minimumSpecificQuestions: stimulusGroups.minimumSpecificQuestions
      })
      .from(stimulusGroups)
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(eq(stimulusGroups.id, groupId), eq(cases.isActive, true), isNull(cases.previewSessionId)))
      .limit(1)
  )[0];
  if (!row) throw new StimulusGroupInputError('The selected Stimulus Group is missing or inactive.');
  return row;
}

/** @param {LearningDb} db @param {string} assetId */
export async function requireStimulusImageAsset(db, assetId) {
  try {
    await requireProductionImageAsset(db, assetId);
  } catch (error) {
    if (error instanceof ContentGuardError) {
      throw new StimulusGroupInputError(
        error.code === 'PRODUCTION_IMAGE_ASSET_REQUIRED'
          ? 'Only image Assets can be stimulus options.'
          : 'The selected Asset is missing or inactive.'
      );
    }
    throw error;
  }
}
