import { and, eq, isNull } from 'drizzle-orm';

import {
  assets,
  assetQuestions,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups,
  stimulusOptionAssetQuestions,
  stimulusOptionQuestions
} from './schema.js';
import { StimulusGroupInputError } from './stimulus-family-error.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */
/** @typedef {{ activateGroupId?: string|null, activateOptionId?: string|null, restoreOptionId?: string|null, movingOptionId?: string|null, targetGroupId?: string|null }} LiveStateOverride */

/** @param {unknown} error */
function missingReusableQuestionSchema(error) {
  let current = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (current instanceof Error && /no such table:.*(?:asset_questions|stimulus_option_asset_questions)|no such column:.*asset_question_id/i.test(current.message)) {
      return true;
    }
    if (typeof current !== 'object' || current === null || !('cause' in current)) break;
    current = current.cause;
  }
  return false;
}

/** @param {LearningDb} db @param {string} optionId @param {string} assetId */
export async function loadRetainedStimulusOptionPromptIds(db, optionId, assetId) {
  const specificRows = await db
    .select({ promptId: stimulusOptionQuestions.questionPromptId })
    .from(stimulusOptionQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusOptionQuestions.questionPromptId))
    .where(and(
      eq(stimulusOptionQuestions.stimulusGroupOptionId, optionId),
      eq(stimulusOptionQuestions.isActive, true),
      eq(questionPrompts.isActive, true),
      isNull(questionPrompts.previewSessionId)
    ));
  /** @type {{ promptId: string }[]} */
  let reusableRows = [];
  try {
    reusableRows = await db
      .select({ promptId: assetQuestions.questionPromptId })
      .from(stimulusOptionAssetQuestions)
      .innerJoin(assetQuestions, eq(assetQuestions.id, stimulusOptionAssetQuestions.assetQuestionId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, assetQuestions.questionPromptId))
      .where(and(
        eq(stimulusOptionAssetQuestions.stimulusGroupOptionId, optionId),
        eq(assetQuestions.assetId, assetId),
        eq(assetQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId)
      ));
  } catch (error) {
    if (!missingReusableQuestionSchema(error)) throw error;
  }
  return new Set([...specificRows, ...reusableRows].map((row) => row.promptId));
}

/** @param {LearningDb} db @param {string} caseId @param {string} promptId */
async function loadReusablePromptOwners(db, caseId, promptId) {
  try {
    return await db
      .select({
        groupId: stimulusGroups.id,
        groupIsActive: stimulusGroups.isActive,
        optionId: stimulusGroupOptions.id,
        optionIsActive: stimulusGroupOptions.isActive,
        removedFromCase: stimulusGroupOptions.removedFromCase,
        optionAssetId: stimulusGroupOptions.assetId,
        reusableAssetId: assetQuestions.assetId,
        assetIsActive: assets.isActive,
        assetType: assets.type,
        assetPreviewSessionId: assets.previewSessionId
      })
      .from(stimulusOptionAssetQuestions)
      .innerJoin(assetQuestions, eq(assetQuestions.id, stimulusOptionAssetQuestions.assetQuestionId))
      .innerJoin(stimulusGroupOptions, eq(stimulusGroupOptions.id, stimulusOptionAssetQuestions.stimulusGroupOptionId))
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, assetQuestions.questionPromptId))
      .where(and(
        eq(stimulusGroups.caseId, caseId),
        eq(assetQuestions.questionPromptId, promptId),
        eq(assetQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId)
      ));
  } catch (error) {
    if (!missingReusableQuestionSchema(error)) throw error;
    return [];
  }
}

/**
 * Canonical application-level live Prompt ownership rule. Dormant Family,
 * inactive Option and removed Option relationships remain authored/history
 * state but do not reserve a live Prompt. Reusable exact-Asset usages share the
 * same policy as ordinary Group/Option Questions.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 * @param {string} promptId
 * @param {string} groupId
 * @param {LiveStateOverride} [state]
 */
export async function ensurePromptIsNotUsedByAnotherGroup(db, caseId, promptId, groupId, state = {}) {
  const [groupRows, optionRows] = await Promise.all([
    db
      .select({ groupId: stimulusGroups.id, groupIsActive: stimulusGroups.isActive })
      .from(stimulusGroupQuestions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupQuestions.stimulusGroupId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusGroupQuestions.questionPromptId))
      .where(and(
        eq(stimulusGroups.caseId, caseId),
        eq(stimulusGroupQuestions.questionPromptId, promptId),
        eq(stimulusGroupQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId)
      )),
    db
      .select({
        groupId: stimulusGroups.id,
        groupIsActive: stimulusGroups.isActive,
        optionId: stimulusGroupOptions.id,
        optionIsActive: stimulusGroupOptions.isActive,
        removedFromCase: stimulusGroupOptions.removedFromCase
      })
      .from(stimulusOptionQuestions)
      .innerJoin(stimulusGroupOptions, eq(stimulusGroupOptions.id, stimulusOptionQuestions.stimulusGroupOptionId))
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusOptionQuestions.questionPromptId))
      .where(and(
        eq(stimulusGroups.caseId, caseId),
        eq(stimulusOptionQuestions.questionPromptId, promptId),
        eq(stimulusOptionQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId)
      ))
  ]);
  const reusableRows = await loadReusablePromptOwners(db, caseId, promptId);

  /** @param {string} rowGroupId @param {boolean} groupIsActive */
  const groupIsLive = (rowGroupId, groupIsActive) => groupIsActive || state.activateGroupId === rowGroupId;
  /** @param {{ groupId: string, groupIsActive: boolean, optionId: string, optionIsActive: boolean, removedFromCase: boolean }} row */
  const optionOwner = (row) => {
    if (!groupIsLive(row.groupId, row.groupIsActive)) return null;
    const lifecycleLive = state.restoreOptionId === row.optionId
      || (!row.removedFromCase && (row.optionIsActive || state.activateOptionId === row.optionId));
    if (!lifecycleLive) return null;
    return state.movingOptionId === row.optionId && state.targetGroupId
      ? state.targetGroupId
      : row.groupId;
  };

  const owners = new Set();
  for (const row of groupRows) {
    if (groupIsLive(row.groupId, row.groupIsActive)) owners.add(row.groupId);
  }
  for (const row of optionRows) {
    const owner = optionOwner(row);
    if (owner) owners.add(owner);
  }
  for (const row of reusableRows) {
    if (row.optionAssetId !== row.reusableAssetId || !row.assetIsActive || row.assetType !== 'image' || row.assetPreviewSessionId) continue;
    const owner = optionOwner(row);
    if (owner) owners.add(owner);
  }
  if ([...owners].some((id) => id !== groupId)) {
    throw new StimulusGroupInputError('The same Question Prompt cannot be independently attached to multiple active Stimulus Groups in one Case.');
  }
}
