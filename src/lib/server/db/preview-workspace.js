import { and, asc, desc, eq, inArray, isNull, like, notInArray, or } from 'drizzle-orm';

import { getTeachingImageUrl, putTeachingImage, deleteTeachingImage, assertSupportedImageType } from '../storage/media.js';
import { listAdminConcepts, listCaseTopics } from './admin-content.js';
import { listPreviewCaseTags } from './case-tag-read.ts';
import {
  assets,
  caseAssets,
  caseConcepts,
  caseQuestions,
  cases,
  concepts,
  conceptQuestions,
  previewSessions,
  questionPrompts,
  reviewAssets,
  reviews,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups,
  stimulusOptionQuestions
} from './schema.js';
import { caseQuestionTags, caseTags } from './tag-schema.js';
import {
  addPreviewSecondaryTopic as addPreviewSecondaryTopicCase,
  cloneCaseToPreview as cloneCaseToPreviewCase,
  listPreviewCases as listPreviewCasesCase,
  listProductionCasesForPreview as listProductionCasesForPreviewCase,
  promotePreviewTopic as promotePreviewTopicCase,
  removePreviewSecondaryTopic as removePreviewSecondaryTopicCase,
  updatePreviewCase as updatePreviewCaseCase,
  updatePreviewCaseVignette as updatePreviewCaseVignetteCase
} from './preview-workspace/case.js';
import { PreviewWorkspaceError } from './preview-workspace/errors.js';
import {
  attachPreviewAsset as attachPreviewAssetFixedImage,
  attachPreviewAssetsToCase as attachPreviewAssetsToCaseFixedImages,
  detachPreviewAsset as detachPreviewAssetFixedImage,
  listPreviewFixedCaseAssets,
  movePreviewCaseAsset as movePreviewCaseAssetFixedImage,
  updatePreviewAssetCaption as updatePreviewAssetCaptionFixedImage
} from './preview-workspace/fixed-images.js';
import { booleanValue, optionalHttpUrl, optionalText, requiredText, timeMs } from './preview-workspace/input.js';
import {
  requireOwnedPreviewCase,
  requireOwnedPreviewGroup,
  requireOwnedPreviewOption,
  requireOwnedPreviewPrompt,
  requireOwnedSession,
  requirePreviewUsableAsset
} from './preview-workspace/ownership.js';
import { PREVIEW_SESSION_TTL_MS, createPreviewSession, getLivePreviewSession } from './preview-workspace/session.js';

export { PreviewWorkspaceError } from './preview-workspace/errors.js';
export { requireOwnedPreviewCase } from './preview-workspace/ownership.js';
export { PREVIEW_SESSION_TTL_MS, createPreviewSession, getLivePreviewSession } from './preview-workspace/session.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export const PREVIEW_IMAGE_PICKER_LIMIT = 60;
export const PREVIEW_IMAGE_BULK_LIMIT = 30;

function newId() {
  return crypto.randomUUID();
}

/** @param {string} mimeType */
function extensionForType(mimeType) {
  return mimeType === 'image/png' ? 'png' : 'jpg';
}

/**
 * Expired and cleanup-required sessions are cleaned before a new workspace is created.
 * A cleanup failure blocks creation of another workspace for that user.
 *
 * @param {{ db: LearningDb, bucket: R2Bucket, userId: string, now?: number }} input
 */
export async function ensurePreviewWorkspace({ db, bucket, userId, now = Date.now() }) {
  const existing = await getLivePreviewSession(db, userId);
  if (!existing) return createPreviewSession(db, userId, now);
  if (existing.status === 'active' && timeMs(existing.expiresAt) > now) return existing;

  if (existing.status === 'active') {
    await db
      .update(previewSessions)
      .set({ status: 'cleanup_required', updatedAt: new Date() })
      .where(and(eq(previewSessions.id, existing.id), eq(previewSessions.userId, userId)));
  }
  await cleanupPreviewWorkspace({ db, bucket, previewSessionId: existing.id, userId });
  return createPreviewSession(db, userId, now);
}

/**
 * Search shared production Assets and Assets owned by this Preview Session.
 * Relationship state is intentionally excluded from the Asset itself; callers
 * can only use the returned IDs through the Preview-owned mutation helpers.
 *
 * @param {LearningDb} db
 * @param {string} previewSessionId
 * @param {string} caseId
 * @param {{ search?: string, limit?: number }} [options]
 */
export async function listPreviewCaseImagePicker(db, previewSessionId, caseId, options = {}) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  const limit = Math.max(1, Math.min(Number(options.limit ?? PREVIEW_IMAGE_PICKER_LIMIT), PREVIEW_IMAGE_PICKER_LIMIT));
  const search = String(options.search ?? '').trim();
  const [fixedRows, groupedRows] = await Promise.all([
    db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(eq(caseAssets.caseId, caseId)),
    db
      .select({ assetId: stimulusGroupOptions.assetId })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .where(eq(stimulusGroups.caseId, caseId))
  ]);
  const usedIds = [...new Set([...fixedRows, ...groupedRows].map((row) => row.assetId))];
  const conditions = [
    eq(assets.isActive, true),
    eq(assets.type, 'image'),
    or(isNull(assets.previewSessionId), eq(assets.previewSessionId, previewSessionId))
  ];
  if (usedIds.length) conditions.push(notInArray(assets.id, usedIds));
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(
      like(assets.originalFilename, pattern),
      like(assets.altText, pattern),
      like(assets.sourceLabel, pattern),
      like(assets.sourceUrl, pattern)
    ));
  }
  const rows = await db
    .select({
      id: assets.id,
      originalFilename: assets.originalFilename,
      altText: assets.altText,
      sourceLabel: assets.sourceLabel,
      sourceUrl: assets.sourceUrl,
      licence: assets.licence,
      mimeType: assets.mimeType,
      previewSessionId: assets.previewSessionId,
      createdAt: assets.createdAt
    })
    .from(assets)
    .where(and(...conditions))
    .orderBy(desc(assets.createdAt), desc(assets.id))
    .limit(limit + 1);
  return {
    assets: rows.slice(0, limit).map((asset) => ({ ...asset, imageUrl: getTeachingImageUrl(asset.id) })),
    hasMore: rows.length > limit,
    limit,
    search
  };
}

/** @param {unknown[]} values */
function boundedPreviewAssetIds(values) {
  const ids = [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
  if (!ids.length) throw new PreviewWorkspaceError('Select at least one image.', 'INVALID_INPUT');
  if (ids.length > PREVIEW_IMAGE_BULK_LIMIT) {
    throw new PreviewWorkspaceError(`A single Preview image action is limited to ${PREVIEW_IMAGE_BULK_LIMIT} Assets.`, 'INVALID_INPUT');
  }
  return ids;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} groupId */
export async function validatePreviewStimulusGroupTarget(db, previewSessionId, groupId) {
  const group = await requireOwnedPreviewGroup(db, previewSessionId, groupId);
  const caseRow = (
    await db
      .select({ id: cases.id, isActive: cases.isActive })
      .from(cases)
      .where(and(eq(cases.id, group.caseId), eq(cases.previewSessionId, previewSessionId)))
      .limit(1)
  )[0];
  if (!caseRow?.isActive) throw new PreviewWorkspaceError('The selected Preview Case is inactive.', 'INVALID_INPUT');
  if (!group.isActive) throw new PreviewWorkspaceError('The selected Preview alternative set is inactive.', 'INVALID_INPUT');
  if (group.specificQuestionMode === 'minimum') {
    const groupQuestions = await db
      .select({ id: stimulusGroupQuestions.id })
      .from(stimulusGroupQuestions)
      .where(and(eq(stimulusGroupQuestions.stimulusGroupId, group.id), eq(stimulusGroupQuestions.isActive, true)));
    const minimum = group.minimumSpecificQuestions ?? 0;
    if (groupQuestions.length < minimum) {
      throw new PreviewWorkspaceError(
        `New images would have only ${groupQuestions.length} set-wide specific questions, below this Preview set's minimum of ${minimum}. Add set-wide questions or change coverage first.`,
        'INVALID_INPUT'
      );
    }
  }
  return group;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {unknown[]} assetIds */
export async function attachPreviewAssetsToCase(db, previewSessionId, caseId, assetIds) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  return attachPreviewAssetsToCaseFixedImages(db, previewSessionId, caseId, boundedPreviewAssetIds(assetIds));
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} groupId @param {unknown[]} assetIds */
export async function addPreviewAssetsToStimulusGroup(db, previewSessionId, groupId, assetIds) {
  const group = await validatePreviewStimulusGroupTarget(db, previewSessionId, groupId);
  const ids = boundedPreviewAssetIds(assetIds);
  for (const assetId of ids) await requirePreviewUsableAsset(db, previewSessionId, assetId);
  const [fixedRows, optionRows] = await Promise.all([
    db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), inArray(caseAssets.assetId, ids))),
    db
      .select({ assetId: stimulusGroupOptions.assetId, groupId: stimulusGroupOptions.stimulusGroupId, isActive: stimulusGroupOptions.isActive })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .where(and(eq(stimulusGroups.caseId, group.caseId), inArray(stimulusGroupOptions.assetId, ids)))
  ]);
  if (fixedRows.length) throw new PreviewWorkspaceError('One or more selected images are fixed images in this Preview Case.', 'INVALID_INPUT');
  const byAsset = new Map(optionRows.map((row) => [row.assetId, row]));
  for (const assetId of ids) {
    const existing = byAsset.get(assetId);
    if (existing && existing.groupId !== groupId) throw new PreviewWorkspaceError('One or more selected images belong to another alternative set in this Preview Case.', 'INVALID_INPUT');
    if (existing && !existing.isActive) throw new PreviewWorkspaceError('One or more selected images are inactive in this Preview alternative set.', 'INVALID_INPUT');
  }
  const newIds = ids.filter((id) => !byAsset.has(id));
  if (!newIds.length) return { addedCount: 0, alreadyPresentCount: ids.length, caseId: group.caseId };
  const last = (await db.select({ displayOrder: stimulusGroupOptions.displayOrder }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.stimulusGroupId, groupId)).orderBy(desc(stimulusGroupOptions.displayOrder)).limit(1))[0];
  const startOrder = (last?.displayOrder ?? -1) + 1;
  const writes = newIds.map((assetId, index) => db.insert(stimulusGroupOptions).values({ id: newId(), stimulusGroupId: groupId, assetId, displayOrder: startOrder + index, captionMd: null, isActive: true }));
  if (typeof db.batch === 'function') await db.batch(/** @type {[any, ...any[]]} */ (writes));
  else for (const write of writes) await write;
  return { addedCount: newIds.length, alreadyPresentCount: ids.length - newIds.length, caseId: group.caseId };
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} optionId @param {unknown} captionMd */
export async function updatePreviewStimulusOptionCaption(db, previewSessionId, caseId, optionId, captionMd) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  const option = await requireOwnedPreviewOption(db, previewSessionId, optionId);
  if (option.caseId !== caseId) throw new PreviewWorkspaceError('That alternative image does not belong to this Preview Case.', 'NOT_OWNED');
  await db.update(stimulusGroupOptions).set({ captionMd: optionalText(captionMd) }).where(eq(stimulusGroupOptions.id, optionId));
}

/** @param {LearningDb} db @param {string} [search] */
export async function listProductionCasesForPreview(db, search = '') {
  return listProductionCasesForPreviewCase(db, search);
}

/** @param {LearningDb} db @param {{ previewSessionId: string, userId: string, sourceCaseId: string }} input */
export async function cloneCaseToPreview(db, input) {
  return cloneCaseToPreviewCase(db, input);
}

/** @param {LearningDb} db @param {string} previewSessionId */
export async function listPreviewCases(db, previewSessionId) {
  return listPreviewCasesCase(db, previewSessionId);
}

/**
 * Load the data shape used by the existing Admin Case editor. The Preview route renders
 * the production component, but every form is handled by the Preview-owned actions below.
 *
 * @param {LearningDb} db
 * @param {string} previewSessionId
 * @param {string} caseId
 * @param {{ imagePickerOpen?: boolean, imagePickerSearch?: string, targetGroupId?: string | null }} [options]
 */
export async function loadPreviewCaseEditor(db, previewSessionId, caseId, options = {}) {
  const selected = await requireOwnedPreviewCase(db, previewSessionId, caseId);
  const [allConcepts, topicRows, caseTagsForEditor, fixedRows, questionRows, groupRows, ownCases] = await Promise.all([
    listAdminConcepts(db),
    listCaseTopics(db, caseId),
    listPreviewCaseTags(db, previewSessionId, caseId),
    listPreviewFixedCaseAssets(db, caseId),
    db
      .select({
        caseId: caseQuestions.caseId,
        questionPromptId: caseQuestions.questionPromptId,
        promptMd: questionPrompts.promptMd,
        answerMd: caseQuestions.answerMd,
        createdAt: caseQuestions.createdAt,
        isActive: caseQuestions.isActive
      })
      .from(caseQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, caseQuestions.questionPromptId))
      .where(and(eq(caseQuestions.caseId, caseId), eq(questionPrompts.previewSessionId, previewSessionId)))
      .orderBy(asc(caseQuestions.createdAt), asc(caseQuestions.questionPromptId)),
    db.select().from(stimulusGroups).where(eq(stimulusGroups.caseId, caseId)).orderBy(asc(stimulusGroups.displayOrder)),
    listPreviewCases(db, previewSessionId)
  ]);

  const groupIds = groupRows.map((row) => row.id);
  const optionRows = groupIds.length
    ? await db
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
        .orderBy(asc(stimulusGroupOptions.displayOrder))
    : [];
  const groupQuestionRows = groupIds.length
    ? await db
        .select({
          id: stimulusGroupQuestions.id,
          stimulusGroupId: stimulusGroupQuestions.stimulusGroupId,
          questionPromptId: stimulusGroupQuestions.questionPromptId,
          promptMd: questionPrompts.promptMd,
          answerMd: stimulusGroupQuestions.answerMd,
          isActive: stimulusGroupQuestions.isActive
        })
        .from(stimulusGroupQuestions)
        .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusGroupQuestions.questionPromptId))
        .where(and(inArray(stimulusGroupQuestions.stimulusGroupId, groupIds), eq(questionPrompts.previewSessionId, previewSessionId)))
        .orderBy(asc(stimulusGroupQuestions.createdAt))
    : [];
  const optionIds = optionRows.map((row) => row.id);
  const optionQuestionRows = optionIds.length
    ? await db
        .select({
          id: stimulusOptionQuestions.id,
          stimulusGroupOptionId: stimulusOptionQuestions.stimulusGroupOptionId,
          questionPromptId: stimulusOptionQuestions.questionPromptId,
          promptMd: questionPrompts.promptMd,
          answerMd: stimulusOptionQuestions.answerMd,
          isActive: stimulusOptionQuestions.isActive
        })
        .from(stimulusOptionQuestions)
        .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusOptionQuestions.questionPromptId))
        .where(and(inArray(stimulusOptionQuestions.stimulusGroupOptionId, optionIds), eq(questionPrompts.previewSessionId, previewSessionId)))
        .orderBy(asc(stimulusOptionQuestions.createdAt))
    : [];

  const attachedIds = new Set(fixedRows.map((row) => row.assetId));
  const groupedIds = new Set(optionRows.map((row) => row.assetId));
  const availableRows = await db
    .select({
      assetId: assets.id,
      assetType: assets.type,
      storageKey: assets.storageKey,
      mimeType: assets.mimeType,
      originalFilename: assets.originalFilename,
      altText: assets.altText,
      sourceLabel: assets.sourceLabel,
      sourceUrl: assets.sourceUrl,
      licence: assets.licence,
      isActive: assets.isActive,
      previewSessionId: assets.previewSessionId
    })
    .from(assets)
    .where(and(eq(assets.isActive, true), or(isNull(assets.previewSessionId), eq(assets.previewSessionId, previewSessionId))))
    .orderBy(desc(assets.createdAt));
  const available = availableRows.filter((row) => !attachedIds.has(row.assetId) && !groupedIds.has(row.assetId));
  const primaryTopic = topicRows.find((row) => row.role === 'primary');
  const groups = groupRows.map((group) => ({
    ...group,
    options: optionRows
      .filter((option) => option.stimulusGroupId === group.id)
      .map((option) => ({
        ...option,
        imageUrl: option.assetIsActive ? getTeachingImageUrl(option.assetId) : null
      })),
    questions: groupQuestionRows
      .filter((question) => question.stimulusGroupId === group.id)
      .map((question) => ({ ...question, scope: 'group' })),
    optionQuestions: optionQuestionRows
      .filter((question) => optionRows.find((option) => option.id === question.stimulusGroupOptionId)?.stimulusGroupId === group.id)
      .map((question) => ({ ...question, scope: 'option' }))
  }));
  const targetGroup = groupRows.find((group) => group.id === String(options.targetGroupId ?? '').trim() && group.isActive) ?? null;
  if (options.targetGroupId && !targetGroup) {
    throw new PreviewWorkspaceError('The selected Preview alternative set is missing, inactive, or not owned by this workspace.', 'NOT_OWNED');
  }
  const pickerResults = options.imagePickerOpen
    ? await listPreviewCaseImagePicker(db, previewSessionId, caseId, { search: options.imagePickerSearch })
    : { assets: [], hasMore: false, limit: PREVIEW_IMAGE_PICKER_LIMIT, search: String(options.imagePickerSearch ?? '').trim() };

  return {
    assets: availableRows.map((asset) => ({
      ...asset,
      id: asset.assetId,
      imageUrl: asset.isActive ? getTeachingImageUrl(asset.assetId) : null
    })),
    concepts: allConcepts,
    systems: [],
    status: null,
    removedQuestionPromptId: null,
    selectedConceptId: primaryTopic?.id ?? null,
    cases: ownCases,
    questionCount: questionRows.length,
    previewMode: true,
    selectedCase: {
      case: {
        id: selected.id,
        title: selected.title,
        vignetteMd: selected.vignetteMd,
        questionSelectionMode: selected.questionSelectionMode,
        questionCount: selected.questionCount,
        isActive: selected.isActive,
        conceptId: primaryTopic?.id ?? null,
        conceptName: primaryTopic?.name ?? null,
        previewSessionId
      },
      topics: topicRows,
      caseTags: caseTagsForEditor,
      questions: questionRows.map((row) => ({ ...row, reusableForTopic: false })),
      attached: fixedRows.map((row) => ({
        ...row,
        imageUrl: row.isActive ? getTeachingImageUrl(row.assetId) : null
      })),
      available: available.map((row) => ({ ...row, imageUrl: getTeachingImageUrl(row.assetId) })),
      stimulusGroups: groups,
      previewCopy: true
    },
    imagePicker: {
      open: Boolean(options.imagePickerOpen),
      ...pickerResults,
      targetGroupId: targetGroup?.id ?? null,
      targetGroupName: targetGroup?.name ?? null
    }
  };
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {Record<string, unknown>} input */
export async function updatePreviewCase(db, previewSessionId, caseId, input) {
  return updatePreviewCaseCase(db, previewSessionId, caseId, input);
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string | null} vignetteMd */
export async function updatePreviewCaseVignette(db, previewSessionId, caseId, vignetteMd) {
  return updatePreviewCaseVignetteCase(db, previewSessionId, caseId, vignetteMd);
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} conceptId */
export async function addPreviewSecondaryTopic(db, previewSessionId, caseId, conceptId) {
  return addPreviewSecondaryTopicCase(db, previewSessionId, caseId, conceptId);
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} conceptId */
export async function removePreviewSecondaryTopic(db, previewSessionId, caseId, conceptId) {
  return removePreviewSecondaryTopicCase(db, previewSessionId, caseId, conceptId);
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} conceptId @param {{ allowInsert?: boolean }} [options] */
export async function promotePreviewTopic(db, previewSessionId, caseId, conceptId, options = {}) {
  return promotePreviewTopicCase(db, previewSessionId, caseId, conceptId, options);
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} promptMd */
async function createPreviewPrompt(db, previewSessionId, promptMd) {
  const id = newId();
  await db.insert(questionPrompts).values({
    id,
    promptMd: requiredText(promptMd, 'Question prompt'),
    previewSessionId,
    isActive: true
  });
  return id;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {{ originalPromptId?: string | null, promptMd: string, answerMd: string, reusableForTopic?: unknown }} input */
export async function savePreviewCaseQuestion(db, previewSessionId, caseId, input) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  if (booleanValue(input.reusableForTopic)) {
    throw new PreviewWorkspaceError('Reusable Topic questions are read-only in Preview Mode.', 'GLOBAL_WRITE_BLOCKED');
  }
  const answerMd = requiredText(input.answerMd, 'Question answer');
  const originalPromptId = optionalText(input.originalPromptId);
  if (originalPromptId) {
    await requireOwnedPreviewPrompt(db, previewSessionId, originalPromptId);
    const relation = (
      await db
        .select({ id: caseQuestions.id })
        .from(caseQuestions)
        .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, originalPromptId)))
        .limit(1)
    )[0];
    if (!relation) throw new PreviewWorkspaceError('That Preview Case question no longer exists.', 'INVALID_INPUT');
    await db
      .update(questionPrompts)
      .set({ promptMd: requiredText(input.promptMd, 'Question prompt'), updatedAt: new Date() })
      .where(and(eq(questionPrompts.id, originalPromptId), eq(questionPrompts.previewSessionId, previewSessionId)));
    await db.update(caseQuestions).set({ answerMd, isActive: true, updatedAt: new Date() }).where(eq(caseQuestions.id, relation.id));
    return originalPromptId;
  }
  const promptId = await createPreviewPrompt(db, previewSessionId, input.promptMd);
  const latest = (
    await db.select({ createdAt: caseQuestions.createdAt }).from(caseQuestions).where(eq(caseQuestions.caseId, caseId)).orderBy(desc(caseQuestions.createdAt)).limit(1)
  )[0];
  const base = Math.max(Date.now(), timeMs(latest?.createdAt) + 1);
  await db.insert(caseQuestions).values({
    id: newId(),
    caseId,
    questionPromptId: promptId,
    answerMd,
    isActive: true,
    createdAt: new Date(base)
  });
  return promptId;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} promptId */
export async function removePreviewCaseQuestion(db, previewSessionId, caseId, promptId) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  await requireOwnedPreviewPrompt(db, previewSessionId, promptId);
  const row = (
    await db
      .select({ id: caseQuestions.id })
      .from(caseQuestions)
      .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, promptId)))
      .limit(1)
  )[0];
  if (!row) throw new PreviewWorkspaceError('That Preview Case question no longer exists.', 'INVALID_INPUT');
  await db.update(caseQuestions).set({ isActive: false, updatedAt: new Date() }).where(eq(caseQuestions.id, row.id));
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} promptId */
export async function restorePreviewCaseQuestion(db, previewSessionId, caseId, promptId) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  await requireOwnedPreviewPrompt(db, previewSessionId, promptId);
  const row = (
    await db
      .select({ id: caseQuestions.id })
      .from(caseQuestions)
      .where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, promptId), eq(caseQuestions.isActive, false)))
      .limit(1)
  )[0];
  if (!row) throw new PreviewWorkspaceError('That removed Preview Case question is no longer available to restore.', 'INVALID_INPUT');
  await db.update(caseQuestions).set({ isActive: true, updatedAt: new Date() }).where(eq(caseQuestions.id, row.id));
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} promptId @param {'up'|'down'} direction */
export async function movePreviewCaseQuestion(db, previewSessionId, caseId, promptId, direction) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  await requireOwnedPreviewPrompt(db, previewSessionId, promptId);
  const rows = await db
    .select({ id: caseQuestions.id, promptId: caseQuestions.questionPromptId })
    .from(caseQuestions)
    .where(eq(caseQuestions.caseId, caseId))
    .orderBy(asc(caseQuestions.createdAt), asc(caseQuestions.id));
  const index = rows.findIndex((row) => row.promptId === promptId);
  const next = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : -1;
  if (index < 0 || next < 0 || next >= rows.length) return false;
  [rows[index], rows[next]] = [rows[next], rows[index]];
  const base = Date.now();
  for (const [i, row] of rows.entries()) {
    await db.update(caseQuestions).set({ createdAt: new Date(base + i), updatedAt: new Date() }).where(eq(caseQuestions.id, row.id));
  }
  return true;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {{ name: string, specificQuestionMode?: string, minimumSpecificQuestions?: unknown }} input */
export async function createPreviewStimulusGroup(db, previewSessionId, caseId, input) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  const mode = String(input.specificQuestionMode || 'none');
  if (!['none', 'minimum', 'all'].includes(mode)) {
    throw new PreviewWorkspaceError('Specific-question coverage is invalid.', 'INVALID_INPUT');
  }
  let minimum = null;
  if (mode === 'minimum') {
    const parsedMinimum = Number(input.minimumSpecificQuestions);
    if (!Number.isInteger(parsedMinimum) || parsedMinimum < 1) {
      throw new PreviewWorkspaceError('Minimum specific questions must be a positive integer.', 'INVALID_INPUT');
    }
    minimum = parsedMinimum;
  }
  const last = (
    await db.select({ displayOrder: stimulusGroups.displayOrder }).from(stimulusGroups).where(eq(stimulusGroups.caseId, caseId)).orderBy(desc(stimulusGroups.displayOrder)).limit(1)
  )[0];
  const id = newId();
  await db.insert(stimulusGroups).values({
    id,
    caseId,
    name: requiredText(input.name, 'Alternative set name'),
    displayOrder: (last?.displayOrder ?? -1) + 1,
    selectionCount: 1,
    specificQuestionMode: mode,
    minimumSpecificQuestions: minimum,
    isActive: true
  });
  return id;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} assetId @param {string} name */
export async function startPreviewAlternativeSet(db, previewSessionId, caseId, assetId, name) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  const fixed = (
    await db
      .select({ assetId: caseAssets.assetId })
      .from(caseAssets)
      .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)))
      .limit(1)
  )[0];
  if (!fixed) throw new PreviewWorkspaceError('Choose a fixed image from this Preview Case.', 'INVALID_INPUT');
  const groupId = await createPreviewStimulusGroup(db, previewSessionId, caseId, {
    name,
    specificQuestionMode: 'none'
  });
  try {
    await convertPreviewFixedAssetToOption(db, previewSessionId, groupId, assetId);
    return groupId;
  } catch (error) {
    await db.delete(stimulusGroups).where(and(eq(stimulusGroups.id, groupId), eq(stimulusGroups.caseId, caseId))).catch(() => {});
    throw error;
  }
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} groupId @param {Record<string, unknown>} input */
export async function updatePreviewStimulusGroup(db, previewSessionId, groupId, input) {
  await requireOwnedPreviewGroup(db, previewSessionId, groupId);
  const mode = String(input.specificQuestionMode || 'none');
  if (!['none', 'minimum', 'all'].includes(mode)) {
    throw new PreviewWorkspaceError('Specific-question coverage is invalid.', 'INVALID_INPUT');
  }
  let minimum = null;
  if (mode === 'minimum') {
    const parsedMinimum = Number(input.minimumSpecificQuestions);
    if (!Number.isInteger(parsedMinimum) || parsedMinimum < 1) {
      throw new PreviewWorkspaceError('Minimum specific questions must be a positive integer.', 'INVALID_INPUT');
    }
    minimum = parsedMinimum;
  }
  await db
    .update(stimulusGroups)
    .set({
      name: requiredText(input.name, 'Alternative set name'),
      specificQuestionMode: mode,
      minimumSpecificQuestions: minimum,
      isActive: booleanValue(input.isActive),
      updatedAt: new Date()
    })
    .where(eq(stimulusGroups.id, groupId));
}

/** @param {LearningDb} db @param {string} groupId */
async function nextOptionOrder(db, groupId) {
  const last = (
    await db.select({ displayOrder: stimulusGroupOptions.displayOrder }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.stimulusGroupId, groupId)).orderBy(desc(stimulusGroupOptions.displayOrder)).limit(1)
  )[0];
  return (last?.displayOrder ?? -1) + 1;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} groupId @param {string} assetId @param {string | null} [captionMd] */
export async function addPreviewStimulusOption(db, previewSessionId, groupId, assetId, captionMd = null) {
  const group = await requireOwnedPreviewGroup(db, previewSessionId, groupId);
  await requirePreviewUsableAsset(db, previewSessionId, assetId);
  const duplicate = (
    await db
      .select({ id: stimulusGroupOptions.id })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .where(and(eq(stimulusGroups.caseId, group.caseId), eq(stimulusGroupOptions.assetId, assetId)))
      .limit(1)
  )[0];
  const fixed = (
    await db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId))).limit(1)
  )[0];
  if (duplicate || fixed) {
    throw new PreviewWorkspaceError('That image is already used in this Preview Case.', 'INVALID_INPUT');
  }
  await db.insert(stimulusGroupOptions).values({
    id: newId(),
    stimulusGroupId: groupId,
    assetId,
    displayOrder: await nextOptionOrder(db, groupId),
    captionMd: optionalText(captionMd),
    isActive: true
  });
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} groupId @param {string} assetId */
export async function convertPreviewFixedAssetToOption(db, previewSessionId, groupId, assetId) {
  const group = await requireOwnedPreviewGroup(db, previewSessionId, groupId);
  await requirePreviewUsableAsset(db, previewSessionId, assetId);
  const fixed = (
    await db.select().from(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId))).limit(1)
  )[0];
  if (!fixed) throw new PreviewWorkspaceError('Choose a fixed image from this Preview Case.', 'INVALID_INPUT');
  const duplicate = (
    await db
      .select({ id: stimulusGroupOptions.id })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .where(and(eq(stimulusGroups.caseId, group.caseId), eq(stimulusGroupOptions.assetId, assetId)))
      .limit(1)
  )[0];
  if (duplicate) throw new PreviewWorkspaceError('That image is already used as an alternative in this Preview Case.', 'INVALID_INPUT');
  const remaining = (
    await db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(eq(caseAssets.caseId, group.caseId)).orderBy(asc(caseAssets.displayOrder))
  ).filter((row) => row.assetId !== assetId);
  const optionId = newId();
  const writes = [
    db.insert(stimulusGroupOptions).values({
      id: optionId,
      stimulusGroupId: groupId,
      assetId,
      displayOrder: await nextOptionOrder(db, groupId),
      captionMd: optionalText(fixed.captionMd),
      isActive: true
    }),
    db.delete(caseAssets).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, assetId))),
    ...remaining.map((row, index) =>
      db.update(caseAssets).set({ displayOrder: index }).where(and(eq(caseAssets.caseId, group.caseId), eq(caseAssets.assetId, row.assetId)))
    )
  ];
  if (typeof db.batch === 'function') await db.batch(/** @type {[any, ...any[]]} */ (writes));
  else for (const write of writes) await write;
  return optionId;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} optionId @param {boolean} active */
export async function setPreviewStimulusOptionActive(db, previewSessionId, optionId, active) {
  await requireOwnedPreviewOption(db, previewSessionId, optionId);
  await db.update(stimulusGroupOptions).set({ isActive: Boolean(active) }).where(eq(stimulusGroupOptions.id, optionId));
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} groupId @param {string} optionId @param {'up'|'down'} direction */
export async function movePreviewStimulusOption(db, previewSessionId, groupId, optionId, direction) {
  const group = await requireOwnedPreviewGroup(db, previewSessionId, groupId);
  const option = await requireOwnedPreviewOption(db, previewSessionId, optionId);
  if (option.groupId !== group.id) throw new PreviewWorkspaceError('That option does not belong to this alternative set.', 'NOT_OWNED');
  const rows = await db
    .select({ id: stimulusGroupOptions.id })
    .from(stimulusGroupOptions)
    .where(eq(stimulusGroupOptions.stimulusGroupId, groupId))
    .orderBy(asc(stimulusGroupOptions.displayOrder), asc(stimulusGroupOptions.id));
  const index = rows.findIndex((row) => row.id === optionId);
  const next = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : -1;
  if (index < 0 || next < 0 || next >= rows.length) return false;
  [rows[index], rows[next]] = [rows[next], rows[index]];
  const offset = rows.length + 1000;
  for (const [i, row] of rows.entries()) {
    await db.update(stimulusGroupOptions).set({ displayOrder: offset + i }).where(eq(stimulusGroupOptions.id, row.id));
  }
  for (const [i, row] of rows.entries()) {
    await db.update(stimulusGroupOptions).set({ displayOrder: i }).where(eq(stimulusGroupOptions.id, row.id));
  }
  return true;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {'group'|'option'} scope @param {string} contextId @param {{ originalPromptId?: string | null, promptMd: string, answerMd: string }} input */
export async function savePreviewStimulusQuestion(db, previewSessionId, scope, contextId, input) {
  if (scope === 'group') await requireOwnedPreviewGroup(db, previewSessionId, contextId);
  else await requireOwnedPreviewOption(db, previewSessionId, contextId);
  const answerMd = requiredText(input.answerMd, 'Question answer');
  const originalPromptId = optionalText(input.originalPromptId);

  if (originalPromptId) {
    await requireOwnedPreviewPrompt(db, previewSessionId, originalPromptId);
    if (scope === 'group') {
      const relation = (
        await db
          .select({ id: stimulusGroupQuestions.id })
          .from(stimulusGroupQuestions)
          .where(and(eq(stimulusGroupQuestions.stimulusGroupId, contextId), eq(stimulusGroupQuestions.questionPromptId, originalPromptId)))
          .limit(1)
      )[0];
      if (!relation) throw new PreviewWorkspaceError('That Preview stimulus question no longer exists.', 'INVALID_INPUT');
      await db.update(stimulusGroupQuestions).set({ answerMd, isActive: true, updatedAt: new Date() }).where(eq(stimulusGroupQuestions.id, relation.id));
    } else {
      const relation = (
        await db
          .select({ id: stimulusOptionQuestions.id })
          .from(stimulusOptionQuestions)
          .where(and(eq(stimulusOptionQuestions.stimulusGroupOptionId, contextId), eq(stimulusOptionQuestions.questionPromptId, originalPromptId)))
          .limit(1)
      )[0];
      if (!relation) throw new PreviewWorkspaceError('That Preview stimulus question no longer exists.', 'INVALID_INPUT');
      await db.update(stimulusOptionQuestions).set({ answerMd, isActive: true, updatedAt: new Date() }).where(eq(stimulusOptionQuestions.id, relation.id));
    }
    await db
      .update(questionPrompts)
      .set({ promptMd: requiredText(input.promptMd, 'Question prompt'), updatedAt: new Date() })
      .where(and(eq(questionPrompts.id, originalPromptId), eq(questionPrompts.previewSessionId, previewSessionId)));
    return originalPromptId;
  }

  const promptId = await createPreviewPrompt(db, previewSessionId, input.promptMd);
  if (scope === 'group') {
    await db.insert(stimulusGroupQuestions).values({
      id: newId(),
      stimulusGroupId: contextId,
      questionPromptId: promptId,
      answerMd,
      isActive: true
    });
  } else {
    await db.insert(stimulusOptionQuestions).values({
      id: newId(),
      stimulusGroupOptionId: contextId,
      questionPromptId: promptId,
      answerMd,
      isActive: true
    });
  }
  return promptId;
}

/** @param {LearningDb} db @param {string} previewSessionId @param {'group'|'option'} scope @param {string} contextId @param {string} promptId */
export async function removePreviewStimulusQuestion(db, previewSessionId, scope, contextId, promptId) {
  if (scope === 'group') {
    await requireOwnedPreviewGroup(db, previewSessionId, contextId);
    await requireOwnedPreviewPrompt(db, previewSessionId, promptId);
    await db
      .delete(stimulusGroupQuestions)
      .where(and(eq(stimulusGroupQuestions.stimulusGroupId, contextId), eq(stimulusGroupQuestions.questionPromptId, promptId)));
  } else {
    await requireOwnedPreviewOption(db, previewSessionId, contextId);
    await requireOwnedPreviewPrompt(db, previewSessionId, promptId);
    await db
      .delete(stimulusOptionQuestions)
      .where(and(eq(stimulusOptionQuestions.stimulusGroupOptionId, contextId), eq(stimulusOptionQuestions.questionPromptId, promptId)));
  }
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} assetId @param {string | null} [captionMd] */
export async function attachPreviewAsset(db, previewSessionId, caseId, assetId, captionMd = null) {
  return attachPreviewAssetFixedImage(db, previewSessionId, caseId, assetId, captionMd);
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} assetId */
export async function detachPreviewAsset(db, previewSessionId, caseId, assetId) {
  return detachPreviewAssetFixedImage(db, previewSessionId, caseId, assetId);
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} assetId @param {string | null} captionMd */
export async function updatePreviewAssetCaption(db, previewSessionId, caseId, assetId, captionMd) {
  return updatePreviewAssetCaptionFixedImage(db, previewSessionId, caseId, assetId, captionMd);
}

/** @param {LearningDb} db @param {string} previewSessionId @param {string} caseId @param {string} assetId @param {'up'|'down'} direction */
export async function movePreviewCaseAsset(db, previewSessionId, caseId, assetId, direction) {
  return movePreviewCaseAssetFixedImage(db, previewSessionId, caseId, assetId, direction);
}

/**
 * Preview uploads use the normal guarded media write path but an isolated key prefix and owned Asset row.
 *
 * @param {LearningDb} db @param {R2Bucket} bucket @param {string} previewSessionId
 * @param {Blob & { name?: string }} file
 * @param {{ originalFilename?: string | null, altText: string, sourceLabel?: string | null, sourceUrl?: string | null, licence?: string | null }} metadata
 */
export async function createPreviewAssetFromUpload(db, bucket, previewSessionId, file, metadata) {
  assertSupportedImageType(file.type);
  const key = `preview/${previewSessionId}/${newId()}.${extensionForType(file.type)}`;
  await putTeachingImage(bucket, key, file);
  const id = newId();
  try {
    await db.insert(assets).values({
      id,
      type: 'image',
      storageKey: key,
      mimeType: file.type,
      originalFilename: optionalText(metadata.originalFilename) ?? optionalText(file.name),
      altText: requiredText(metadata.altText, 'Alt text'),
      sourceLabel: optionalText(metadata.sourceLabel),
      sourceUrl: optionalHttpUrl(metadata.sourceUrl),
      licence: optionalText(metadata.licence),
      previewSessionId,
      isActive: true
    });
  } catch (error) {
    await deleteTeachingImage(bucket, key).catch(() => {});
    throw error;
  }
  return { id, storageKey: key };
}

/**
 * @param {LearningDb} db
 * @param {R2Bucket} bucket
 * @param {string} previewSessionId
 * @param {string} assetId
 */
export async function discardPreviewAsset(db, bucket, previewSessionId, assetId) {
  const asset = (await db.select({ id: assets.id, storageKey: assets.storageKey }).from(assets).where(and(eq(assets.id, assetId), eq(assets.previewSessionId, previewSessionId))).limit(1))[0];
  if (!asset || !asset.storageKey.startsWith(`preview/${previewSessionId}/`)) return false;
  const [fixedUsage, optionUsage] = await Promise.all([
    db.select({ caseId: caseAssets.caseId }).from(caseAssets).where(eq(caseAssets.assetId, assetId)).limit(1),
    db.select({ id: stimulusGroupOptions.id }).from(stimulusGroupOptions).where(eq(stimulusGroupOptions.assetId, assetId)).limit(1)
  ]);
  if (fixedUsage.length || optionUsage.length) throw new PreviewWorkspaceError('The Preview Asset is already in use and cannot be discarded.', 'INVALID_INPUT');
  await deleteTeachingImage(bucket, asset.storageKey);
  await db.delete(assets).where(and(eq(assets.id, assetId), eq(assets.previewSessionId, previewSessionId)));
  return true;
}

/**
 * Delete only the owned disposable graph. R2 objects are verified before deletion;
 * ambiguous cross-session/production usage fails closed and leaves the session retryable.
 *
 * @param {{ db: LearningDb, bucket: R2Bucket, previewSessionId: string, userId: string }} input
 */
export async function cleanupPreviewWorkspace({ db, bucket, previewSessionId, userId }) {
  const session = await requireOwnedSession(db, previewSessionId, userId);
  if (session.status === 'cleaned') return { cleaned: true, alreadyClean: true };

  try {
    const ownedCases = await db.select({ id: cases.id }).from(cases).where(eq(cases.previewSessionId, previewSessionId));
    const caseIds = ownedCases.map((row) => row.id);
    const ownedAssets = await db
      .select({ id: assets.id, storageKey: assets.storageKey })
      .from(assets)
      .where(eq(assets.previewSessionId, previewSessionId));
    const assetIds = ownedAssets.map((row) => row.id);

    if (caseIds.length) {
      const existingReviews = await db.select({ id: reviews.id }).from(reviews).where(inArray(reviews.caseId, caseIds)).limit(1);
      if (existingReviews[0]) {
        throw new PreviewWorkspaceError(
          'Cleanup stopped because a learner Review unexpectedly references Preview content.',
          'AMBIGUOUS_OWNERSHIP'
        );
      }
    }

    for (const asset of ownedAssets) {
      const expectedPrefix = `preview/${previewSessionId}/`;
      if (!asset.storageKey.startsWith(expectedPrefix)) {
        throw new PreviewWorkspaceError('Cleanup stopped because a Preview Asset has an unexpected R2 key.', 'AMBIGUOUS_OWNERSHIP');
      }
      const fixedUsages = await db
        .select({ previewSessionId: cases.previewSessionId })
        .from(caseAssets)
        .innerJoin(cases, eq(cases.id, caseAssets.caseId))
        .where(eq(caseAssets.assetId, asset.id));
      const optionUsages = await db
        .select({ previewSessionId: cases.previewSessionId })
        .from(stimulusGroupOptions)
        .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
        .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
        .where(eq(stimulusGroupOptions.assetId, asset.id));
      const historical = await db.select({ id: reviewAssets.id }).from(reviewAssets).where(eq(reviewAssets.assetId, asset.id)).limit(1);
      if (historical[0] || [...fixedUsages, ...optionUsages].some((usage) => usage.previewSessionId !== previewSessionId)) {
        throw new PreviewWorkspaceError('Cleanup stopped because a Preview Asset has non-Preview or foreign usage.', 'AMBIGUOUS_OWNERSHIP');
      }
    }

    const ownedPrompts = await db
      .select({ id: questionPrompts.id })
      .from(questionPrompts)
      .where(eq(questionPrompts.previewSessionId, previewSessionId));
    const promptIds = ownedPrompts.map((row) => row.id);
    if (promptIds.length) {
      const sharedTopicUsage = await db
        .select({ id: conceptQuestions.id })
        .from(conceptQuestions)
        .where(inArray(conceptQuestions.questionPromptId, promptIds))
        .limit(1);
      if (sharedTopicUsage[0]) {
        throw new PreviewWorkspaceError(
          'Cleanup stopped because a Preview Question Prompt acquired production Topic usage.',
          'AMBIGUOUS_OWNERSHIP'
        );
      }
    }

    for (const asset of ownedAssets) await deleteTeachingImage(bucket, asset.storageKey);

    if (caseIds.length) {
      const caseQuestionRows = await db.select({ id: caseQuestions.id }).from(caseQuestions).where(inArray(caseQuestions.caseId, caseIds));
      const caseQuestionIds = caseQuestionRows.map((row) => row.id);
      const groupRows = await db.select({ id: stimulusGroups.id }).from(stimulusGroups).where(inArray(stimulusGroups.caseId, caseIds));
      const groupIds = groupRows.map((row) => row.id);
      const optionRows = groupIds.length
        ? await db.select({ id: stimulusGroupOptions.id }).from(stimulusGroupOptions).where(inArray(stimulusGroupOptions.stimulusGroupId, groupIds))
        : [];
      const optionIds = optionRows.map((row) => row.id);

      if (caseQuestionIds.length) await db.delete(caseQuestionTags).where(inArray(caseQuestionTags.caseQuestionId, caseQuestionIds));
      if (optionIds.length) await db.delete(stimulusOptionQuestions).where(inArray(stimulusOptionQuestions.stimulusGroupOptionId, optionIds));
      if (groupIds.length) await db.delete(stimulusGroupQuestions).where(inArray(stimulusGroupQuestions.stimulusGroupId, groupIds));
      if (caseQuestionIds.length) await db.delete(caseQuestions).where(inArray(caseQuestions.id, caseQuestionIds));
      if (optionIds.length) await db.delete(stimulusGroupOptions).where(inArray(stimulusGroupOptions.id, optionIds));
      if (groupIds.length) await db.delete(stimulusGroups).where(inArray(stimulusGroups.id, groupIds));
      await db.delete(caseAssets).where(inArray(caseAssets.caseId, caseIds));
      await db.delete(caseTags).where(inArray(caseTags.caseId, caseIds));
      await db.delete(caseConcepts).where(inArray(caseConcepts.caseId, caseIds));
      await db.delete(cases).where(and(inArray(cases.id, caseIds), eq(cases.previewSessionId, previewSessionId)));
    }

    await db.delete(questionPrompts).where(eq(questionPrompts.previewSessionId, previewSessionId));
    if (assetIds.length) {
      await db.delete(assets).where(and(inArray(assets.id, assetIds), eq(assets.previewSessionId, previewSessionId)));
    }
    await db
      .update(previewSessions)
      .set({ status: 'cleaned', lastError: null, updatedAt: new Date() })
      .where(and(eq(previewSessions.id, previewSessionId), eq(previewSessions.userId, userId)));
    return { cleaned: true, alreadyClean: false };
  } catch (error) {
    await db
      .update(previewSessions)
      .set({
        status: 'cleanup_required',
        lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Preview cleanup failed.',
        updatedAt: new Date()
      })
      .where(and(eq(previewSessions.id, previewSessionId), eq(previewSessions.userId, userId)));
    throw error;
  }
}
