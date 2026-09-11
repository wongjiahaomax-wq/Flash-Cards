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

const MAX_D1_STATEMENT_PARAMS = 100;

/** @param {unknown} value */
function storedValue(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value === undefined ? null : value;
}

/** @param {any} column @param {unknown} value */
function exactColumn(column, value) {
  return sql`${column} IS ${storedValue(value)}`;
}

/** @param {any[]} columns @param {any} row */
function exactRow(columns, row) {
  return sql.join(columns.map(([column, key]) => exactColumn(column, row[key])), sql` AND `);
}

/** @param {any[]} rows @param {number} paramsPerRow @param {number} fixedParams */
function parameterSafeChunks(rows, paramsPerRow, fixedParams = 0) {
  const size = Math.max(1, Math.floor((MAX_D1_STATEMENT_PARAMS - fixedParams) / paramsPerRow));
  /** @type {any[][]} */
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks.length ? chunks : [[]];
}

/** @param {any[]} rows @param {number} columnsPerRow */
function graphRowChunks(rows, columnsPerRow) {
  // Every graph row also repeats sourceAssetId in its scope. Each guard has
  // one sentinel bind, one count bind, and one expected-row-count bind.
  return parameterSafeChunks(rows, columnsPerRow + 1, 3);
}

/**
 * Assert that the production migration graph still exactly matches the rows
 * read before the replacement object was uploaded. Each category gets its own
 * bounded sentinel statement so a large Asset graph remains within D1's query
 * parameter ceiling while all assertions still run in the same atomic batch.
 *
 * @param {LearningDb} db
 * @param {string} sourceAssetId
 * @param {{ fixedRows: any[], optionRows: any[], reusableRows: any[], productionOptIns: any[] }} graph
 */
function graphSnapshotGuardStatements(db, sourceAssetId, graph) {
  /** @param {any} condition */
  const sentinel = (condition) => db.update(assets)
    .set({ type: sql`CASE WHEN ${condition} THEN ${assets.type} ELSE NULL END` })
    .where(eq(assets.id, sourceAssetId));
  /** @type {any[]} */
  const statements = [];

  /** @param {{ rows: any[], columns: any[], countQuery: any, rowQuery: (row: any) => any }} category */
  const addCategory = ({ rows, columns, countQuery, rowQuery }) => {
    for (const chunk of graphRowChunks(rows, columns.length)) {
      const conditions = [
        sql`(${countQuery}) = ${rows.length}`,
        ...chunk.map((row) => sql`EXISTS (${rowQuery(row)})`)
      ];
      statements.push(sentinel(sql.join(conditions, sql` AND `)));
    }
  };

  const fixedColumns = [
    [caseAssets.caseId, 'caseId'],
    [caseAssets.assetId, 'assetId'],
    [caseAssets.displayOrder, 'displayOrder'],
    [caseAssets.captionMd, 'captionMd'],
    [caseAssets.createdAt, 'createdAt']
  ];
  const fixedScope = and(eq(caseAssets.assetId, sourceAssetId), isNull(cases.previewSessionId));
  addCategory({
    rows: graph.fixedRows,
    columns: fixedColumns,
    countQuery: sql`SELECT count(*) FROM ${caseAssets}
      INNER JOIN ${cases} ON ${eq(cases.id, caseAssets.caseId)}
      WHERE ${fixedScope}`,
    rowQuery: /** @param {any} row */ (row) => sql`SELECT 1 FROM ${caseAssets}
      INNER JOIN ${cases} ON ${eq(cases.id, caseAssets.caseId)}
      WHERE ${fixedScope} AND ${exactRow(fixedColumns, row)}`
  });

  const optionColumns = [
    [stimulusGroupOptions.id, 'optionId'],
    [stimulusGroupOptions.stimulusGroupId, 'stimulusGroupId'],
    [stimulusGroupOptions.assetId, 'assetId'],
    [stimulusGroupOptions.displayOrder, 'displayOrder'],
    [stimulusGroupOptions.captionMd, 'captionMd'],
    [stimulusGroupOptions.isActive, 'isActive'],
    [stimulusGroupOptions.removedFromCase, 'removedFromCase'],
    [stimulusGroupOptions.createdAt, 'createdAt']
  ];
  const optionScope = and(eq(stimulusGroupOptions.assetId, sourceAssetId), isNull(cases.previewSessionId));
  addCategory({
    rows: graph.optionRows,
    columns: optionColumns,
    countQuery: sql`SELECT count(*) FROM ${stimulusGroupOptions}
      INNER JOIN ${stimulusGroups} ON ${eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)}
      INNER JOIN ${cases} ON ${eq(cases.id, stimulusGroups.caseId)}
      WHERE ${optionScope}`,
    rowQuery: /** @param {any} row */ (row) => sql`SELECT 1 FROM ${stimulusGroupOptions}
      INNER JOIN ${stimulusGroups} ON ${eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)}
      INNER JOIN ${cases} ON ${eq(cases.id, stimulusGroups.caseId)}
      WHERE ${optionScope} AND ${exactRow(optionColumns, row)}`
  });

  const reusableQuestionColumns = [
    [assetQuestions.id, 'id'],
    [assetQuestions.assetId, 'assetId'],
    [assetQuestions.questionPromptId, 'questionPromptId'],
    [assetQuestions.answerMd, 'answerMd'],
    [assetQuestions.isActive, 'isActive'],
    [assetQuestions.createdAt, 'createdAt'],
    [assetQuestions.updatedAt, 'updatedAt']
  ];
  const reusableQuestionScope = eq(assetQuestions.assetId, sourceAssetId);
  addCategory({
    rows: graph.reusableRows,
    columns: reusableQuestionColumns,
    countQuery: sql`SELECT count(*) FROM ${assetQuestions} WHERE ${reusableQuestionScope}`,
    rowQuery: /** @param {any} row */ (row) => sql`SELECT 1 FROM ${assetQuestions}
      WHERE ${reusableQuestionScope} AND ${exactRow(reusableQuestionColumns, row)}`
  });

  const optInColumns = [
    [stimulusOptionAssetQuestions.stimulusGroupOptionId, 'optionId'],
    [stimulusOptionAssetQuestions.assetQuestionId, 'oldAssetQuestionId'],
    [stimulusOptionAssetQuestions.createdAt, 'createdAt'],
    [stimulusGroupOptions.assetId, 'optionAssetId']
  ];
  const optInScope = and(
    eq(assetQuestions.assetId, sourceAssetId),
    isNull(cases.previewSessionId)
  );
  addCategory({
    rows: graph.productionOptIns,
    columns: optInColumns,
    countQuery: sql`SELECT count(*) FROM ${stimulusOptionAssetQuestions}
      INNER JOIN ${assetQuestions} ON ${eq(assetQuestions.id, stimulusOptionAssetQuestions.assetQuestionId)}
      INNER JOIN ${stimulusGroupOptions} ON ${eq(stimulusGroupOptions.id, stimulusOptionAssetQuestions.stimulusGroupOptionId)}
      INNER JOIN ${stimulusGroups} ON ${eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)}
      INNER JOIN ${cases} ON ${eq(cases.id, stimulusGroups.caseId)}
      WHERE ${optInScope}`,
    rowQuery: /** @param {any} row */ (row) => sql`SELECT 1 FROM ${stimulusOptionAssetQuestions}
      INNER JOIN ${assetQuestions} ON ${eq(assetQuestions.id, stimulusOptionAssetQuestions.assetQuestionId)}
      INNER JOIN ${stimulusGroupOptions} ON ${eq(stimulusGroupOptions.id, stimulusOptionAssetQuestions.stimulusGroupOptionId)}
      INNER JOIN ${stimulusGroups} ON ${eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)}
      INNER JOIN ${cases} ON ${eq(cases.id, stimulusGroups.caseId)}
      WHERE ${optInScope} AND ${exactRow(optInColumns, row)}`
  });

  return statements;
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
    db.select({
      caseId: caseAssets.caseId,
      assetId: caseAssets.assetId,
      displayOrder: caseAssets.displayOrder,
      captionMd: caseAssets.captionMd,
      createdAt: caseAssets.createdAt
    })
      .from(caseAssets)
      .innerJoin(cases, eq(cases.id, caseAssets.caseId))
      .where(and(eq(caseAssets.assetId, normalizedAssetId), isNull(cases.previewSessionId))),
    db.select({
      optionId: stimulusGroupOptions.id,
      stimulusGroupId: stimulusGroupOptions.stimulusGroupId,
      assetId: stimulusGroupOptions.assetId,
      displayOrder: stimulusGroupOptions.displayOrder,
      captionMd: stimulusGroupOptions.captionMd,
      isActive: stimulusGroupOptions.isActive,
      removedFromCase: stimulusGroupOptions.removedFromCase,
      createdAt: stimulusGroupOptions.createdAt
    })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(eq(stimulusGroupOptions.assetId, normalizedAssetId), isNull(cases.previewSessionId))),
    db.select({
      id: assetQuestions.id,
      assetId: assetQuestions.assetId,
      questionPromptId: assetQuestions.questionPromptId,
      answerMd: assetQuestions.answerMd,
      isActive: assetQuestions.isActive,
      createdAt: assetQuestions.createdAt,
      updatedAt: assetQuestions.updatedAt
    }).from(assetQuestions).where(eq(assetQuestions.assetId, normalizedAssetId)),
    db.select({
      optionId: stimulusOptionAssetQuestions.stimulusGroupOptionId,
      oldAssetQuestionId: stimulusOptionAssetQuestions.assetQuestionId,
      createdAt: stimulusOptionAssetQuestions.createdAt,
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
      ...graphSnapshotGuardStatements(db, normalizedAssetId, {
        fixedRows,
        optionRows,
        reusableRows,
        productionOptIns
      }),
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

    for (const questionRows of parameterSafeChunks(reusableRows, 7)) {
      if (!questionRows.length) continue;
      statements.push(db.insert(assetQuestions).values(questionRows.map((row) => ({
        id: clonedQuestionId(row.id),
        assetId: newAssetId,
        questionPromptId: row.questionPromptId,
        answerMd: row.answerMd,
        isActive: row.isActive,
        createdAt: now,
        updatedAt: now
      }))));
    }

    const fixedCaseIds = [...new Set(fixedRows.map((row) => row.caseId))];
    for (const caseIdChunk of parameterSafeChunks(fixedCaseIds, 1, 2)) {
      if (!caseIdChunk.length) continue;
      statements.push(db.update(caseAssets)
        .set({ assetId: newAssetId })
        .where(and(eq(caseAssets.assetId, normalizedAssetId), inArray(caseAssets.caseId, caseIdChunk))));
    }

    const optionIds = [...new Set(optionRows.map((row) => row.optionId))];
    for (const optionIdChunk of parameterSafeChunks(optionIds, 1, 2)) {
      if (!optionIdChunk.length) continue;
      statements.push(db.update(stimulusGroupOptions)
        .set({ assetId: newAssetId })
        .where(and(eq(stimulusGroupOptions.assetId, normalizedAssetId), inArray(stimulusGroupOptions.id, optionIdChunk))));
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
    if (error instanceof Error && /NOT NULL constraint failed: assets\.type/.test(error.message)) {
      throw new AssetReplacementInputError(
        'The production image relationships changed while this replacement was being prepared. Refresh the image and retry.'
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
