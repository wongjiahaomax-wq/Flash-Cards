import { and, eq, isNull } from 'drizzle-orm';

import {
  cases,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups
} from './schema.js';
import { StimulusGroupInputError } from './stimulus-family-error.js';
import { requireStimulusGroup, requireStimulusImageAsset } from './stimulus-family-eligibility.js';
import { validateStimulusCoverageFitsCase } from './stimulus-family-coverage.js';
import {
  ensurePromptIsNotUsedByAnotherGroup,
  loadRetainedStimulusOptionPromptIds
} from './stimulus-family-specificity.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */
/** @typedef {{ activateGroupId?: string|null, activateOptionId?: string|null, restoreOptionId?: string|null, movingOptionId?: string|null, targetGroupId?: string|null }} LiveStateOverride */

/**
 * Validate all state that becomes learner-visible when a Production family or
 * one of its options becomes live. Ordinary inactive and archived restoration
 * remain distinct operations; the override only models the prospective state.
 *
 * @param {LearningDb} db
 * @param {Awaited<ReturnType<typeof requireStimulusGroup>>} group
 * @param {{ selected: { mode: string, minimum: number | null }, state?: LiveStateOverride }} input
 */
export async function validateStimulusFamilyLiveState(db, group, input) {
  const state = input.state ?? {};
  const optionRows = await db
    .select({
      id: stimulusGroupOptions.id,
      assetId: stimulusGroupOptions.assetId,
      isActive: stimulusGroupOptions.isActive,
      removedFromCase: stimulusGroupOptions.removedFromCase
    })
    .from(stimulusGroupOptions)
    .where(eq(stimulusGroupOptions.stimulusGroupId, group.id));
  const liveOptions = optionRows.filter((option) => {
    if (state.restoreOptionId === option.id) return true;
    if (option.removedFromCase) return false;
    return option.isActive || state.activateOptionId === option.id;
  });
  for (const option of liveOptions) await requireStimulusImageAsset(db, option.assetId);

  const originalOptionId = (await db
    .select({ originalOptionId: stimulusGroups.originalOptionId })
    .from(stimulusGroups)
    .where(eq(stimulusGroups.id, group.id))
    .limit(1))[0]?.originalOptionId ?? null;
  if (originalOptionId && !liveOptions.some((option) => option.id === originalOptionId)) {
    throw new StimulusGroupInputError('The Original must be an active eligible image in this Stimulus Group before it can become learner-selectable.');
  }

  const groupPromptRows = await db
    .select({ promptId: stimulusGroupQuestions.questionPromptId })
    .from(stimulusGroupQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusGroupQuestions.questionPromptId))
    .where(and(
      eq(stimulusGroupQuestions.stimulusGroupId, group.id),
      eq(stimulusGroupQuestions.isActive, true),
      eq(questionPrompts.isActive, true),
      isNull(questionPrompts.previewSessionId)
    ));
  for (const row of groupPromptRows) {
    await ensurePromptIsNotUsedByAnotherGroup(db, group.caseId, row.promptId, group.id, state);
  }
  for (const option of liveOptions) {
    for (const promptId of await loadRetainedStimulusOptionPromptIds(db, option.id, option.assetId)) {
      await ensurePromptIsNotUsedByAnotherGroup(db, group.caseId, promptId, group.id, state);
    }
  }

  await validateStimulusCoverageFitsCase(
    db,
    group.caseId,
    group.id,
    input.selected,
    true,
    state.restoreOptionId ?? state.activateOptionId ?? null
  );
}

/** @param {LearningDb} db @param {string} optionId */
export async function validateStimulusOptionRestoration(db, optionId) {
  const option = (await db
    .select({
      id: stimulusGroupOptions.id,
      groupId: stimulusGroupOptions.stimulusGroupId,
      caseId: stimulusGroups.caseId,
      assetId: stimulusGroupOptions.assetId,
      removedFromCase: stimulusGroupOptions.removedFromCase
    })
    .from(stimulusGroupOptions)
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
    .where(and(
      eq(stimulusGroupOptions.id, optionId),
      eq(stimulusGroups.isActive, true),
      eq(cases.isActive, true),
      isNull(cases.previewSessionId)
    ))
    .limit(1))[0];
  if (!option || !option.removedFromCase) throw new StimulusGroupInputError('The selected archived Stimulus Option is missing.');
  await requireStimulusImageAsset(db, option.assetId);
  const group = await requireStimulusGroup(db, option.groupId);
  await validateStimulusFamilyLiveState(db, group, {
    selected: { mode: group.specificQuestionMode, minimum: group.minimumSpecificQuestions },
    state: { restoreOptionId: option.id }
  });
  return option;
}

/**
 * Canonical Production preflight for identity-preserving same-Case movement.
 * The moving option is evaluated as if it already belonged to the target
 * family, while all retained exact/reusable relationships stay attached.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, optionId: string, sourceGroupId: string, targetGroupId: string }} input
 */
export async function validateStimulusOptionMoveState(db, input) {
  const option = (await db
    .select({ id: stimulusGroupOptions.id, groupId: stimulusGroupOptions.stimulusGroupId, assetId: stimulusGroupOptions.assetId })
    .from(stimulusGroupOptions)
    .where(eq(stimulusGroupOptions.id, input.optionId))
    .limit(1))[0];
  if (!option || option.groupId !== input.sourceGroupId) {
    throw new StimulusGroupInputError('The selected Stimulus Option is missing from its source Stimulus Group.');
  }
  await requireStimulusImageAsset(db, option.assetId);
  const state = { movingOptionId: option.id, targetGroupId: input.targetGroupId };
  for (const promptId of await loadRetainedStimulusOptionPromptIds(db, option.id, option.assetId)) {
    await ensurePromptIsNotUsedByAnotherGroup(db, input.caseId, promptId, input.targetGroupId, state);
  }
  await validateStimulusCoverageFitsCase(
    db,
    input.caseId,
    null,
    { mode: 'none', minimum: null },
    true,
    null,
    { optionId: option.id, targetGroupId: input.targetGroupId }
  );
}
