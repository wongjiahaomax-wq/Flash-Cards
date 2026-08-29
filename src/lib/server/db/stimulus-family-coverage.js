import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import {
  assets,
  assetQuestions,
  cases,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups,
  stimulusOptionAssetQuestions,
  stimulusOptionQuestions
} from './schema.js';
import { StimulusGroupInputError } from './stimulus-family-error.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */
/** @typedef {{ optionId: string, targetGroupId: string } | null} OptionGroupOverride */

/**
 * Canonical Production coverage input for one family. `restoredOptionId` is a
 * prospective-live override used by both ordinary activation and archived
 * restoration. `optionGroupOverride` simulates identity-preserving movement.
 *
 * @param {LearningDb} db
 * @param {string} groupId
 * @param {string|null} [restoredOptionId]
 * @param {OptionGroupOverride} [optionGroupOverride]
 */
async function loadSpecificQuestionSets(db, groupId, restoredOptionId = null, optionGroupOverride = null) {
  const optionLifecycle = restoredOptionId
    ? or(
        and(eq(stimulusGroupOptions.isActive, true), eq(stimulusGroupOptions.removedFromCase, false)),
        eq(stimulusGroupOptions.id, restoredOptionId)
      )
    : and(eq(stimulusGroupOptions.isActive, true), eq(stimulusGroupOptions.removedFromCase, false));
  const optionScope = optionGroupOverride
    ? or(
        eq(stimulusGroupOptions.stimulusGroupId, groupId),
        eq(stimulusGroupOptions.id, optionGroupOverride.optionId)
      )
    : eq(stimulusGroupOptions.stimulusGroupId, groupId);
  const [groupQuestionRows, candidateOptionRows] = await Promise.all([
    db
      .select({ questionPromptId: stimulusGroupQuestions.questionPromptId })
      .from(stimulusGroupQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusGroupQuestions.questionPromptId))
      .where(and(
        eq(stimulusGroupQuestions.stimulusGroupId, groupId),
        eq(stimulusGroupQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId)
      )),
    db
      .select({
        id: stimulusGroupOptions.id,
        groupId: stimulusGroupOptions.stimulusGroupId,
        assetId: stimulusGroupOptions.assetId
      })
      .from(stimulusGroupOptions)
      .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
      .where(and(
        optionScope,
        optionLifecycle,
        eq(assets.isActive, true),
        eq(assets.type, 'image'),
        isNull(assets.previewSessionId)
      ))
  ]);
  const optionRows = candidateOptionRows.filter((option) => {
    const effectiveGroupId = optionGroupOverride?.optionId === option.id
      ? optionGroupOverride.targetGroupId
      : option.groupId;
    return effectiveGroupId === groupId;
  });
  if (!optionRows.length) return [];
  const optionIds = optionRows.map((option) => option.id);
  const [optionQuestionRows, reusableQuestionRows] = await Promise.all([
    db
      .select({ stimulusGroupOptionId: stimulusOptionQuestions.stimulusGroupOptionId, questionPromptId: stimulusOptionQuestions.questionPromptId })
      .from(stimulusOptionQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusOptionQuestions.questionPromptId))
      .where(and(
        inArray(stimulusOptionQuestions.stimulusGroupOptionId, optionIds),
        eq(stimulusOptionQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId)
      )),
    db
      .select({
        stimulusGroupOptionId: stimulusOptionAssetQuestions.stimulusGroupOptionId,
        questionPromptId: assetQuestions.questionPromptId,
        assetId: assetQuestions.assetId
      })
      .from(stimulusOptionAssetQuestions)
      .innerJoin(assetQuestions, eq(assetQuestions.id, stimulusOptionAssetQuestions.assetQuestionId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, assetQuestions.questionPromptId))
      .where(and(
        inArray(stimulusOptionAssetQuestions.stimulusGroupOptionId, optionIds),
        eq(assetQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId)
      ))
  ]);
  const groupPromptIds = groupQuestionRows.map((question) => question.questionPromptId);
  return optionRows.map((option) => ({
    optionId: option.id,
    promptIds: new Set([
      ...groupPromptIds,
      ...optionQuestionRows.filter((question) => question.stimulusGroupOptionId === option.id).map((question) => question.questionPromptId),
      ...reusableQuestionRows
        .filter((question) => question.stimulusGroupOptionId === option.id && question.assetId === option.assetId)
        .map((question) => question.questionPromptId)
    ])
  }));
}

/** @param {LearningDb} db @param {string} groupId @param {{ mode: string, minimum: number | null }} selected @param {string|null} [restoredOptionId] @param {OptionGroupOverride} [optionGroupOverride] */
async function coverageRequirement(db, groupId, selected, restoredOptionId = null, optionGroupOverride = null) {
  if (selected.mode === 'none') return 0;
  const specificSets = await loadSpecificQuestionSets(db, groupId, restoredOptionId, optionGroupOverride);
  if (!specificSets.length) return 0;
  if (selected.mode === 'minimum') {
    const minimum = selected.minimum ?? 0;
    const insufficient = specificSets.find((entry) => entry.promptIds.size < minimum);
    if (insufficient) {
      throw new StimulusGroupInputError(`This Stimulus Group requires at least ${minimum} specific questions for every active option, but one option has only ${insufficient.promptIds.size}.`);
    }
    return minimum;
  }
  return Math.max(...specificSets.map((entry) => entry.promptIds.size));
}

/**
 * Return the maximum number of questions that active Stimulus Families can
 * require in one Review. Independent families are additive because a Review
 * selects one option per active family.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 * @param {{ replacingGroupId?: string | null, replacementCoverage?: { mode: string, minimum: number | null } | null, replacementActive?: boolean, restoredOptionId?: string | null, optionGroupOverride?: OptionGroupOverride }} [override]
 */
export async function getCaseStimulusCoverageRequirement(db, caseId, override = {}) {
  const replacingGroupId = override.replacingGroupId ?? null;
  const replacementCoverage = override.replacementCoverage ?? null;
  const replacementActive = override.replacementActive ?? true;
  const restoredOptionId = override.restoredOptionId ?? null;
  const optionGroupOverride = override.optionGroupOverride ?? null;
  const groups = await db
    .select({ id: stimulusGroups.id, mode: stimulusGroups.specificQuestionMode, minimum: stimulusGroups.minimumSpecificQuestions })
    .from(stimulusGroups)
    .where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusGroups.isActive, true)));

  let total = 0;
  let replacementSeen = false;
  for (const group of groups) {
    if (group.id === replacingGroupId) {
      replacementSeen = true;
      if (!replacementActive) continue;
    }
    const selected = group.id === replacingGroupId && replacementCoverage
      ? replacementCoverage
      : { mode: group.mode, minimum: group.minimum };
    total += await coverageRequirement(
      db,
      group.id,
      selected,
      group.id === replacingGroupId ? restoredOptionId : null,
      optionGroupOverride
    );
  }
  if (replacingGroupId && replacementActive && !replacementSeen && replacementCoverage) {
    total += await coverageRequirement(db, replacingGroupId, replacementCoverage, restoredOptionId, optionGroupOverride);
  }
  return total;
}

/** @param {LearningDb} db @param {string} caseId @param {string | null} replacingGroupId @param {{ mode: string, minimum: number | null }} selected @param {boolean} [replacementActive] @param {string|null} [restoredOptionId] @param {OptionGroupOverride} [optionGroupOverride] */
export async function validateStimulusCoverageFitsCase(db, caseId, replacingGroupId, selected, replacementActive = true, restoredOptionId = null, optionGroupOverride = null) {
  if (replacingGroupId && replacementActive) {
    await coverageRequirement(db, replacingGroupId, selected, restoredOptionId, optionGroupOverride);
  }
  const caseRow = (await db.select({ mode: cases.questionSelectionMode, count: cases.questionCount }).from(cases).where(and(eq(cases.id, caseId), isNull(cases.previewSessionId))).limit(1))[0];
  const requiredTotal = await getCaseStimulusCoverageRequirement(db, caseId, {
    replacingGroupId,
    replacementCoverage: replacingGroupId ? selected : null,
    replacementActive,
    restoredOptionId,
    optionGroupOverride
  });
  if (caseRow?.mode === 'fixed' && caseRow.count && requiredTotal > caseRow.count) {
    throw new StimulusGroupInputError(`This Stimulus Group coverage can require at least ${requiredTotal} questions, but the Case is configured for ${caseRow.count}.`);
  }
  return requiredTotal;
}

/** @param {LearningDb} db @param {{ id: string, specificQuestionMode: string, minimumSpecificQuestions: number|null }} group */
export async function validateNewStimulusOptionCoverage(db, group) {
  if (group.specificQuestionMode !== 'minimum') return;
  const groupQuestions = await db
    .select({ questionPromptId: stimulusGroupQuestions.questionPromptId })
    .from(stimulusGroupQuestions)
    .where(and(eq(stimulusGroupQuestions.stimulusGroupId, group.id), eq(stimulusGroupQuestions.isActive, true)));
  const minimum = group.minimumSpecificQuestions ?? 0;
  const available = new Set(groupQuestions.map((question) => question.questionPromptId)).size;
  if (available < minimum) {
    throw new StimulusGroupInputError(`A new active option would have only ${available} specific questions, below this group's minimum of ${minimum}. Temporarily use No guarantee or add enough group-level questions first.`);
  }
}
