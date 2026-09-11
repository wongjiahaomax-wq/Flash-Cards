import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { productionCaseTimestampWrite, touchProductionCaseUpdatedAt } from './case-authoring-timestamps.js';

import {
  assetQuestions,
  assets,
  caseAssets,
  cases,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroups,
  stimulusOptionAssetQuestions
} from './schema.js';
import { StimulusGroupInputError } from './stimulus-family-error.js';
import { ensurePromptIsNotUsedByAnotherGroup } from './stimulus-family-specificity.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class AssetQuestionInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AssetQuestionInputError';
  }
}

/** @param {unknown} value @param {string} label */
function requiredText(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new AssetQuestionInputError(`${label} is required.`);
  return text;
}

/** @param {LearningDb} db @param {string} assetId */
async function requireProductionAsset(db, assetId) {
  const row = (await db.select({ id: assets.id, isActive: assets.isActive, type: assets.type })
    .from(assets)
    .where(and(eq(assets.id, assetId), isNull(assets.previewSessionId)))
    .limit(1))[0];
  if (!row || row.type !== 'image') throw new AssetQuestionInputError('The selected production image Asset does not exist.');
  return row;
}

/** @param {LearningDb} db @param {string} promptMd */
async function findProductionPrompt(db, promptMd) {
  const existing = (await db.select({ id: questionPrompts.id, isActive: questionPrompts.isActive, previewSessionId: questionPrompts.previewSessionId })
    .from(questionPrompts)
    .where(eq(questionPrompts.promptMd, promptMd))
    .orderBy(asc(questionPrompts.createdAt), asc(questionPrompts.id))
    .limit(1))[0];
  return existing && !existing.previewSessionId ? existing : null;
}

/** @param {LearningDb} db @param {string} assetId */
function productionAssetWriteFence(db, assetId) {
  return db.update(assets).set({
    type: sql`CASE WHEN EXISTS (
      SELECT 1 FROM assets source_asset
      WHERE source_asset.id = ${assetId}
        AND source_asset.type = 'image'
        AND source_asset.preview_session_id IS NULL
        AND source_asset.deduplicated_into_asset_id IS NULL
    ) THEN \`type\` ELSE NULL END`
  }).where(eq(assets.id, assetId));
}

/** @param {LearningDb} db @param {[any, ...any[]]} statements */
async function runAssetQuestionBatch(db, statements) {
  try {
    /** @type {[any, ...any[]]} */
    const batchStatements = statements;
    await db.batch(batchStatements);
  } catch (error) {
    // A source Asset that was tombstoned between the read and the batch trips the
    // fence's NOT NULL sentinel; a source Asset that was fully deleted makes the
    // fence a no-op and the Asset Question insert fail its foreign key. Both are
    // the same stale-source race and must surface as a controlled input error.
    if (error instanceof Error && /NOT NULL constraint failed: assets\.type|FOREIGN KEY constraint failed|deduplicat|supersed|tombston/i.test(error.message)) {
      throw new AssetQuestionInputError('The selected production image Asset changed; refresh and try again.');
    }
    throw error;
  }
}

/** @param {LearningDb} db @param {string} assetQuestionId @param {string} promptId */
async function validateAssetQuestionActivation(db, assetQuestionId, promptId) {
  const contexts = await db.select({ caseId: stimulusGroups.caseId, groupId: stimulusGroups.id })
    .from(stimulusOptionAssetQuestions)
    .innerJoin(stimulusGroupOptions, eq(stimulusGroupOptions.id, stimulusOptionAssetQuestions.stimulusGroupOptionId))
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
    .where(and(
      eq(stimulusOptionAssetQuestions.assetQuestionId, assetQuestionId),
      eq(cases.isActive, true),
      isNull(cases.previewSessionId),
      eq(stimulusGroups.isActive, true),
      eq(stimulusGroupOptions.isActive, true),
      eq(stimulusGroupOptions.removedFromCase, false)
    ));
  const checked = new Set();
  for (const context of contexts) {
    const key = `${context.caseId}:${context.groupId}`;
    if (checked.has(key)) continue;
    checked.add(key);
    await ensurePromptMayBeSpecificInGroup(db, context.caseId, promptId, context.groupId);
  }
}

/** @param {LearningDb} db @param {string} assetId */
export async function listAssetQuestions(db, assetId) {
  await requireProductionAsset(db, assetId);
  return db.select({
    id: assetQuestions.id,
    assetId: assetQuestions.assetId,
    questionPromptId: assetQuestions.questionPromptId,
    promptMd: questionPrompts.promptMd,
    answerMd: assetQuestions.answerMd,
    isActive: assetQuestions.isActive,
    promptIsActive: questionPrompts.isActive,
    usageCount: sql`(select count(*) from stimulus_option_asset_questions usage where usage.asset_question_id = ${assetQuestions.id})`.mapWith(Number)
  })
    .from(assetQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, assetQuestions.questionPromptId))
    .where(and(eq(assetQuestions.assetId, assetId), isNull(questionPrompts.previewSessionId)))
    .orderBy(desc(assetQuestions.isActive), asc(assetQuestions.createdAt), asc(assetQuestions.id));
}

/** @param {LearningDb} db @param {{ assetId: unknown, promptMd: unknown, answerMd: unknown }} input */
export async function createAssetQuestion(db, input) {
  const assetId = requiredText(input.assetId, 'Asset');
  const promptMd = requiredText(input.promptMd, 'Question prompt');
  const answerMd = requiredText(input.answerMd, 'Question answer');
  if (typeof db.batch !== 'function') throw new AssetQuestionInputError('Atomic reusable image question creation requires D1 batch support.');
  await requireProductionAsset(db, assetId);
  const prompt = await findProductionPrompt(db, promptMd);
  const promptId = prompt?.id ?? crypto.randomUUID();
  const existing = (await db.select({ id: assetQuestions.id, answerMd: assetQuestions.answerMd, isActive: assetQuestions.isActive })
    .from(assetQuestions)
    .where(and(eq(assetQuestions.assetId, assetId), eq(assetQuestions.questionPromptId, promptId)))
    .limit(1))[0];
  if (existing) {
    if (existing.answerMd !== answerMd) {
      throw new AssetQuestionInputError('This image already has a reusable question with that wording. Edit the canonical question instead of creating a second answer.');
    }
    if (!existing.isActive) await validateAssetQuestionActivation(db, existing.id, promptId);
    const statements = /** @type {[any, ...any[]]} */ ([productionAssetWriteFence(db, assetId)]);
    if (prompt && !prompt.isActive) statements.push(db.update(questionPrompts).set({ isActive: true, updatedAt: new Date() }).where(eq(questionPrompts.id, promptId)));
    if (!existing.isActive) statements.push(db.update(assetQuestions).set({ isActive: true, updatedAt: new Date() }).where(and(eq(assetQuestions.id, existing.id), eq(assetQuestions.assetId, assetId))));
    await runAssetQuestionBatch(db, statements);
    return existing.id;
  }
  const id = crypto.randomUUID();
  const statements = /** @type {[any, ...any[]]} */ ([productionAssetWriteFence(db, assetId)]);
  if (prompt) {
    if (!prompt.isActive) statements.push(db.update(questionPrompts).set({ isActive: true, updatedAt: new Date() }).where(eq(questionPrompts.id, promptId)));
  } else {
    statements.push(db.insert(questionPrompts).values({ id: promptId, promptMd, previewSessionId: null, isActive: true }));
  }
  statements.push(db.insert(assetQuestions).values({ id, assetId, questionPromptId: promptId, answerMd, isActive: true }));
  await runAssetQuestionBatch(db, statements);
  return id;
}

/** @param {LearningDb} db @param {string} caseId @param {string} optionId */
async function requireProductionOption(db, caseId, optionId) {
  const row = (await db.select({
    optionId: stimulusGroupOptions.id,
    assetId: stimulusGroupOptions.assetId,
    stimulusGroupId: stimulusGroups.id
  })
    .from(stimulusGroupOptions)
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
    .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
    .where(and(
      eq(stimulusGroupOptions.id, optionId),
      eq(stimulusGroups.caseId, caseId),
      eq(cases.isActive, true),
      isNull(cases.previewSessionId),
      eq(stimulusGroups.isActive, true),
      eq(stimulusGroupOptions.isActive, true),
      eq(stimulusGroupOptions.removedFromCase, false),
      eq(assets.isActive, true),
      isNull(assets.previewSessionId)
    ))
    .limit(1))[0];
  if (!row) throw new AssetQuestionInputError('Choose an active production image from this Case.');
  return row;
}

/** @param {LearningDb} db @param {string} optionId */
async function requireProductionOptionIdentity(db, optionId) {
  const row = (await db.select({
    optionId: stimulusGroupOptions.id,
    assetId: stimulusGroupOptions.assetId,
    caseId: stimulusGroups.caseId
  })
    .from(stimulusGroupOptions)
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
    .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
    .where(and(
      eq(stimulusGroupOptions.id, optionId),
      isNull(cases.previewSessionId),
      isNull(assets.previewSessionId)
    ))
    .limit(1))[0];
  if (!row) throw new AssetQuestionInputError('The reusable image question usage is not attached to a production Case.');
  return row;
}

/** @param {LearningDb} db @param {string} caseId @param {string} promptId @param {string} groupId */
async function ensurePromptMayBeSpecificInGroup(db, caseId, promptId, groupId) {
  try {
    await ensurePromptIsNotUsedByAnotherGroup(db, caseId, promptId, groupId);
  } catch (error) {
    if (error instanceof StimulusGroupInputError) throw new AssetQuestionInputError(error.message);
    throw error;
  }
}

/**
 * Insert a reusable-question opt-in only if the option and Asset Question still
 * belong to the Asset captured by the request. The route precheck is useful for
 * UX, but this predicate is the write-side race fence.
 *
 * @param {LearningDb} db
 * @param {{ optionId: string, assetQuestionId: string, expectedAssetId: string }} input
 */
async function insertExpectedAssetQuestionOptIn(db, input) {
  const result = await db.$client.prepare(`
    INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id)
    SELECT ?, ?
    WHERE EXISTS (
      SELECT 1
      FROM stimulus_group_options option_row
      JOIN assets option_asset ON option_asset.id = option_row.asset_id
      JOIN asset_questions question_row ON question_row.id = ?
      WHERE option_row.id = ?
        AND option_row.asset_id = ?
        AND question_row.asset_id = ?
        AND option_asset.preview_session_id IS NULL
        AND option_asset.is_active = 1
        AND option_asset.superseded_by_asset_id IS NULL
        AND option_asset.deduplicated_into_asset_id IS NULL
    )
  `).bind(
    input.optionId,
    input.assetQuestionId,
    input.assetQuestionId,
    input.optionId,
    input.expectedAssetId,
    input.expectedAssetId
  ).run();
  if (Number(result?.meta?.changes ?? 0) !== 1) {
    throw new AssetQuestionInputError('The reusable image question usage moved to another Asset; refresh and try again.');
  }
}

/** @param {LearningDb} db @param {{ caseId: unknown, optionId: unknown, assetQuestionId: unknown, expectedAssetId?: unknown }} input */
export async function optInAssetQuestion(db, input) {
  const caseId = requiredText(input.caseId, 'Case');
  const optionId = requiredText(input.optionId, 'Stimulus option');
  const assetQuestionId = requiredText(input.assetQuestionId, 'Reusable image question');
  const expectedAssetId = String(input.expectedAssetId ?? '').trim();
  const option = await requireProductionOption(db, caseId, optionId);
  const question = (await db.select({ id: assetQuestions.id, assetId: assetQuestions.assetId, promptId: assetQuestions.questionPromptId, isActive: assetQuestions.isActive })
    .from(assetQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, assetQuestions.questionPromptId))
    .where(and(eq(assetQuestions.id, assetQuestionId), eq(assetQuestions.isActive, true), eq(questionPrompts.isActive, true), isNull(questionPrompts.previewSessionId)))
    .limit(1))[0];
  if (!question) throw new AssetQuestionInputError('The reusable image question is missing or inactive.');
  if (question.assetId !== option.assetId) throw new AssetQuestionInputError('The reusable image question belongs to a different Asset.');
  if (expectedAssetId && option.assetId !== expectedAssetId) throw new AssetQuestionInputError('The reusable image question usage moved to another Asset; refresh and try again.');
  await ensurePromptMayBeSpecificInGroup(db, caseId, question.promptId, option.stimulusGroupId);
  const existing = await db.select({ assetQuestionId: stimulusOptionAssetQuestions.assetQuestionId })
    .from(stimulusOptionAssetQuestions)
    .where(and(eq(stimulusOptionAssetQuestions.stimulusGroupOptionId, optionId), eq(stimulusOptionAssetQuestions.assetQuestionId, assetQuestionId)))
    .limit(1);
  if (existing[0]) return assetQuestionId;
  if (expectedAssetId) await insertExpectedAssetQuestionOptIn(db, { optionId, assetQuestionId, expectedAssetId });
  else await db.insert(stimulusOptionAssetQuestions).values({ stimulusGroupOptionId: optionId, assetQuestionId });
  await touchProductionCaseUpdatedAt(db, caseId);
  return assetQuestionId;
}

/**
 * @param {LearningDb} db
 * @param {{ optionId: unknown, assetQuestionId: unknown, caseId?: unknown, assetId?: unknown }} input
 */
export async function removeAssetQuestionOptIn(db, input) {
  const optionId = requiredText(input.optionId, 'Stimulus option');
  const assetQuestionId = requiredText(input.assetQuestionId, 'Reusable image question');
  const expectedCaseId = String(input.caseId ?? '').trim();
  const expectedAssetId = String(input.assetId ?? '').trim();
  const option = await requireProductionOptionIdentity(db, optionId);
  if (expectedCaseId && option.caseId !== expectedCaseId) {
    throw new AssetQuestionInputError('The selected reusable image question usage does not belong to this Case.');
  }
  if (expectedAssetId && option.assetId !== expectedAssetId) {
    throw new AssetQuestionInputError('The selected reusable image question usage belongs to a different Asset.');
  }
  const question = (await db.select({ assetId: assetQuestions.assetId })
    .from(assetQuestions)
    .innerJoin(assets, eq(assets.id, assetQuestions.assetId))
    .where(and(eq(assetQuestions.id, assetQuestionId), isNull(assets.previewSessionId)))
    .limit(1))[0];
  if (!question || question.assetId !== option.assetId) {
    throw new AssetQuestionInputError('The reusable image question does not belong to this stimulus Asset.');
  }
  const existing = await db.select({ assetQuestionId: stimulusOptionAssetQuestions.assetQuestionId })
    .from(stimulusOptionAssetQuestions)
    .where(and(
      eq(stimulusOptionAssetQuestions.stimulusGroupOptionId, optionId),
      eq(stimulusOptionAssetQuestions.assetQuestionId, assetQuestionId)
    ))
    .limit(1);
  if (!existing[0]) return false;
  const deleteConditions = [
    eq(stimulusOptionAssetQuestions.stimulusGroupOptionId, optionId),
    eq(stimulusOptionAssetQuestions.assetQuestionId, assetQuestionId)
  ];
  if (expectedAssetId) deleteConditions.push(sql`EXISTS (
    SELECT 1
    FROM stimulus_group_options current_option
    JOIN asset_questions current_question ON current_question.id = ${assetQuestionId}
    WHERE current_option.id = ${optionId}
      AND current_option.asset_id = ${expectedAssetId}
      AND current_question.asset_id = ${expectedAssetId}
  )`);
  const deleted = await db.delete(stimulusOptionAssetQuestions)
    .where(and(...deleteConditions))
    .returning({ assetQuestionId: stimulusOptionAssetQuestions.assetQuestionId });
  if (expectedAssetId && !deleted.length) throw new AssetQuestionInputError('The reusable image question usage moved to another Asset; refresh and try again.');
  await touchProductionCaseUpdatedAt(db, option.caseId);
  return true;
}

/** @param {LearningDb} db @param {{ assetQuestionId: unknown, answerMd: unknown, expectedAssetId?: unknown }} input */
export async function updateAssetQuestionAnswer(db, input) {
  const id = requiredText(input.assetQuestionId, 'Reusable image question');
  const answerMd = requiredText(input.answerMd, 'Question answer');
  const expectedAssetId = String(input.expectedAssetId ?? '').trim();
  const row = (await db.select({ id: assetQuestions.id, assetId: assetQuestions.assetId })
    .from(assetQuestions)
    .innerJoin(assets, eq(assets.id, assetQuestions.assetId))
    .where(and(eq(assetQuestions.id, id), isNull(assets.previewSessionId)))
    .limit(1))[0];
  if (!row) throw new AssetQuestionInputError('The reusable image question no longer exists.');
  const conditions = [eq(assetQuestions.id, id)];
  if (expectedAssetId) conditions.push(eq(assetQuestions.assetId, expectedAssetId));
  const updated = await db.update(assetQuestions)
    .set({ answerMd, updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: assetQuestions.id });
  if (expectedAssetId && !updated.length) throw new AssetQuestionInputError('The reusable image question moved to another Asset; refresh and try again.');
}

/** @param {LearningDb} db @param {{ assetQuestionId: unknown, isActive: boolean, expectedAssetId?: unknown }} input */
export async function setAssetQuestionActive(db, input) {
  const id = requiredText(input.assetQuestionId, 'Reusable image question');
  const expectedAssetId = String(input.expectedAssetId ?? '').trim();
  const row = (await db.select({
    id: assetQuestions.id,
    assetId: assetQuestions.assetId,
    promptId: assetQuestions.questionPromptId,
    isActive: assetQuestions.isActive
  })
    .from(assetQuestions)
    .innerJoin(assets, eq(assets.id, assetQuestions.assetId))
    .where(and(eq(assetQuestions.id, id), isNull(assets.previewSessionId)))
    .limit(1))[0];
  if (!row) throw new AssetQuestionInputError('The reusable image question no longer exists.');
  if (expectedAssetId && row.assetId !== expectedAssetId) throw new AssetQuestionInputError('The reusable image question moved to another Asset; refresh and try again.');

  if (input.isActive && !row.isActive) {
    await validateAssetQuestionActivation(db, id, row.promptId);
  }

  const conditions = [eq(assetQuestions.id, id)];
  if (expectedAssetId) conditions.push(eq(assetQuestions.assetId, expectedAssetId));
  const updated = await db.update(assetQuestions)
    .set({ isActive: input.isActive, updatedAt: new Date() })
    .where(and(...conditions))
    .returning({ id: assetQuestions.id });
  if (expectedAssetId && !updated.length) throw new AssetQuestionInputError('The reusable image question moved to another Asset; refresh and try again.');
}

/** @param {string | null | undefined} filename @param {string} assetId */
function automaticGroupName(filename, assetId) {
  const cleaned = String(filename ?? '').trim().replace(/\.(png|jpe?g)$/i, '');
  return `Image-specific — ${cleaned || assetId.slice(0, 8)}`;
}

/**
 * Convert one fixed production Case Asset to the established one-option group,
 * assign the source Option explicitly as Original, then opt that Option into an
 * existing reusable Asset Question. Preflight is complete before any
 * destructive relationship write.
 *
 * @param {LearningDb} db
 * @param {{ caseId: unknown, assetId: unknown, assetQuestionId: unknown }} input
 */
export async function optInFixedAssetQuestion(db, input) {
  if (typeof db.batch !== 'function') throw new AssetQuestionInputError('Atomic fixed-image conversion requires D1 batch support.');
  const caseId = requiredText(input.caseId, 'Case');
  const assetId = requiredText(input.assetId, 'Asset');
  const assetQuestionId = requiredText(input.assetQuestionId, 'Reusable image question');
  const fixed = (await db.select({
    captionMd: caseAssets.captionMd,
    originalFilename: assets.originalFilename
  })
    .from(caseAssets)
    .innerJoin(cases, eq(cases.id, caseAssets.caseId))
    .innerJoin(assets, eq(assets.id, caseAssets.assetId))
    .where(and(
      eq(caseAssets.caseId, caseId),
      eq(caseAssets.assetId, assetId),
      eq(cases.isActive, true),
      isNull(cases.previewSessionId),
      eq(assets.isActive, true),
      isNull(assets.previewSessionId)
    ))
    .limit(1))[0];
  if (!fixed) throw new AssetQuestionInputError('Choose an active fixed production image from this Case.');
  const question = (await db.select({ id: assetQuestions.id, assetId: assetQuestions.assetId, promptId: assetQuestions.questionPromptId })
    .from(assetQuestions)
    .innerJoin(questionPrompts, eq(questionPrompts.id, assetQuestions.questionPromptId))
    .where(and(eq(assetQuestions.id, assetQuestionId), eq(assetQuestions.isActive, true), eq(questionPrompts.isActive, true), isNull(questionPrompts.previewSessionId)))
    .limit(1))[0];
  if (!question || question.assetId !== assetId) throw new AssetQuestionInputError('The reusable image question does not belong to this fixed Asset.');
  const duplicate = await db.select({ id: stimulusGroupOptions.id })
    .from(stimulusGroupOptions)
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusGroupOptions.assetId, assetId)))
    .limit(1);
  if (duplicate[0]) throw new AssetQuestionInputError('That image is already used as an alternative stimulus in this Case.');
  const lastGroup = (await db.select({ displayOrder: stimulusGroups.displayOrder }).from(stimulusGroups).where(eq(stimulusGroups.caseId, caseId)).orderBy(desc(stimulusGroups.displayOrder)).limit(1))[0];
  const remaining = (await db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(eq(caseAssets.caseId, caseId)).orderBy(asc(caseAssets.displayOrder))).filter((row) => row.assetId !== assetId);
  const groupId = crypto.randomUUID();
  const optionId = crypto.randomUUID();
  await ensurePromptMayBeSpecificInGroup(db, caseId, question.promptId, groupId);
  const updatedAt = new Date();
  const writes = [
    productionAssetWriteFence(db, assetId),
    db.insert(stimulusGroups).values({ id: groupId, caseId, name: automaticGroupName(fixed.originalFilename, assetId), displayOrder: (lastGroup?.displayOrder ?? -1) + 1, selectionCount: 1, specificQuestionMode: 'none', minimumSpecificQuestions: null, isActive: true }),
    db.insert(stimulusGroupOptions).values({ id: optionId, stimulusGroupId: groupId, assetId, displayOrder: 0, captionMd: fixed.captionMd, isActive: true }),
    db.update(stimulusGroups).set({ originalOptionId: optionId, updatedAt }).where(eq(stimulusGroups.id, groupId)),
    db.insert(stimulusOptionAssetQuestions).values({ stimulusGroupOptionId: optionId, assetQuestionId }),
    db.delete(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId))),
    ...remaining.map((row, index) => db.update(caseAssets).set({ displayOrder: index }).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, row.assetId)))),
    productionCaseTimestampWrite(db, caseId, updatedAt)
  ];
  await runAssetQuestionBatch(db, /** @type {[any, ...any[]]} */ (writes));
  return optionId;
}
