import { and, asc, desc, eq, isNull, isNotNull, like, or } from 'drizzle-orm';

import {
  deleteTeachingImage,
  getTeachingImageUrl,
  putTeachingImage,
  assertSupportedImageType
} from '../storage/media.js';
import { assets, caseAssets, cases } from './schema.js';

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
 * @returns {{ search: string, usage: 'all' | 'used' | 'unused', status: 'all' | 'active' | 'inactive', source: 'all' | 'known' | 'unknown' }}
 */
export function parseAssetLibraryFilters(params) {
  const usageValue = params.get('usage');
  const statusValue = params.get('status');
  const sourceValue = params.get('source');

  return {
    search: params.get('q')?.trim() ?? '',
    usage: usageValue === 'used' || usageValue === 'unused' ? usageValue : 'all',
    status: statusValue === 'active' || statusValue === 'inactive' ? statusValue : 'all',
    source: sourceValue === 'known' || sourceValue === 'unknown' ? sourceValue : 'all'
  };
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
      displayOrder: caseAssets.displayOrder
    })
    .from(caseAssets)
    .innerJoin(cases, eq(cases.id, caseAssets.caseId))
    .orderBy(asc(cases.title), asc(caseAssets.displayOrder), asc(cases.id));
}

/** @param {ReturnType<typeof listUsageRows> extends Promise<infer T> ? T : never} rows */
function groupUsageRows(rows) {
  /** @type {Map<string, any[]>} */
  const grouped = new Map();
  for (const row of rows) {
    const current = grouped.get(row.assetId) ?? [];
    current.push(row);
    grouped.set(row.assetId, current);
  }
  return grouped;
}

/**
 * @param {LearningDb} db
 * @param {{ search?: string, usage?: 'all' | 'used' | 'unused', status?: 'all' | 'active' | 'inactive', source?: 'all' | 'known' | 'unknown' }} [filters]
 */
export async function listAssetLibrary(db, filters = {}) {
  const search = String(filters.search ?? '').trim();
  const usage = filters.usage ?? 'all';
  const status = filters.status ?? 'all';
  const source = filters.source ?? 'all';
  const conditions = [];

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

  const rows = await db
    .select()
    .from(assets)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(assets.createdAt), desc(assets.id));
  const usageRows = await listUsageRows(db);
  const grouped = groupUsageRows(usageRows);

  return rows
    .map((asset) => {
      const usages = grouped.get(asset.id) ?? [];
      return {
        ...asset,
        imageUrl: asset.isActive ? getTeachingImageUrl(asset.id) : null,
        usageCount: usages.length
      };
    })
    .filter((asset) => usage === 'used' ? asset.usageCount > 0 : usage === 'unused' ? asset.usageCount === 0 : true);
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
