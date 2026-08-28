import { and, eq, gt, inArray, isNull, notExists, sql } from 'drizzle-orm';

import {
  assetQuestions,
  assets,
  caseAssets,
  cases,
  previewSessions,
  stimulusGroupOptions,
  stimulusGroups,
  stimulusOptionAssetQuestions
} from './schema.js';
import {
  assertImageSize,
  assertSupportedImageType,
  deleteTeachingImage,
  putTeachingImage
} from '../storage/media.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class AssetReplacementInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AssetReplacementInputError';
  }
}

/** @param {string} mimeType */
function extensionForType(mimeType) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  throw new AssetReplacementInputError('Only JPEG and PNG replacement images are supported.');
}

/** @param {Blob & { name?: string }} file @param {string | null} fallback */
function replacementFilename(file, fallback) {
  const filename = typeof file.name === 'string' ? file.name.trim() : '';
  return filename || fallback || null;
}

/** @param {LearningDb} db @param {string} assetId */
async function loadAsset(db, assetId) {
  return (await db.select({
    id: assets.id,
    type: assets.type,
    storageKey: assets.storageKey,
    mimeType: assets.mimeType,
    originalFilename: assets.originalFilename,
    altText: assets.altText,
    sourceLabel: assets.sourceLabel,
    sourceUrl: assets.sourceUrl,
    licence: assets.licence,
    imageCollectionId: assets.imageCollectionId,
    previewSessionId: assets.previewSessionId,
    supersededByAssetId: assets.supersededByAssetId,
    isActive: assets.isActive
  }).from(assets).where(eq(assets.id, assetId)).limit(1))[0] ?? null;
}

/**
 * @param {Awaited<ReturnType<typeof loadAsset>>} source
 * @returns {NonNullable<Awaited<ReturnType<typeof loadAsset>>>}
 */
function assertReplaceableAsset(source) {
  if (!source) throw new AssetReplacementInputError('Asset not found.');
  if (source.previewSessionId) {
    throw new AssetReplacementInputError('Preview-owned Assets cannot be replaced by the production higher-resolution workflow.');
  }
  if (source.type !== 'image') throw new AssetReplacementInputError('Only image Assets can be replaced.');
  if (source.supersededByAssetId) {
    throw new AssetReplacementInputError('This Asset has already been superseded. Replace its current successor instead.');
  }
  if (!source.isActive) {
    throw new AssetReplacementInputError('Only an active production image Asset can be replaced.');
  }
  return source;
}

/** @param {LearningDb} db @param {string} assetId @param {Date} now */
function livePreviewFixedReferenceQuery(db, assetId, now) {
  return db.select({ id: caseAssets.caseId })
    .from(caseAssets)
    .innerJoin(cases, eq(cases.id, caseAssets.caseId))
    .innerJoin(previewSessions, eq(previewSessions.id, cases.previewSessionId))
    .where(and(
      eq(caseAssets.assetId, assetId),
      eq(previewSessions.status, 'active'),
      gt(previewSessions.expiresAt, now)
    ));
}

/** @param {LearningDb} db @param {string} assetId @param {Date} now */
function livePreviewOptionReferenceQuery(db, assetId, now) {
  return db.select({ id: stimulusGroupOptions.id })
    .from(stimulusGroupOptions)
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
    .innerJoin(previewSessions, eq(previewSessions.id, cases.previewSessionId))
    .where(and(
      eq(stimulusGroupOptions.assetId, assetId),
      eq(previewSessions.status, 'active'),
      gt(previewSessions.expiresAt, now)
    ));
}

/** @param {LearningDb} db @param {string} assetId @param {Date} now */
async function loadLivePreviewUsage(db, assetId, now) {
  const [fixedRows, optionRows] = await Promise.all([
    livePreviewFixedReferenceQuery(db, assetId, now),
    livePreviewOptionReferenceQuery(db, assetId, now)
  ]);
  return {
    fixedRelationships: fixedRows.length,
    stimulusOptions: optionRows.length,
    hasUsage: fixedRows.length > 0 || optionRows.length > 0
  };
}

/** @param {{ hasUsage: boolean }} usage */
function assertNoLivePreviewUsage(usage) {
  if (!usage.hasUsage) return;
  throw new AssetReplacementInputError(
    'Replacement is temporarily blocked because this image is referenced by an active Preview workspace. Reset that Preview workspace or let it expire, then retry.'
  );
}

/**
 * Return production-only supersession state and the impact summary used by the
 * Admin confirmation surface. Preview-owned relationships are intentionally
 * excluded because this operation has no authority to rewrite them.
 *
 * @param {LearningDb} db
 * @param {string} assetId
 */
export async function getAssetReplacementSummary(db, assetId) {
  const normalizedAssetId = String(assetId ?? '').trim();
  if (!normalizedAssetId) return null;
  const source = await loadAsset(db, normalizedAssetId);
  if (!source || source.previewSessionId) return null;

  const now = new Date();
  const [predecessor, fixedRows, optionRows, questionRows, livePreviewUsage] = await Promise.all([
    db.select({ id: assets.id, originalFilename: assets.originalFilename })
      .from(assets)
      .where(and(eq(assets.supersededByAssetId, normalizedAssetId), isNull(assets.previewSessionId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db.select({ caseId: caseAssets.caseId })
      .from(caseAssets)
      .innerJoin(cases, eq(cases.id, caseAssets.caseId))
      .where(and(eq(caseAssets.assetId, normalizedAssetId), isNull(cases.previewSessionId))),
    db.select({ optionId: stimulusGroupOptions.id, caseId: stimulusGroups.caseId })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(eq(stimulusGroupOptions.assetId, normalizedAssetId), isNull(cases.previewSessionId))),
    db.select({ id: assetQuestions.id }).from(assetQuestions).where(eq(assetQuestions.assetId, normalizedAssetId)),
    loadLivePreviewUsage(db, normalizedAssetId, now)
  ]);

  const successor = source.supersededByAssetId
    ? (await db.select({ id: assets.id, originalFilename: assets.originalFilename })
        .from(assets)
        .where(and(eq(assets.id, source.supersededByAssetId), isNull(assets.previewSessionId)))
        .limit(1))[0] ?? null
    : null;

  return {
    assetId: source.id,
    isActive: source.isActive,
    supersededByAssetId: source.supersededByAssetId,
    supersededBy: successor,
    supersedes: predecessor,
    canReplace: source.type === 'image' && source.isActive && !source.supersededByAssetId && !livePreviewUsage.hasUsage,
    livePreviewUsage,
    impact: {
      fixedCaseRelationships: fixedRows.length,
      fixedCases: new Set(fixedRows.map((row) => row.caseId)).size,
      stimulusOptions: optionRows.length,
      stimulusCases: new Set(optionRows.map((row) => row.caseId)).size,
      reusableImageQuestions: questionRows.length
    }
  };
}

/**
 * Replace one active production image Asset with a better-quality copy of the
 * same underlying image. The old Asset/R2 object and historical Reviews remain
 * immutable; current production authoring relationships move to a new Asset.
 *
 * @param {{ db: LearningDb, bucket: R2Bucket, assetId: string, file: Blob & { name?: string }, confirmedSameImage: boolean }} input
 */
export async function replaceAssetWithHigherResolution({ db, bucket, assetId, file, confirmedSameImage }) {
  const normalizedAssetId = String(assetId ?? '').trim();
  if (!normalizedAssetId) throw new AssetReplacementInputError('An Asset ID is required.');
  if (!confirmedSameImage) {
    throw new AssetReplacementInputError('Confirm that the upload is the same underlying image at higher quality/resolution.');
  }
  if (!(file instanceof Blob) || file.size <= 0) throw new AssetReplacementInputError('Choose a replacement image file.');

  assertSupportedImageType(file.type);
  assertImageSize(file.size);

  const source = assertReplaceableAsset(await loadAsset(db, normalizedAssetId));
  const now = new Date();
  assertNoLivePreviewUsage(await loadLivePreviewUsage(db, normalizedAssetId, now));

  const [fixedRows, optionRows, reusableRows, productionOptIns] = await Promise.all([
    db.select({ caseId: caseAssets.caseId })
      .from(caseAssets)
      .innerJoin(cases, eq(cases.id, caseAssets.caseId))
      .where(and(eq(caseAssets.assetId, normalizedAssetId), isNull(cases.previewSessionId))),
    db.select({ optionId: stimulusGroupOptions.id, optionAssetId: stimulusGroupOptions.assetId })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(eq(stimulusGroupOptions.assetId, normalizedAssetId), isNull(cases.previewSessionId))),
    db.select({
      id: assetQuestions.id,
      questionPromptId: assetQuestions.questionPromptId,
      answerMd: assetQuestions.answerMd,
      isActive: assetQuestions.isActive
    }).from(assetQuestions).where(eq(assetQuestions.assetId, normalizedAssetId)),
    db.select({
      optionId: stimulusOptionAssetQuestions.stimulusGroupOptionId,
      oldAssetQuestionId: stimulusOptionAssetQuestions.assetQuestionId,
      optionAssetId: stimulusGroupOptions.assetId
    })
      .from(stimulusOptionAssetQuestions)
      .innerJoin(assetQuestions, eq(assetQuestions.id, stimulusOptionAssetQuestions.assetQuestionId))
      .innerJoin(stimulusGroupOptions, eq(stimulusGroupOptions.id, stimulusOptionAssetQuestions.stimulusGroupOptionId))
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(eq(assetQuestions.assetId, normalizedAssetId), isNull(cases.previewSessionId)))
  ]);

  if (productionOptIns.some((row) => row.optionAssetId !== normalizedAssetId)) {
    throw new AssetReplacementInputError('A reusable Image Question is attached to a production option showing a different Asset. Repair that relationship before replacement.');
  }

  const newAssetId = crypto.randomUUID();
  const extension = extensionForType(file.type);
  const newStorageKey = `teaching-images/${newAssetId}.${extension}`;
  /** @type {Map<string, string>} */
  const clonedQuestionIds = new Map(reusableRows.map((row) => [row.id, crypto.randomUUID()]));

  /** @param {string} oldAssetQuestionId */
  const clonedQuestionId = (oldAssetQuestionId) => {
    const id = clonedQuestionIds.get(oldAssetQuestionId);
    if (!id) throw new AssetReplacementInputError('Reusable Image Question replacement mapping is incomplete.');
    return id;
  };

  for (const usage of productionOptIns) clonedQuestionId(usage.oldAssetQuestionId);

  await putTeachingImage(bucket, newStorageKey, file);

  try {
    /** @type {any[]} */
    const statements = [
      db.insert(assets).values({
        id: newAssetId,
        type: source.type,
        storageKey: newStorageKey,
        mimeType: file.type,
        originalFilename: replacementFilename(file, source.originalFilename),
        altText: source.altText,
        sourceLabel: source.sourceLabel,
        sourceUrl: source.sourceUrl,
        licence: source.licence,
        imageCollectionId: source.imageCollectionId,
        previewSessionId: null,
        supersededByAssetId: null,
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
    ];

    if (reusableRows.length) {
      statements.push(db.insert(assetQuestions).values(reusableRows.map((row) => ({
        id: clonedQuestionId(row.id),
        assetId: newAssetId,
        questionPromptId: row.questionPromptId,
        answerMd: row.answerMd,
        isActive: row.isActive,
        createdAt: now,
        updatedAt: now
      }))));
    }

    const fixedCaseIds = fixedRows.map((row) => row.caseId);
    if (fixedCaseIds.length) {
      statements.push(db.update(caseAssets)
        .set({ assetId: newAssetId })
        .where(and(eq(caseAssets.assetId, normalizedAssetId), inArray(caseAssets.caseId, fixedCaseIds))));
    }

    const optionIds = optionRows.map((row) => row.optionId);
    if (optionIds.length) {
      statements.push(db.update(stimulusGroupOptions)
        .set({ assetId: newAssetId })
        .where(and(eq(stimulusGroupOptions.assetId, normalizedAssetId), inArray(stimulusGroupOptions.id, optionIds))));
    }

    for (const usage of productionOptIns) {
      statements.push(db.update(stimulusOptionAssetQuestions)
        .set({ assetQuestionId: clonedQuestionId(usage.oldAssetQuestionId) })
        .where(and(
          eq(stimulusOptionAssetQuestions.stimulusGroupOptionId, usage.optionId),
          eq(stimulusOptionAssetQuestions.assetQuestionId, usage.oldAssetQuestionId)
        )));
    }

    // Keep the source Asset active until every current production relationship
    // has been repointed. This preserves the Original-stimulus invariant while
    // still making supersession the atomic claim that wins a double-submit or
    // Preview race. Any lost claim is detected by the sentinel below and rolls
    // back all earlier statements in this D1 batch.
    statements.push(
      db.update(assets)
        .set({ isActive: false, supersededByAssetId: newAssetId, updatedAt: now })
        .where(and(
          eq(assets.id, normalizedAssetId),
          eq(assets.isActive, true),
          isNull(assets.previewSessionId),
          isNull(assets.supersededByAssetId),
          notExists(livePreviewFixedReferenceQuery(db, normalizedAssetId, now)),
          notExists(livePreviewOptionReferenceQuery(db, normalizedAssetId, now))
        )),
      // D1 batch updates do not fail merely because a conditional UPDATE changed
      // zero rows. Make the claim observable through an existing NOT NULL
      // constraint so a lost double-submit/Preview race aborts the whole batch.
      db.update(assets)
        .set({
          type: sql`(SELECT ${assets.type} FROM ${assets} WHERE ${assets.id} = ${normalizedAssetId} AND ${assets.isActive} = 0 AND ${assets.supersededByAssetId} = ${newAssetId})`
        })
        .where(eq(assets.id, newAssetId))
    );

    await db.batch(/** @type {[any, ...any[]]} */ (statements));
  } catch (error) {
    try {
      await deleteTeachingImage(bucket, newStorageKey);
    } catch (cleanupError) {
      console.error('Failed to remove newly uploaded replacement object after D1 rollback.', cleanupError);
    }

    const current = await loadAsset(db, normalizedAssetId);
    if (current?.supersededByAssetId || current?.isActive === false) {
      throw new AssetReplacementInputError(
        'This image was already replaced by another submission. Refresh the page and use the current replacement Asset.'
      );
    }
    const livePreviewUsage = await loadLivePreviewUsage(db, normalizedAssetId, new Date());
    if (livePreviewUsage.hasUsage) {
      throw new AssetReplacementInputError(
        'Replacement is temporarily blocked because this image is referenced by an active Preview workspace. Reset that Preview workspace or let it expire, then retry.'
      );
    }
    throw error;
  }

  return {
    oldAssetId: normalizedAssetId,
    newAssetId,
    oldStorageKey: source.storageKey,
    newStorageKey,
    fixedRelationshipCount: fixedRows.length,
    stimulusOptionCount: optionRows.length,
    clonedAssetQuestionCount: reusableRows.length,
    remappedOptInCount: productionOptIns.length,
    clonedAssetQuestionIds: Object.fromEntries(clonedQuestionIds)
  };
}