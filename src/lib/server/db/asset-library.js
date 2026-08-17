import { and, asc, desc, eq, inArray, isNull, isNotNull, like, not, or, sql } from 'drizzle-orm';

import {
  deleteTeachingImage,
  getTeachingImageUrl,
  putTeachingImage,
  assertSupportedImageType
} from '../storage/media.js';
import { assets, caseAssets, caseConcepts, cases, concepts, stimulusGroupOptions, stimulusGroups } from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export const ASSET_LIBRARY_PAGE_SIZE = 60;
export const ASSET_LIBRARY_SELECT_ALL_LIMIT = 300;

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
  try { parsed = new URL(text); } catch { throw new AssetLibraryInputError('Source URL must be a valid http(s) URL.'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new AssetLibraryInputError('Source URL must be a valid http(s) URL.');
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

/** @param {URLSearchParams | { get(name: string): string | null }} params */
export function parseAssetLibraryPage(params) {
  const raw = Number(params.get('page') ?? 1);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : 1;
}

/** @param {ReturnType<typeof parseAssetLibraryFilters>} filters */
export function assetLibraryQueryContext(filters) {
  return JSON.stringify({ q: filters.search, topic: filters.topic, usage: filters.usage, status: filters.status, source: filters.source, sort: filters.sort });
}

/** @param {LearningDb} db */
export async function listAssetLibraryTopics(db) {
  return db.select({ id: concepts.id, name: concepts.name }).from(concepts).orderBy(asc(concepts.name), asc(concepts.id));
}

// Count distinct production Cases using an Asset. This is one scalar correlated
// subquery over cases, which SQLite supports reliably; the nested EXISTS clauses
// avoid the unsupported "outer reference inside derived UNION table" pattern.
const usageCountExpr = sql`(
  select count(*)
  from cases usage_case
  where usage_case.preview_session_id is null
    and (
      exists (
        select 1 from case_assets usage_ca
        where usage_ca.case_id = usage_case.id
          and usage_ca.asset_id = ${assets.id}
      )
      or exists (
        select 1
        from stimulus_group_options usage_sgo
        join stimulus_groups usage_sg on usage_sg.id = usage_sgo.stimulus_group_id
        where usage_sg.case_id = usage_case.id
          and usage_sgo.asset_id = ${assets.id}
      )
    )
)`;

const usedExpr = sql`exists (
  select 1 from cases usage_case
  where usage_case.preview_session_id is null
    and (
      exists (select 1 from case_assets usage_ca where usage_ca.case_id = usage_case.id and usage_ca.asset_id = ${assets.id})
      or exists (
        select 1 from stimulus_group_options usage_sgo
        join stimulus_groups usage_sg on usage_sg.id = usage_sgo.stimulus_group_id
        where usage_sg.case_id = usage_case.id and usage_sgo.asset_id = ${assets.id}
      )
    )
)`;

/** @param {ReturnType<typeof parseAssetLibraryFilters>} filters */
function libraryConditions(filters) {
  const conditions = [isNull(assets.previewSessionId)];
  const search = filters.search;
  if (search) {
    const pattern = `%${search}%`;
    const condition = or(like(assets.originalFilename, pattern), like(assets.altText, pattern), like(assets.sourceLabel, pattern), like(assets.sourceUrl, pattern));
    if (condition) conditions.push(condition);
  }
  if (filters.status === 'active') conditions.push(eq(assets.isActive, true));
  if (filters.status === 'inactive') conditions.push(eq(assets.isActive, false));
  if (filters.source === 'known') {
    const condition = or(isNotNull(assets.sourceLabel), isNotNull(assets.sourceUrl), isNotNull(assets.licence));
    if (condition) conditions.push(condition);
  }
  if (filters.source === 'unknown') {
    const condition = and(isNull(assets.sourceLabel), isNull(assets.sourceUrl), isNull(assets.licence));
    if (condition) conditions.push(condition);
  }
  if (filters.usage === 'used') conditions.push(usedExpr);
  if (filters.usage === 'unused') conditions.push(not(usedExpr));
  if (filters.topic) {
    conditions.push(sql`(
      exists (
        select 1
        from case_assets topic_ca
        join cases topic_case on topic_case.id = topic_ca.case_id
        join case_concepts topic_cc on topic_cc.case_id = topic_ca.case_id and topic_cc.role = 'primary'
        where topic_ca.asset_id = ${assets.id}
          and topic_case.preview_session_id is null
          and topic_cc.concept_id = ${filters.topic}
      )
      or exists (
        select 1
        from stimulus_group_options topic_sgo
        join stimulus_groups topic_sg on topic_sg.id = topic_sgo.stimulus_group_id
        join cases topic_case on topic_case.id = topic_sg.case_id
        join case_concepts topic_cc on topic_cc.case_id = topic_sg.case_id and topic_cc.role = 'primary'
        where topic_sgo.asset_id = ${assets.id}
          and topic_case.preview_session_id is null
          and topic_cc.concept_id = ${filters.topic}
      )
    )`);
  }
  return conditions;
}

/** @param {ReturnType<typeof parseAssetLibraryFilters>['sort']} sort */
function libraryOrder(sort) {
  if (sort === 'oldest') return [asc(assets.createdAt), asc(assets.id)];
  if (sort === 'name-asc') return [asc(assets.originalFilename), asc(assets.id)];
  if (sort === 'name-desc') return [desc(assets.originalFilename), desc(assets.id)];
  if (sort === 'most-used') return [desc(usageCountExpr), desc(assets.createdAt), desc(assets.id)];
  if (sort === 'least-used') return [asc(usageCountExpr), asc(assets.createdAt), asc(assets.id)];
  return [desc(assets.createdAt), desc(assets.id)];
}

/** @param {LearningDb} db @param {string[]} assetIds */
async function listUsageRows(db, assetIds) {
  if (!assetIds.length) return [];
  const fixedRows = await db.select({ assetId: caseAssets.assetId, caseId: cases.id, caseTitle: cases.title, caseIsActive: cases.isActive, captionMd: caseAssets.captionMd, displayOrder: caseAssets.displayOrder, conceptId: caseConcepts.conceptId, conceptName: concepts.name, stimulusGroupName: sql`null`.as('stimulus_group_name') })
    .from(caseAssets).innerJoin(cases, eq(cases.id, caseAssets.caseId)).leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary'))).leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(and(isNull(cases.previewSessionId), inArray(caseAssets.assetId, assetIds))).orderBy(asc(cases.title), asc(caseAssets.displayOrder), asc(cases.id));
  const groupedRows = await db.select({ assetId: stimulusGroupOptions.assetId, caseId: cases.id, caseTitle: cases.title, caseIsActive: cases.isActive, captionMd: stimulusGroupOptions.captionMd, displayOrder: stimulusGroupOptions.displayOrder, conceptId: caseConcepts.conceptId, conceptName: concepts.name, stimulusGroupId: stimulusGroups.id, stimulusGroupName: stimulusGroups.name, stimulusOptionId: stimulusGroupOptions.id })
    .from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).innerJoin(cases, eq(cases.id, stimulusGroups.caseId)).leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary'))).leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(and(isNull(cases.previewSessionId), inArray(stimulusGroupOptions.assetId, assetIds))).orderBy(asc(cases.title), asc(stimulusGroupOptions.displayOrder), asc(cases.id));
  return [...fixedRows, ...groupedRows];
}

/** @param {string[]} names */
function topicSummary(names) { return names.length <= 2 ? names.join(' · ') : `${names.slice(0, 2).join(' · ')} +${names.length - 2}`; }

/**
 * Server-backed Image Library query. Only one bounded page of Asset rows is
 * loaded for rendering; total count and all-matching IDs use bounded SQL.
 * @param {LearningDb} db
 * @param {ReturnType<typeof parseAssetLibraryFilters>} filters
 * @param {{ page?: number, pageSize?: number, includeAllMatchingIds?: boolean }} [options]
 */
export async function getAssetLibraryPage(db, filters, options = {}) {
  const pageSize = Math.max(1, Math.min(Number(options.pageSize ?? ASSET_LIBRARY_PAGE_SIZE), ASSET_LIBRARY_PAGE_SIZE));
  const requestedPage = Math.max(1, Number(options.page ?? 1) || 1);
  const where = and(...libraryConditions(filters));
  const countRows = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(assets).where(where);
  const totalCount = Number(countRows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const rawRows = await db.select({
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
    updatedAt: assets.updatedAt
  }).from(assets).where(where).orderBy(...libraryOrder(filters.sort)).limit(pageSize).offset((page - 1) * pageSize);
  const ids = rawRows.map((row) => row.id);
  const usageRows = await listUsageRows(db, ids);
  const usageCasesByAsset = new Map();
  const topicsByAsset = new Map();
  for (const row of usageRows) {
    const usageCases = usageCasesByAsset.get(row.assetId) ?? new Set();
    usageCases.add(row.caseId);
    usageCasesByAsset.set(row.assetId, usageCases);
    if (!row.conceptId || !row.conceptName) continue;
    const topics = topicsByAsset.get(row.assetId) ?? new Map();
    topics.set(row.conceptId, row.conceptName);
    topicsByAsset.set(row.assetId, topics);
  }
  const rows = rawRows.map((asset) => {
    const topicNames = [...(topicsByAsset.get(asset.id)?.values() ?? [])];
    return {
      ...asset,
      usageCount: usageCasesByAsset.get(asset.id)?.size ?? 0,
      imageUrl: asset.isActive ? getTeachingImageUrl(asset.id) : null,
      topicNames,
      topicSummary: topicSummary(topicNames)
    };
  });
  let allMatchingIds = null;
  if (options.includeAllMatchingIds && totalCount <= ASSET_LIBRARY_SELECT_ALL_LIMIT) {
    allMatchingIds = (await db.select({ id: assets.id }).from(assets).where(where).orderBy(...libraryOrder(filters.sort)).limit(ASSET_LIBRARY_SELECT_ALL_LIMIT)).map((row) => row.id);
  }
  return { rows, totalCount, totalPages, page, pageSize, requestedPage, allMatchingIds };
}

/** Backwards-compatible unpaged helper retained for legacy callers/tests. */
export async function listAssetLibrary(db, filters = {}) {
  const normalized = { search: String(filters.search ?? '').trim(), topic: String(filters.topic ?? '').trim(), usage: filters.usage ?? 'all', status: filters.status ?? 'all', source: filters.source ?? 'all', sort: filters.sort ?? 'newest' };
  const first = await getAssetLibraryPage(db, normalized, { page: 1, pageSize: ASSET_LIBRARY_PAGE_SIZE });
  const rows = [...first.rows];
  for (let page = 2; page <= first.totalPages; page += 1) rows.push(...(await getAssetLibraryPage(db, normalized, { page, pageSize: ASSET_LIBRARY_PAGE_SIZE })).rows);
  return rows;
}

/** @param {LearningDb} db @param {string} assetId */
export async function getAssetLibraryDetail(db, assetId) {
  const normalizedId = requiredText(assetId, 'Asset');
  const rows = await db.select().from(assets).where(and(eq(assets.id, normalizedId), isNull(assets.previewSessionId))).limit(1);
  const asset = rows[0];
  if (!asset) return null;
  const usages = await listUsageRows(db, [asset.id]);
  return { asset: { ...asset, imageUrl: asset.isActive ? getTeachingImageUrl(asset.id) : null, usageCount: new Set(usages.map((usage) => usage.caseId)).size }, usages };
}

export async function updateAssetMetadata(db, assetId, input) {
  const normalizedId = requiredText(assetId, 'Asset');
  const existing = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, normalizedId), isNull(assets.previewSessionId))).limit(1);
  if (!existing[0]) throw new AssetLibraryInputError('The selected production Asset no longer exists.');
  const update = { originalFilename: optionalText(input.originalFilename), altText: optionalText(input.altText), sourceLabel: optionalText(input.sourceLabel), sourceUrl: validateAssetSourceUrl(input.sourceUrl), licence: optionalText(input.licence), isActive: booleanValue(input.isActive), updatedAt: new Date() };
  await db.update(assets).set(update).where(and(eq(assets.id, normalizedId), isNull(assets.previewSessionId)));
  return update;
}

/** @param {string} mimeType */
function extensionForType(mimeType) { return mimeType === 'image/png' ? 'png' : 'jpg'; }

export async function createAssetFromUpload(db, bucket, file, metadata) {
  if (!file || typeof file.type !== 'string' || typeof file.size !== 'number') throw new AssetLibraryInputError('Choose a JPEG or PNG image to upload.');
  try { assertSupportedImageType(file.type); } catch (error) { throw new AssetLibraryInputError(error instanceof Error ? error.message : 'Only JPEG and PNG teaching images are supported.'); }
  const key = `teaching-images/${crypto.randomUUID()}.${extensionForType(file.type)}`;
  const originalFilename = optionalText(metadata.originalFilename) ?? optionalText(file.name);
  const altText = requiredText(metadata.altText, 'Alt text');
  const sourceUrl = validateAssetSourceUrl(metadata.sourceUrl);
  await putTeachingImage(bucket, key, file);
  const id = crypto.randomUUID();
  try {
    await db.insert(assets).values({ id, type: 'image', storageKey: key, mimeType: file.type, originalFilename, altText, sourceLabel: optionalText(metadata.sourceLabel), sourceUrl, licence: optionalText(metadata.licence), isActive: true });
  } catch (error) {
    try { await deleteTeachingImage(bucket, key); } catch (cleanupError) { console.error('Unable to clean up orphaned teaching image after metadata failure.', { key, cleanupError }); }
    throw error;
  }
  return { id, storageKey: key };
}