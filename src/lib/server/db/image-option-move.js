import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { assets, cases, stimulusGroupOptions, stimulusGroupQuestions, stimulusGroups, stimulusOptionQuestions } from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class StimulusOptionMoveError extends Error {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = 'INVALID') {
    super(message);
    this.name = 'StimulusOptionMoveError';
    this.code = code;
  }
}

/** @param {unknown} value @param {string} label */
function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new StimulusOptionMoveError(`${label} is required.`);
  return text;
}

/**
 * Compute the active specific-question requirement for every active group in a
 * Case, optionally simulating one option as belonging to a different group.
 * @param {LearningDb} db
 * @param {string} caseId
 * @param {string} movingOptionId
 * @param {string} targetGroupId
 */
async function simulatedCoverageRequirement(db, caseId, movingOptionId, targetGroupId) {
  const groups = await db.select({ id: stimulusGroups.id, mode: stimulusGroups.specificQuestionMode, minimum: stimulusGroups.minimumSpecificQuestions })
    .from(stimulusGroups).where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusGroups.isActive, true)));
  if (!groups.length) return 0;
  const groupIds = groups.map((row) => row.id);
  const options = await db.select({ id: stimulusGroupOptions.id, groupId: stimulusGroupOptions.stimulusGroupId })
    .from(stimulusGroupOptions).innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
    .where(and(inArray(stimulusGroupOptions.stimulusGroupId, groupIds), eq(stimulusGroupOptions.isActive, true), eq(stimulusGroupOptions.removedFromCase, false), eq(assets.isActive, true)));
  const optionIds = options.map((row) => row.id);
  const [groupQuestions, optionQuestions] = await Promise.all([
    db.select({ groupId: stimulusGroupQuestions.stimulusGroupId, promptId: stimulusGroupQuestions.questionPromptId })
      .from(stimulusGroupQuestions).where(and(inArray(stimulusGroupQuestions.stimulusGroupId, groupIds), eq(stimulusGroupQuestions.isActive, true))),
    optionIds.length
      ? db.select({ optionId: stimulusOptionQuestions.stimulusGroupOptionId, promptId: stimulusOptionQuestions.questionPromptId })
          .from(stimulusOptionQuestions).where(and(inArray(stimulusOptionQuestions.stimulusGroupOptionId, optionIds), eq(stimulusOptionQuestions.isActive, true)))
      : []
  ]);

  let total = 0;
  for (const group of groups) {
    if (group.mode === 'none') continue;
    const groupPromptIds = groupQuestions.filter((row) => row.groupId === group.id).map((row) => row.promptId);
    const simulatedOptions = options.filter((row) => {
      const simulatedGroupId = row.id === movingOptionId ? targetGroupId : row.groupId;
      return simulatedGroupId === group.id;
    });
    if (!simulatedOptions.length) continue;
    const counts = simulatedOptions.map((option) => new Set([
      ...groupPromptIds,
      ...optionQuestions.filter((row) => row.optionId === option.id).map((row) => row.promptId)
    ]).size);
    if (group.mode === 'minimum') {
      const minimum = Number(group.minimum ?? 0);
      const insufficient = counts.find((count) => count < minimum);
      if (insufficient != null) {
        throw new StimulusOptionMoveError(`Moving this image would leave an active option with ${insufficient} specific questions, below the set minimum of ${minimum}.`);
      }
      total += minimum;
    } else if (group.mode === 'all') {
      total += Math.max(...counts);
    }
  }
  return total;
}

/**
 * Move an existing alternative option to another active set in the SAME Case.
 * The row is updated in-place so its stable option ID, caption, active state,
 * exact-option questions and other option-owned metadata remain attached.
 *
 * previewSessionId=null means normal production Admin. A non-null value means
 * every Case/group/option relationship must belong to that Preview Session.
 *
 * @param {LearningDb} db
 * @param {{ caseId: string, optionId: string, targetGroupId: string, previewSessionId?: string | null }} input
 */
export async function moveStimulusOptionWithinCase(db, input) {
  const caseId = required(input.caseId, 'Case');
  const optionId = required(input.optionId, 'Stimulus option');
  const targetGroupId = required(input.targetGroupId, 'Target alternative set');
  const previewSessionId = input.previewSessionId ?? null;

  const caseCondition = previewSessionId == null ? isNull(cases.previewSessionId) : eq(cases.previewSessionId, previewSessionId);
  const caseRow = (await db.select({ id: cases.id, mode: cases.questionSelectionMode, count: cases.questionCount })
    .from(cases).where(and(eq(cases.id, caseId), eq(cases.isActive, true), caseCondition)).limit(1))[0];
  if (!caseRow) throw new StimulusOptionMoveError('The selected Case is missing, inactive, or outside the permitted workspace.', 'NOT_OWNED');

  // Read the option and source group separately. Besides making the ownership
  // checks easier to audit, this avoids duplicate `is_active` projections from
  // a joined row being ambiguously decoded by lightweight D1 test adapters.
  const option = (await db.select({
    id: stimulusGroupOptions.id,
    assetId: stimulusGroupOptions.assetId,
    sourceGroupId: stimulusGroupOptions.stimulusGroupId,
    isActive: stimulusGroupOptions.isActive,
    removedFromCase: stimulusGroupOptions.removedFromCase
  }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.id, optionId)).limit(1))[0];
  if (!option) throw new StimulusOptionMoveError('The selected alternative image is missing.', 'NOT_OWNED');
  if (option.isActive !== true || option.removedFromCase) throw new StimulusOptionMoveError('Only an active option in an active source set can be moved.');

  const source = (await db.select({ id: stimulusGroups.id, caseId: stimulusGroups.caseId, isActive: stimulusGroups.isActive })
    .from(stimulusGroups).where(eq(stimulusGroups.id, option.sourceGroupId)).limit(1))[0];
  if (!source || source.caseId !== caseId) throw new StimulusOptionMoveError('The selected alternative image does not belong to this Case.', 'NOT_OWNED');
  if (source.isActive !== true) throw new StimulusOptionMoveError('Only an active option in an active source set can be moved.');
  if (source.id === targetGroupId) throw new StimulusOptionMoveError('Choose a different alternative set.');

  const target = (await db.select({ id: stimulusGroups.id, caseId: stimulusGroups.caseId, isActive: stimulusGroups.isActive })
    .from(stimulusGroups).where(eq(stimulusGroups.id, targetGroupId)).limit(1))[0];
  if (!target || target.caseId !== caseId) throw new StimulusOptionMoveError('The target alternative set must belong to the same Case.', 'NOT_OWNED');
  if (target.isActive !== true) throw new StimulusOptionMoveError('The target alternative set is inactive.');

  const duplicate = (await db.select({ id: stimulusGroupOptions.id }).from(stimulusGroupOptions)
    .where(and(eq(stimulusGroupOptions.stimulusGroupId, targetGroupId), eq(stimulusGroupOptions.assetId, option.assetId))).limit(1))[0];
  if (duplicate) throw new StimulusOptionMoveError('This Asset already has an option relationship in the target set.');

  const requiredQuestions = await simulatedCoverageRequirement(db, caseId, optionId, targetGroupId);
  if (caseRow.mode === 'fixed' && caseRow.count && requiredQuestions > caseRow.count) {
    throw new StimulusOptionMoveError(`Moving this image would require at least ${requiredQuestions} stimulus-specific questions, but the Case is configured for ${caseRow.count}.`);
  }

  const last = (await db.select({ displayOrder: stimulusGroupOptions.displayOrder }).from(stimulusGroupOptions)
    .where(eq(stimulusGroupOptions.stimulusGroupId, targetGroupId)).orderBy(desc(stimulusGroupOptions.displayOrder)).limit(1))[0];
  const displayOrder = (last?.displayOrder ?? -1) + 1;
  try {
    await db.update(stimulusGroupOptions).set({ stimulusGroupId: targetGroupId, displayOrder })
      .where(and(eq(stimulusGroupOptions.id, optionId), eq(stimulusGroupOptions.stimulusGroupId, source.id)));
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) throw new StimulusOptionMoveError('The source or target set changed while moving the image. Refresh and try again.');
    throw error;
  }
  return { optionId, sourceGroupId: source.id, targetGroupId, displayOrder };
}
