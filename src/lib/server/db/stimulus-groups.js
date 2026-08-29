import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';

import { ContentGuardError, requireProductionCase, requireProductionImageAsset } from './content-guards.js';
import {
  assets,
  assetQuestions,
  caseAssets,
  cases,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups,
  stimulusOptionAssetQuestions,
  stimulusOptionQuestions
} from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */
/** @typedef {{ activateGroupId?: string|null, activateOptionId?: string|null, restoreOptionId?: string|null, movingOptionId?: string|null, targetGroupId?: string|null }} LiveStateOverride */
/** @typedef {{ optionId: string, targetGroupId: string } | null} OptionGroupOverride */

export class StimulusGroupInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'StimulusGroupInputError';
  }
}

/** @param {unknown} value @param {string} label */
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new StimulusGroupInputError(`${label} is required.`);
  return text;
}

/** @param {unknown} value */
function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

/** @param {unknown} value */
function activeValue(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

/** @param {unknown} value @param {unknown} minimum */
function coverage(value, minimum) {
  const mode = String(value || 'none');
  if (!['none', 'minimum', 'all'].includes(mode)) {
    throw new StimulusGroupInputError('Specific-question coverage must be none, minimum, or all.');
  }
  if (mode !== 'minimum') return { mode, minimum: null };
  const count = Number(minimum);
  if (!Number.isInteger(count) || count < 1) {
    throw new StimulusGroupInputError('Minimum specific questions must be a positive integer.');
  }
  return { mode, minimum: count };
}

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
async function validateCoverageFitsCase(db, caseId, replacingGroupId, selected, replacementActive = true, restoredOptionId = null, optionGroupOverride = null) {
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

/** @param {LearningDb} db @param {string} caseId */
async function requireCase(db, caseId) {
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
async function requireGroup(db, groupId) {
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
async function requireAsset(db, assetId) {
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

/** @param {LearningDb} db @param {ReturnType<typeof requireGroup> extends Promise<infer T> ? T : never} group */
async function validateNewOptionCoverage(db, group) {
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
async function loadRetainedOptionPromptIds(db, optionId, assetId) {
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

/**
 * Validate all state that becomes learner-visible when a Production family or
 * one of its options becomes live. Ordinary inactive and archived restoration
 * remain distinct operations; the override only models the prospective state.
 *
 * @param {LearningDb} db
 * @param {ReturnType<typeof requireGroup> extends Promise<infer T> ? T : never} group
 * @param {{ selected: { mode: string, minimum: number | null }, state?: LiveStateOverride }} input
 */
async function validateFamilyLiveState(db, group, input) {
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
  for (const option of liveOptions) await requireAsset(db, option.assetId);

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
    for (const promptId of await loadRetainedOptionPromptIds(db, option.id, option.assetId)) {
      await ensurePromptIsNotUsedByAnotherGroup(db, group.caseId, promptId, group.id, state);
    }
  }

  await validateCoverageFitsCase(
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
  await requireAsset(db, option.assetId);
  const group = await requireGroup(db, option.groupId);
  await validateFamilyLiveState(db, group, {
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
  await requireAsset(db, option.assetId);
  const state = { movingOptionId: option.id, targetGroupId: input.targetGroupId };
  for (const promptId of await loadRetainedOptionPromptIds(db, option.id, option.assetId)) {
    await ensurePromptIsNotUsedByAnotherGroup(db, input.caseId, promptId, input.targetGroupId, state);
  }
  await validateCoverageFitsCase(
    db,
    input.caseId,
    null,
    { mode: 'none', minimum: null },
    true,
    null,
    { optionId: option.id, targetGroupId: input.targetGroupId }
  );
}

/** @param {LearningDb} db @param {string} caseId */
export async function getAdminStimulusData(db, caseId) {
  await requireCase(db, caseId);
  const groups = await db.select().from(stimulusGroups).where(eq(stimulusGroups.caseId, caseId)).orderBy(asc(stimulusGroups.displayOrder), asc(stimulusGroups.createdAt));
  if (!groups.length) return [];
  const groupIds = groups.map((group) => group.id);
  const options = await db
    .select({
      id: stimulusGroupOptions.id,
      stimulusGroupId: stimulusGroupOptions.stimulusGroupId,
      assetId: stimulusGroupOptions.assetId,
      displayOrder: stimulusGroupOptions.displayOrder,
      captionMd: stimulusGroupOptions.captionMd,
      isActive: stimulusGroupOptions.isActive,
      removedFromCase: stimulusGroupOptions.removedFromCase,
      storageKey: assets.storageKey,
      mimeType: assets.mimeType,
      originalFilename: assets.originalFilename,
      altText: assets.altText,
      assetIsActive: assets.isActive
    })
    .from(stimulusGroupOptions)
    .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
    .where(and(inArray(stimulusGroupOptions.stimulusGroupId, groupIds), eq(stimulusGroupOptions.removedFromCase, false)))
    .orderBy(asc(stimulusGroupOptions.displayOrder), asc(stimulusGroupOptions.createdAt));
  const groupQuestions = await db
    .select({ id: stimulusGroupQuestions.id, stimulusGroupId: stimulusGroupQuestions.stimulusGroupId, questionPromptId: stimulusGroupQuestions.questionPromptId, promptMd: questionPrompts.promptMd, answerMd: stimulusGroupQuestions.answerMd, isActive: stimulusGroupQuestions.isActive })
    .from(stimulusGroupQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusGroupQuestions.questionPromptId))
    .where(inArray(stimulusGroupQuestions.stimulusGroupId, groupIds))
    .orderBy(asc(stimulusGroupQuestions.createdAt));
  const optionIds = options.map((option) => option.id);
  const optionQuestions = optionIds.length
    ? await db
        .select({ id: stimulusOptionQuestions.id, stimulusGroupOptionId: stimulusOptionQuestions.stimulusGroupOptionId, questionPromptId: stimulusOptionQuestions.questionPromptId, promptMd: questionPrompts.promptMd, answerMd: stimulusOptionQuestions.answerMd, isActive: stimulusOptionQuestions.isActive })
        .from(stimulusOptionQuestions)
        .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusOptionQuestions.questionPromptId))
        .where(inArray(stimulusOptionQuestions.stimulusGroupOptionId, optionIds))
        .orderBy(asc(stimulusOptionQuestions.createdAt))
    : [];
  return groups.map((group) => ({
    ...group,
    options: options.filter((option) => option.stimulusGroupId === group.id),
    questions: groupQuestions.filter((question) => question.stimulusGroupId === group.id).map((question) => ({ ...question, scope: 'group' })),
    optionQuestions: optionQuestions.filter((question) => options.find((option) => option.id === question.stimulusGroupOptionId)?.stimulusGroupId === group.id).map((question) => ({ ...question, scope: 'option' }))
  }));
}

/** @param {LearningDb} db @param {{ caseId: string, name: string, specificQuestionMode?: string, minimumSpecificQuestions?: unknown, isActive?: unknown }} input */
export async function createStimulusGroup(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  await requireCase(db, caseId);
  const name = requiredText(input.name, 'Stimulus Group name');
  const selected = coverage(input.specificQuestionMode, input.minimumSpecificQuestions);
  const nextIsActive = input.isActive == null ? true : activeValue(input.isActive);
  await validateCoverageFitsCase(db, caseId, null, selected, nextIsActive);
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
 * The group must be inserted with a NULL Original first, then the option is
 * inserted and the pointer is assigned through the validated UPDATE path. All
 * relationship changes execute in one D1 batch so failure leaves the ordinary
 * Case image untouched and no partial family behind.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, assetId: string, name: string }} input
 */
export async function startStimulusGroupFromCaseAsset(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const assetId = requiredText(input.assetId, 'Asset');
  const name = requiredText(input.name, 'Stimulus Group name');
  await requireCase(db, caseId);
  await requireAsset(db, assetId);

  const fixed = (await db
    .select({ captionMd: caseAssets.captionMd })
    .from(caseAssets)
    .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)))
    .limit(1))[0];
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

  if (typeof db.batch !== 'function') {
    throw new Error('Atomic database batch support is required to start a stimulus family.');
  }

  const selected = { mode: 'none', minimum: null };
  await validateCoverageFitsCase(db, caseId, null, selected, true);
  const [lastGroup, currentFixed] = await Promise.all([
    db.select({ displayOrder: stimulusGroups.displayOrder }).from(stimulusGroups).where(eq(stimulusGroups.caseId, caseId)).orderBy(desc(stimulusGroups.displayOrder)).limit(1),
    db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(eq(caseAssets.caseId, caseId)).orderBy(asc(caseAssets.displayOrder))
  ]);
  const remaining = currentFixed.filter((row) => row.assetId !== assetId);
  const groupId = crypto.randomUUID();
  const optionId = crypto.randomUUID();
  const groupInsert = db.insert(stimulusGroups).values({
    id: groupId,
    caseId,
    name,
    displayOrder: (lastGroup[0]?.displayOrder ?? -1) + 1,
    selectionCount: 1,
    specificQuestionMode: 'none',
    minimumSpecificQuestions: null,
    isActive: true
  });
  const optionInsert = db.insert(stimulusGroupOptions).values({
    id: optionId,
    stimulusGroupId: groupId,
    assetId,
    displayOrder: 0,
    captionMd: optionalText(fixed.captionMd)
  });
  const originalUpdate = db.update(stimulusGroups)
    .set({ originalOptionId: optionId, updatedAt: new Date() })
    .where(eq(stimulusGroups.id, groupId));
  const fixedDelete = db.delete(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)));
  const reorderStatements = remaining.map((row, index) => db.update(caseAssets)
    .set({ displayOrder: index })
    .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, row.assetId))));

  await db.batch([groupInsert, optionInsert, originalUpdate, fixedDelete, ...reorderStatements]);
  return { caseId, groupId, optionId, assetId };
}

/** @param {LearningDb} db @param {{ groupId: string, name: string, specificQuestionMode?: string, minimumSpecificQuestions?: unknown, isActive?: unknown }} input */
export async function updateStimulusGroup(db, input) {
  const group = await requireGroup(db, requiredText(input.groupId, 'Stimulus Group'));
  const selected = coverage(input.specificQuestionMode, input.minimumSpecificQuestions);
  const nextIsActive = input.isActive == null ? group.isActive : activeValue(input.isActive);
  if (!group.isActive && nextIsActive) {
    await validateFamilyLiveState(db, group, {
      selected,
      state: { activateGroupId: group.id }
    });
  } else {
    await validateCoverageFitsCase(db, group.caseId, group.id, selected, nextIsActive);
  }
  await db.update(stimulusGroups).set({ name: requiredText(input.name, 'Stimulus Group name'), specificQuestionMode: selected.mode, minimumSpecificQuestions: selected.minimum, isActive: nextIsActive, updatedAt: new Date() }).where(eq(stimulusGroups.id, group.id));
}

/** @param {LearningDb} db @param {string} groupId @param {string} assetId @param {string | null | undefined} captionMd */
export async function addStimulusOption(db, groupId, assetId, captionMd = null) {
  const group = await requireGroup(db, requiredText(groupId, 'Stimulus Group'));
  await requireAsset(db, requiredText(assetId, 'Asset'));
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
  await validateNewOptionCoverage(db, group);
  const last = await db.select({ displayOrder: stimulusGroupOptions.displayOrder }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.stimulusGroupId, group.id)).orderBy(desc(stimulusGroupOptions.displayOrder)).limit(1);
  const id = crypto.randomUUID();
  await db.insert(stimulusGroupOptions).values({ id, stimulusGroupId: group.id, assetId, displayOrder: (last[0]?.displayOrder ?? -1) + 1, captionMd: optionalText(captionMd) });
  return id;
}

/** @param {LearningDb} db @param {string} groupId @param {string} assetId */
export async function convertCaseAssetToStimulusOption(db, groupId, assetId) {
  const group = await requireGroup(db, groupId);
  await requireAsset(db, assetId);
  const fixed = (await db.select({ captionMd: caseAssets.captionMd }).from(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId))).limit(1))[0];
  if (!fixed) return addStimulusOption(db, groupId, assetId);
  const duplicate = (await db.select({ id: stimulusGroupOptions.id, groupId: stimulusGroupOptions.stimulusGroupId, removedFromCase: stimulusGroupOptions.removedFromCase }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).where(and(eq(stimulusGroups.caseId, group.caseId), eq(stimulusGroupOptions.assetId, assetId))).limit(1))[0];
  if (duplicate) {
    if (!duplicate.removedFromCase || duplicate.groupId !== group.id) throw new StimulusGroupInputError(duplicate.removedFromCase
      ? 'That Asset has a removed relationship in another alternative set in this Case. Restore it from that set before moving it elsewhere.'
      : 'That Asset is already used as a Stimulus Option in this Case.');
    await validateStimulusOptionRestoration(db, duplicate.id);
    const last = await db.select({ displayOrder: stimulusGroupOptions.displayOrder }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.stimulusGroupId, group.id)).orderBy(desc(stimulusGroupOptions.displayOrder)).limit(1);
    const remaining = (await db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(eq(caseAssets.caseId, group.caseId)).orderBy(asc(caseAssets.displayOrder))).filter((row) => row.assetId !== assetId);
    const restore = db.update(stimulusGroupOptions).set({ isActive: true, removedFromCase: false }).where(eq(stimulusGroupOptions.id, duplicate.id));
    const fixedDelete = db.delete(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId)));
    const reorderStatements = remaining.map((row, index) => db.update(caseAssets).set({ displayOrder: index }).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, row.assetId))));
    if (typeof db.batch === 'function') await db.batch([restore, fixedDelete, ...reorderStatements]);
    else { await restore; await fixedDelete; for (const statement of reorderStatements) await statement; }
    return duplicate.id;
  }

  await validateNewOptionCoverage(db, group);
  const last = await db.select({ displayOrder: stimulusGroupOptions.displayOrder }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.stimulusGroupId, group.id)).orderBy(desc(stimulusGroupOptions.displayOrder)).limit(1);
  const remaining = (await db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(eq(caseAssets.caseId, group.caseId)).orderBy(asc(caseAssets.displayOrder))).filter((row) => row.assetId !== assetId);
  const optionId = crypto.randomUUID();
  const optionInsert = db.insert(stimulusGroupOptions).values({ id: optionId, stimulusGroupId: group.id, assetId, displayOrder: (last[0]?.displayOrder ?? -1) + 1, captionMd: optionalText(fixed.captionMd) });
  const fixedDelete = db.delete(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId)));
  const reorderStatements = remaining.map((row, index) => db.update(caseAssets).set({ displayOrder: index }).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, row.assetId))));

  if (typeof db.batch === 'function') await db.batch([optionInsert, fixedDelete, ...reorderStatements]);
  else {
    await optionInsert;
    await fixedDelete;
    for (const statement of reorderStatements) await statement;
  }
  return optionId;
}

/** @param {LearningDb} db @param {string} optionId @param {boolean} isActive */
export async function setStimulusOptionActive(db, optionId, isActive) {
  const row = (await db.select({
    id: stimulusGroupOptions.id,
    groupId: stimulusGroupOptions.stimulusGroupId,
    assetId: stimulusGroupOptions.assetId,
    removedFromCase: stimulusGroupOptions.removedFromCase,
    groupIsActive: stimulusGroups.isActive,
    originalOptionId: stimulusGroups.originalOptionId
  }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).innerJoin(cases, eq(cases.id, stimulusGroups.caseId)).where(and(eq(stimulusGroupOptions.id, optionId), eq(cases.isActive, true), isNull(cases.previewSessionId))).limit(1))[0];
  if (!row) throw new StimulusGroupInputError('The selected Stimulus Option is missing.');
  if (row.removedFromCase) throw new StimulusGroupInputError('The selected Stimulus Option has been removed from this Case. Add the Asset again to restore it.');
  if (!isActive && row.originalOptionId === row.id) {
    throw new StimulusGroupInputError('Choose another Original stimulus before deactivating this image.');
  }
  if (isActive && row.groupIsActive) {
    const group = await requireGroup(db, row.groupId);
    await validateFamilyLiveState(db, group, {
      selected: { mode: group.specificQuestionMode, minimum: group.minimumSpecificQuestions },
      state: { activateOptionId: row.id }
    });
  }
  await db.update(stimulusGroupOptions).set({ isActive }).where(eq(stimulusGroupOptions.id, optionId));
}

/** @param {LearningDb} db @param {string} optionId */
export async function removeStimulusOptionFromCase(db, optionId) {
  const row = (await db.select({
    id: stimulusGroupOptions.id,
    removedFromCase: stimulusGroupOptions.removedFromCase,
    originalOptionId: stimulusGroups.originalOptionId
  })
    .from(stimulusGroupOptions)
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
    .where(and(eq(stimulusGroupOptions.id, optionId), eq(cases.isActive, true), isNull(cases.previewSessionId)))
    .limit(1))[0];
  if (!row) throw new StimulusGroupInputError('The selected Stimulus Option is missing.');
  if (row.removedFromCase) return;
  if (row.originalOptionId === row.id) {
    throw new StimulusGroupInputError('Choose another Original stimulus before removing this image from the Case.');
  }
  await db.update(stimulusGroupOptions).set({ isActive: false, removedFromCase: true }).where(eq(stimulusGroupOptions.id, optionId));
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

/** @param {LearningDb} db @param {string} groupId @param {string} optionId @param {'up'|'down'} direction */
export async function moveStimulusOption(db, groupId, optionId, direction) {
  await requireGroup(db, groupId);
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

/** @param {LearningDb} db @param {string} promptMd */
async function findOrCreatePrompt(db, promptMd) {
  const existing = (await db.select({ id: questionPrompts.id, isActive: questionPrompts.isActive }).from(questionPrompts).where(and(eq(questionPrompts.promptMd, promptMd), isNull(questionPrompts.previewSessionId))).orderBy(asc(questionPrompts.createdAt)).limit(1))[0];
  if (existing) {
    if (!existing.isActive) await db.update(questionPrompts).set({ isActive: true, updatedAt: new Date() }).where(eq(questionPrompts.id, existing.id));
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db.insert(questionPrompts).values({ id, promptMd, isActive: true });
  return id;
}

/** @param {LearningDb} db @param {string} groupId @param {{ originalPromptId?: string|null, promptMd: unknown, answerMd: unknown }} input */
export async function saveStimulusGroupQuestion(db, groupId, input) {
  const group = await requireGroup(db, groupId);
  const promptMd = requiredText(input.promptMd, 'Question prompt');
  const answerMd = requiredText(input.answerMd, 'Question answer');
  const promptId = await findOrCreatePrompt(db, promptMd);
  if (group.isActive) await ensurePromptIsNotUsedByAnotherGroup(db, group.caseId, promptId, group.id);
  const original = optionalText(input.originalPromptId);
  const duplicate = (await db.select({ id: stimulusGroupQuestions.id, questionPromptId: stimulusGroupQuestions.questionPromptId }).from(stimulusGroupQuestions).where(and(eq(stimulusGroupQuestions.stimulusGroupId, groupId), eq(stimulusGroupQuestions.questionPromptId, promptId))).limit(1))[0];
  if (duplicate && promptId !== original) throw new StimulusGroupInputError('That prompt is already used by this Stimulus Group.');
  if (original) {
    const existing = (await db.select({ id: stimulusGroupQuestions.id }).from(stimulusGroupQuestions).where(and(eq(stimulusGroupQuestions.stimulusGroupId, groupId), eq(stimulusGroupQuestions.questionPromptId, original))).limit(1))[0];
    if (!existing) throw new StimulusGroupInputError('That Stimulus Group question no longer exists.');
    await db.update(stimulusGroupQuestions).set({ questionPromptId: promptId, answerMd, isActive: true, updatedAt: new Date() }).where(eq(stimulusGroupQuestions.id, existing.id));
  } else {
    await db.insert(stimulusGroupQuestions).values({ id: crypto.randomUUID(), stimulusGroupId: groupId, questionPromptId: promptId, answerMd, isActive: true });
  }
  return promptId;
}

/** @param {LearningDb} db @param {string} optionId @param {{ originalPromptId?: string|null, promptMd: unknown, answerMd: unknown }} input */
export async function saveStimulusOptionQuestion(db, optionId, input) {
  const option = (await db.select({
    id: stimulusGroupOptions.id,
    groupId: stimulusGroupOptions.stimulusGroupId,
    isActive: stimulusGroupOptions.isActive,
    groupIsActive: stimulusGroups.isActive
  }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).innerJoin(cases, eq(cases.id, stimulusGroups.caseId)).where(and(eq(stimulusGroupOptions.id, optionId), eq(stimulusGroupOptions.removedFromCase, false), eq(cases.isActive, true), isNull(cases.previewSessionId))).limit(1))[0];
  if (!option) throw new StimulusGroupInputError('The selected Stimulus Option is missing or inactive.');
  const group = await requireGroup(db, option.groupId);
  const promptMd = requiredText(input.promptMd, 'Question prompt');
  const answerMd = requiredText(input.answerMd, 'Question answer');
  const promptId = await findOrCreatePrompt(db, promptMd);
  if (option.groupIsActive && option.isActive) {
    await ensurePromptIsNotUsedByAnotherGroup(db, group.caseId, promptId, group.id);
  }
  const original = optionalText(input.originalPromptId);
  const duplicate = (await db.select({ id: stimulusOptionQuestions.id, questionPromptId: stimulusOptionQuestions.questionPromptId }).from(stimulusOptionQuestions).where(and(eq(stimulusOptionQuestions.stimulusGroupOptionId, option.id), eq(stimulusOptionQuestions.questionPromptId, promptId))).limit(1))[0];
  if (duplicate && promptId !== original) throw new StimulusGroupInputError('That prompt is already used by this Stimulus Option.');
  if (original) {
    const existing = (await db.select({ id: stimulusOptionQuestions.id }).from(stimulusOptionQuestions).where(and(eq(stimulusOptionQuestions.stimulusGroupOptionId, option.id), eq(stimulusOptionQuestions.questionPromptId, original))).limit(1))[0];
    if (!existing) throw new StimulusGroupInputError('That Stimulus Option question no longer exists.');
    await db.update(stimulusOptionQuestions).set({ questionPromptId: promptId, answerMd, isActive: true, updatedAt: new Date() }).where(eq(stimulusOptionQuestions.id, existing.id));
  } else {
    await db.insert(stimulusOptionQuestions).values({ id: crypto.randomUUID(), stimulusGroupOptionId: option.id, questionPromptId: promptId, answerMd, isActive: true });
  }
  return promptId;
}

/** @param {LearningDb} db @param {string} groupId @param {string} promptId */
export async function removeStimulusGroupQuestion(db, groupId, promptId) {
  await requireGroup(db, groupId);
  await db.update(stimulusGroupQuestions).set({ isActive: false, updatedAt: new Date() }).where(and(eq(stimulusGroupQuestions.stimulusGroupId, groupId), eq(stimulusGroupQuestions.questionPromptId, promptId)));
}

/** @param {LearningDb} db @param {string} optionId @param {string} promptId */
export async function removeStimulusOptionQuestion(db, optionId, promptId) {
  const option = (await db
    .select({ groupId: stimulusGroupOptions.stimulusGroupId })
    .from(stimulusGroupOptions)
    .where(eq(stimulusGroupOptions.id, optionId))
    .limit(1))[0];
  if (!option) throw new StimulusGroupInputError('The selected Stimulus Option is missing or inactive.');
  await requireGroup(db, option.groupId);
  await db.update(stimulusOptionQuestions).set({ isActive: false, updatedAt: new Date() }).where(and(eq(stimulusOptionQuestions.stimulusGroupOptionId, optionId), eq(stimulusOptionQuestions.questionPromptId, promptId)));
}
