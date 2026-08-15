import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import {
  assets,
  caseAssets,
  cases,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups,
  stimulusOptionQuestions
} from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

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

/** @param {LearningDb} db @param {string} groupId */
async function loadSpecificQuestionSets(db, groupId) {
  const [groupQuestionRows, optionRows] = await Promise.all([
    db
      .select({ questionPromptId: stimulusGroupQuestions.questionPromptId })
      .from(stimulusGroupQuestions)
      .where(and(eq(stimulusGroupQuestions.stimulusGroupId, groupId), eq(stimulusGroupQuestions.isActive, true))),
    db
      .select({ id: stimulusGroupOptions.id })
      .from(stimulusGroupOptions)
      .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
      .where(and(eq(stimulusGroupOptions.stimulusGroupId, groupId), eq(stimulusGroupOptions.isActive, true), eq(assets.isActive, true)))
  ]);
  if (!optionRows.length) return [];
  const optionIds = optionRows.map((option) => option.id);
  const optionQuestionRows = await db
    .select({ stimulusGroupOptionId: stimulusOptionQuestions.stimulusGroupOptionId, questionPromptId: stimulusOptionQuestions.questionPromptId })
    .from(stimulusOptionQuestions)
    .where(and(inArray(stimulusOptionQuestions.stimulusGroupOptionId, optionIds), eq(stimulusOptionQuestions.isActive, true)));
  const groupPromptIds = groupQuestionRows.map((question) => question.questionPromptId);
  return optionRows.map((option) => ({
    optionId: option.id,
    promptIds: new Set([
      ...groupPromptIds,
      ...optionQuestionRows.filter((question) => question.stimulusGroupOptionId === option.id).map((question) => question.questionPromptId)
    ])
  }));
}

/** @param {LearningDb} db @param {string} groupId @param {{ mode: string, minimum: number | null }} selected */
async function coverageRequirement(db, groupId, selected) {
  if (selected.mode === 'none') return 0;
  const specificSets = await loadSpecificQuestionSets(db, groupId);
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
 * Return the maximum number of questions that active Stimulus Group guarantees can require
 * in one Review. Independent groups are additive because a Review selects one option per group.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 * @param {{ replacingGroupId?: string | null, replacementCoverage?: { mode: string, minimum: number | null } | null, replacementActive?: boolean }} [override]
 */
export async function getCaseStimulusCoverageRequirement(db, caseId, override = {}) {
  const replacingGroupId = override.replacingGroupId ?? null;
  const replacementCoverage = override.replacementCoverage ?? null;
  const replacementActive = override.replacementActive ?? true;
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
    total += await coverageRequirement(db, group.id, selected);
  }
  if (replacingGroupId && replacementActive && !replacementSeen && replacementCoverage) {
    total += await coverageRequirement(db, replacingGroupId, replacementCoverage);
  }
  return total;
}

/** @param {LearningDb} db @param {string} caseId @param {string | null} replacingGroupId @param {{ mode: string, minimum: number | null }} selected @param {boolean} [replacementActive] */
async function validateCoverageFitsCase(db, caseId, replacingGroupId, selected, replacementActive = true) {
  if (replacingGroupId && replacementActive) await coverageRequirement(db, replacingGroupId, selected);
  const caseRow = (await db.select({ mode: cases.questionSelectionMode, count: cases.questionCount }).from(cases).where(eq(cases.id, caseId)).limit(1))[0];
  if (caseRow?.mode !== 'fixed' || !caseRow.count) return;
  const requiredTotal = await getCaseStimulusCoverageRequirement(db, caseId, {
    replacingGroupId,
    replacementCoverage: replacingGroupId ? selected : null,
    replacementActive
  });
  if (requiredTotal > caseRow.count) {
    throw new StimulusGroupInputError(`This Stimulus Group coverage can require at least ${requiredTotal} questions, but the Case is configured for ${caseRow.count}.`);
  }
}

/** @param {LearningDb} db @param {string} caseId */
async function requireCase(db, caseId) {
  const row = (await db.select({ id: cases.id }).from(cases).where(and(eq(cases.id, caseId), eq(cases.isActive, true))).limit(1))[0];
  if (!row) throw new StimulusGroupInputError('The selected Case is missing or inactive.');
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
      .where(and(eq(stimulusGroups.id, groupId), eq(cases.isActive, true)))
      .limit(1)
  )[0];
  if (!row) throw new StimulusGroupInputError('The selected Stimulus Group is missing or inactive.');
  return row;
}

/** @param {LearningDb} db @param {string} assetId */
async function requireAsset(db, assetId) {
  const row = (await db.select({ id: assets.id, type: assets.type }).from(assets).where(and(eq(assets.id, assetId), eq(assets.isActive, true))).limit(1))[0];
  if (!row) throw new StimulusGroupInputError('The selected Asset is missing or inactive.');
  if (row.type !== 'image') throw new StimulusGroupInputError('Only image Assets can be stimulus options.');
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
      storageKey: assets.storageKey,
      mimeType: assets.mimeType,
      originalFilename: assets.originalFilename,
      altText: assets.altText,
      assetIsActive: assets.isActive
    })
    .from(stimulusGroupOptions)
    .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
    .where(inArray(stimulusGroupOptions.stimulusGroupId, groupIds))
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

/** @param {LearningDb} db @param {{ groupId: string, name: string, specificQuestionMode?: string, minimumSpecificQuestions?: unknown, isActive?: unknown }} input */
export async function updateStimulusGroup(db, input) {
  const group = await requireGroup(db, requiredText(input.groupId, 'Stimulus Group'));
  const selected = coverage(input.specificQuestionMode, input.minimumSpecificQuestions);
  const nextIsActive = input.isActive == null ? group.isActive : activeValue(input.isActive);
  await validateCoverageFitsCase(db, group.caseId, group.id, selected, nextIsActive);
  await db.update(stimulusGroups).set({ name: requiredText(input.name, 'Stimulus Group name'), specificQuestionMode: selected.mode, minimumSpecificQuestions: selected.minimum, isActive: nextIsActive, updatedAt: new Date() }).where(eq(stimulusGroups.id, group.id));
}

/** @param {LearningDb} db @param {string} groupId @param {string} assetId @param {string | null | undefined} captionMd */
export async function addStimulusOption(db, groupId, assetId, captionMd = null) {
  const group = await requireGroup(db, requiredText(groupId, 'Stimulus Group'));
  await requireAsset(db, requiredText(assetId, 'Asset'));
  await validateNewOptionCoverage(db, group);
  const duplicate = await db.select({ id: stimulusGroupOptions.id }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).where(and(eq(stimulusGroups.caseId, group.caseId), eq(stimulusGroupOptions.assetId, assetId))).limit(1);
  const fixed = await db.select({ captionMd: caseAssets.captionMd }).from(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId))).limit(1);
  if (duplicate[0] || fixed[0]) throw new StimulusGroupInputError('That Asset is already used in this Case. Convert or remove the existing attachment first.');
  const last = await db.select({ displayOrder: stimulusGroupOptions.displayOrder }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.stimulusGroupId, group.id)).orderBy(desc(stimulusGroupOptions.displayOrder)).limit(1);
  const id = crypto.randomUUID();
  await db.insert(stimulusGroupOptions).values({ id, stimulusGroupId: group.id, assetId, displayOrder: (last[0]?.displayOrder ?? -1) + 1, captionMd: optionalText(captionMd) });
  return id;
}

/** @param {LearningDb} db @param {string} groupId @param {string} assetId */
export async function convertCaseAssetToStimulusOption(db, groupId, assetId) {
  const group = await requireGroup(db, groupId);
  await requireAsset(db, assetId);
  await validateNewOptionCoverage(db, group);
  const fixed = (await db.select({ captionMd: caseAssets.captionMd }).from(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId))).limit(1))[0];
  if (!fixed) return addStimulusOption(db, groupId, assetId);
  const duplicate = (await db.select({ id: stimulusGroupOptions.id }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).where(and(eq(stimulusGroups.caseId, group.caseId), eq(stimulusGroupOptions.assetId, assetId))).limit(1))[0];
  if (duplicate) throw new StimulusGroupInputError('That Asset is already used as a Stimulus Option in this Case.');

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
  const row = (await db.select({ id: stimulusGroupOptions.id, groupId: stimulusGroupOptions.stimulusGroupId, assetId: stimulusGroupOptions.assetId }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).innerJoin(cases, eq(cases.id, stimulusGroups.caseId)).where(and(eq(stimulusGroupOptions.id, optionId), eq(cases.isActive, true))).limit(1))[0];
  if (!row) throw new StimulusGroupInputError('The selected Stimulus Option is missing.');
  if (isActive) {
    await requireAsset(db, row.assetId);
    const group = await requireGroup(db, row.groupId);
    if (group.specificQuestionMode === 'minimum') {
      const [groupRows, optionRows] = await Promise.all([
        db.select({ questionPromptId: stimulusGroupQuestions.questionPromptId }).from(stimulusGroupQuestions).where(and(eq(stimulusGroupQuestions.stimulusGroupId, group.id), eq(stimulusGroupQuestions.isActive, true))),
        db.select({ questionPromptId: stimulusOptionQuestions.questionPromptId }).from(stimulusOptionQuestions).where(and(eq(stimulusOptionQuestions.stimulusGroupOptionId, optionId), eq(stimulusOptionQuestions.isActive, true)))
      ]);
      const available = new Set([...groupRows, ...optionRows].map((question) => question.questionPromptId)).size;
      const minimum = group.minimumSpecificQuestions ?? 0;
      if (available < minimum) throw new StimulusGroupInputError(`This option has only ${available} specific questions, below the group's minimum of ${minimum}.`);
    }
  }
  await db.update(stimulusGroupOptions).set({ isActive }).where(eq(stimulusGroupOptions.id, optionId));
}

/** @param {LearningDb} db @param {string} caseId @param {string} promptId @param {string} groupId */
async function ensurePromptIsNotUsedByAnotherGroup(db, caseId, promptId, groupId) {
  const [groupRows, optionRows] = await Promise.all([
    db.select({ groupId: stimulusGroupQuestions.stimulusGroupId }).from(stimulusGroupQuestions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupQuestions.stimulusGroupId)).where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusGroupQuestions.questionPromptId, promptId), eq(stimulusGroupQuestions.isActive, true))),
    db.select({ groupId: stimulusGroups.id }).from(stimulusOptionQuestions).innerJoin(stimulusGroupOptions, eq(stimulusGroupOptions.id, stimulusOptionQuestions.stimulusGroupOptionId)).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusOptionQuestions.questionPromptId, promptId), eq(stimulusOptionQuestions.isActive, true)))
  ]);
  if ([...groupRows.map((row) => row.groupId), ...optionRows.map((row) => row.groupId)].some((id) => id !== groupId)) {
    throw new StimulusGroupInputError('The same Question Prompt cannot be independently attached to multiple active Stimulus Groups in one Case.');
  }
}

/** @param {LearningDb} db @param {string} groupId @param {string} optionId @param {'up'|'down'} direction */
export async function moveStimulusOption(db, groupId, optionId, direction) {
  await requireGroup(db, groupId);
  const rows = await db.select({ id: stimulusGroupOptions.id }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.stimulusGroupId, groupId)).orderBy(asc(stimulusGroupOptions.displayOrder));
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
  const existing = (await db.select({ id: questionPrompts.id, isActive: questionPrompts.isActive }).from(questionPrompts).where(eq(questionPrompts.promptMd, promptMd)).orderBy(asc(questionPrompts.createdAt)).limit(1))[0];
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
  await ensurePromptIsNotUsedByAnotherGroup(db, group.caseId, promptId, group.id);
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
  const option = (await db.select({ id: stimulusGroupOptions.id, groupId: stimulusGroupOptions.stimulusGroupId }).from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).innerJoin(cases, eq(cases.id, stimulusGroups.caseId)).where(and(eq(stimulusGroupOptions.id, optionId), eq(cases.isActive, true))).limit(1))[0];
  if (!option) throw new StimulusGroupInputError('The selected Stimulus Option is missing or inactive.');
  const group = await requireGroup(db, option.groupId);
  const promptMd = requiredText(input.promptMd, 'Question prompt');
  const answerMd = requiredText(input.answerMd, 'Question answer');
  const promptId = await findOrCreatePrompt(db, promptMd);
  await ensurePromptIsNotUsedByAnotherGroup(db, group.caseId, promptId, group.id);
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
  await db.update(stimulusOptionQuestions).set({ isActive: false, updatedAt: new Date() }).where(and(eq(stimulusOptionQuestions.stimulusGroupOptionId, optionId), eq(stimulusOptionQuestions.questionPromptId, promptId)));
}
