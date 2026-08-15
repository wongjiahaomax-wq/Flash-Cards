import { and, asc, count, desc, eq, exists, gt, isNull, isNotNull, like, or, sql } from 'drizzle-orm';

import {
  deleteTeachingImage,
  getTeachingImageUrl,
  putTeachingImage,
  assertSupportedImageType
} from '../storage/media.js';
import { assets, caseAssets, caseConcepts, cases, concepts } from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class AssetLibraryInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AssetLibraryInputError';
  }
}

/** @param {string | null | undefined} value */
function optionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

/** @param {string | null | undefined} value @param {string} label */
function requiredText(value, label) {
  const text = optionalText(value);
  if (!text) throw new AssetLibraryInputError(`${label} is required.`);
  return text;
}

/** @param {string | null | undefined} value */
export function validateAssetSourceUrl(value) {
  const text = optionalText(value);
  if (!text) return null;

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new AssetLibraryInputError('Source URL must be a valid http(s) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AssetLibraryInputError('Source URL must be a valid http(s) URL.');
  }

  return parsed.toString();
}

/** @param {unknown} value */
function booleanValue(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

/**
 * @param {URLSearchParams | { get(name: string): string | null }} params
 * @returns {{ search: string, topic: string, usage: 'all' | 'used' | 'unused', status: 'all' | 'active' | 'inactive', source: 'all' | 'known' | 'unknown', sort: 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'most-used' | 'least-used' }}
 */
export function parseAssetLibraryFilters(params) {
  const sortValue = params.get('sort');
  const usageValue = params.get('usage');
  const statusValue = params.get('status');
  const sourceValue = params.get('source');

  return {
    search: params.get('q')?.trim() ?? '',
    topic: params.get('topic')?.trim() ?? '',
    usage: usageValue === 'used' || usageValue === 'unused' ? usageValue : 'all',
    status: statusValue === 'active' || statusValue === 'inactive' ? statusValue : 'all',
    source: sourceValue === 'known' || sourceValue === 'unknown' ? sourceValue : 'all',
    sort: sortValue === 'oldest' || sortValue === 'name-asc' || sortValue === 'name-desc' || sortValue === 'most-used' || sortValue === 'least-used' ? sortValue : 'newest'
  };
}

/** @param {LearningDb} db */
export async function listAssetLibraryTopics(db) {
  return db
    .select({ id: concepts.id, name: concepts.name })
    .from(concepts)
    .orderBy(asc(concepts.name), asc(concepts.id));
}

/** @param {LearningDb} db */
async function listUsageRows(db) {
  return db
    .select({
      assetId: caseAssets.assetId,
      caseId: cases.id,
      caseTitle: cases.title,
      caseIsActive: cases.isActive,
      captionMd: caseAssets.captionMd,
      displayOrder: caseAssets.displayOrder,
      conceptId: caseConcepts.conceptId,
      conceptName: concepts.name
    })
    .from(caseAssets)
    .innerJoin(cases, eq(cases.id, caseAssets.caseId))
    .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
    .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .orderBy(asc(cases.title), asc(caseAssets.displayOrder), asc(cases.id));
}

/** @param {string[]} names */
function topicSummary(names) {
  if (names.length <= 2) return names.join(' · ');
  return `${names.slice(0, 2).join(' · ')} +${names.length - 2}`;
}

/**
 * @param {LearningDb} db
 * @param {{ search?: string, topic?: string, usage?: 'all' | 'used' | 'unused', status?: 'all' | 'active' | 'inactive', source?: 'all' | 'known' | 'unknown', sort?: 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'most-used' | 'least-used' }} [filters]
 */
export async function listAssetLibrary(db, filters = {}) {
  const search = String(filters.search ?? '').trim();
  const topic = String(filters.topic ?? '').trim();
  const usage = filters.usage ?? 'all';
  const status = filters.status ?? 'all';
  const source = filters.source ?? 'all';
  const sort = filters.sort ?? 'newest';
  const conditions = [];
  const usageCountExpression = count(caseAssets.caseId);
  const usageCount = usageCountExpression.as('usageCount');

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(assets.originalFilename, pattern),
        like(assets.altText, pattern),
        like(assets.sourceLabel, pattern),
        like(assets.sourceUrl, pattern)
      )
    );
  }
  if (status === 'active') conditions.push(eq(assets.isActive, true));
  if (status === 'inactive') conditions.push(eq(assets.isActive, false));
  if (source === 'known') {
    conditions.push(or(isNotNull(assets.sourceLabel), isNotNull(assets.sourceUrl), isNotNull(assets.licence)));
  }
  if (source === 'unknown') {
    conditions.push(and(isNull(assets.sourceLabel), isNull(assets.sourceUrl), isNull(assets.licence)));
  }
  if (topic) {
    conditions.push(
      exists(
        db
          .select({ assetId: caseAssets.assetId })
          .from(caseAssets)
          .innerJoin(caseConcepts, and(eq(caseConcepts.caseId, caseAssets.caseId), eq(caseConcepts.role, 'primary')))
          .where(and(eq(caseAssets.assetId, assets.id), eq(caseConcepts.conceptId, topic)))
          .limit(1)
      )
    );
  }

  const rows = await db
    .select({
      id: assets.id,
      type: assets.type,
      storageKey: assets.storageKey,
      mimeType: assets.mimeType,
      originalFilename: assets.originalFilename,
      altText: assets.altText,
      sourceLabel: assets.sourceLabel,
      sourceUrl: assets.sourceUrl,
      licence: assets.licence,
      isActive: assets.isActive,
      createdAt: assets.createdAt,
      updatedAt: assets.updatedAt,
      usageCount
    })
    .from(assets)
    .leftJoin(caseAssets, eq(caseAssets.assetId, assets.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(assets.id)
    .having(usage === 'used' ? gt(usageCountExpression, 0) : usage === 'unused' ? eq(usageCountExpression, 0) : undefined)
    .orderBy(
      sort === 'oldest' ? asc(assets.createdAt) :
        sort === 'name-asc' ? asc(sql`lower(coalesce(${assets.originalFilename}, ''))`) :
          sort === 'name-desc' ? desc(sql`lower(coalesce(${assets.originalFilename}, ''))`) :
            sort === 'most-used' ? desc(usageCountExpression) :
              sort === 'least-used' ? asc(usageCountExpression) : desc(assets.createdAt),
      sort === 'name-asc' || sort === 'name-desc' ? (sort === 'name-asc' ? asc(assets.id) : desc(assets.id)) :
        sort === 'most-used' || sort === 'least-used' ? (sort === 'most-used' ? desc(assets.createdAt) : asc(assets.createdAt)) :
          sort === 'oldest' ? asc(assets.id) : desc(assets.id)
    );
  const usageRows = await listUsageRows(db);
  const topicsByAsset = new Map();
  for (const row of usageRows) {
    if (!row.conceptId || !row.conceptName) continue;
    const topics = topicsByAsset.get(row.assetId) ?? new Map();
    topics.set(row.conceptId, row.conceptName);
    topicsByAsset.set(row.assetId, topics);
  }

  return rows
    .map((asset) => {
      const topicNames = [...(topicsByAsset.get(asset.id)?.values() ?? [])];
      return {
        ...asset,
        imageUrl: asset.isActive ? getTeachingImageUrl(asset.id) : null,
        topicNames,
        topicSummary: topicSummary(topicNames)
      };
    });
}

/** @param {LearningDb} db @param {string} assetId */
export async function getAssetLibraryDetail(db, assetId) {
  const normalizedId = requiredText(assetId, 'Asset');
  const rows = await db.select().from(assets).where(eq(assets.id, normalizedId)).limit(1);
  const asset = rows[0];
  if (!asset) return null;

  const usages = (await listUsageRows(db)).filter((row) => row.assetId === asset.id);
  return {
    asset: {
      ...asset,
      imageUrl: asset.isActive ? getTeachingImageUrl(asset.id) : null,
      usageCount: usages.length
    },
    usages
  };
}

/**
 * Update only D1 Asset metadata. In particular, storageKey is deliberately not
 * accepted here, so renaming can never mutate the immutable R2 object identity.
 *
 * @param {LearningDb} db
 * @param {string} assetId
 * @param {{ originalFilename?: string | null, altText?: string | null, sourceLabel?: string | null, sourceUrl?: string | null, licence?: string | null, isActive?: boolean | string }} input
 */
export async function updateAssetMetadata(db, assetId, input) {
  const normalizedId = requiredText(assetId, 'Asset');
  const existing = await db.select({ id: assets.id }).from(assets).where(eq(assets.id, normalizedId)).limit(1);
  if (!existing[0]) throw new AssetLibraryInputError('The selected Asset no longer exists.');

  const update = {
    originalFilename: optionalText(input.originalFilename),
    altText: optionalText(input.altText),
    sourceLabel: optionalText(input.sourceLabel),
    sourceUrl: validateAssetSourceUrl(input.sourceUrl),
    licence: optionalText(input.licence),
    isActive: booleanValue(input.isActive),
    updatedAt: new Date()
  };
  await db.update(assets).set(update).where(eq(assets.id, normalizedId));
  return update;
}

/** @param {string} mimeType */
function extensionForType(mimeType) {
  return mimeType === 'image/png' ? 'png' : 'jpg';
}

/**
 * The Image Library upload path delegates the R2 write and all storage limits
 * to the existing protected teaching-image pipeline.
 *
 * @param {LearningDb} db
 * @param {R2Bucket} bucket
 * @param {Blob & { name?: string }} file
 * @param {{ originalFilename?: string | null, altText: string, sourceLabel?: string | null, sourceUrl?: string | null, licence?: string | null }} metadata
 */
export async function createAssetFromUpload(db, bucket, file, metadata) {
  if (!file || typeof file.type !== 'string' || typeof file.size !== 'number') {
    throw new AssetLibraryInputError('Choose a JPEG or PNG image to upload.');
  }

  try {
    assertSupportedImageType(file.type);
  } catch (error) {
    throw new AssetLibraryInputError(error instanceof Error ? error.message : 'Only JPEG and PNG teaching images are supported.');
  }

  const key = `teaching-images/${crypto.randomUUID()}.${extensionForType(file.type)}`;
  const originalFilename = optionalText(metadata.originalFilename) ?? optionalText(file.name);
  const altText = requiredText(metadata.altText, 'Alt text');
  const sourceUrl = validateAssetSourceUrl(metadata.sourceUrl);

  await putTeachingImage(bucket, key, file);

  const id = crypto.randomUUID();
  try {
    await db.insert(assets).values({
      id,
      type: 'image',
      storageKey: key,
      mimeType: file.type,
      originalFilename,
      altText,
      sourceLabel: optionalText(metadata.sourceLabel),
      sourceUrl,
      licence: optionalText(metadata.licence),
      isActive: true
    });
  } catch (error) {
    try {
      await deleteTeachingImage(bucket, key);
    } catch (cleanupError) {
      console.error('Unable to clean up orphaned teaching image after metadata failure.', { key, cleanupError });
    }
    throw error;
  }

  return { id, storageKey: key };
}
