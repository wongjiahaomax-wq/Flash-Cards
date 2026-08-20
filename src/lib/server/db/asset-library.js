import { and, asc, desc, eq, inArray, isNull, isNotNull, like, not, or, sql } from 'drizzle-orm';

import {
  deleteTeachingImage,
  getTeachingImageUrl,
  putTeachingImage,
  assertSupportedImageType
} from '../storage/media.js';
import { assets, caseAssets, caseConcepts, cases, concepts, imageCollections, stimulusGroupOptions, stimulusGroups } from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export const ASSET_LIBRARY_PAGE_SIZE = 60;
export const ASSET_LIBRARY_SELECT_ALL_LIMIT = 300;
export const ASSET_LIBRARY_COLLECTION_BULK_LIMIT = 30;

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
 * @returns {{ search: string, topic: string, collection: string, usage: 'all' | 'current' | 'historical' | 'unused', status: 'all' | 'active' | 'inactive', source: 'all' | 'known' | 'unknown', sort: 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'most-used' | 'least-used' | 'collection-asc' | 'collection-desc' | 'unsorted-first' }}
 */
export function parseAssetLibraryFilters(params) {
  const sortValue = params.get('sort');
  const usageValue = params.get('usage');
  const statusValue = params.get('status');
  const sourceValue = params.get('source');
  const collectionValue = params.get('collection')?.trim() ?? '';
  return {
    search: params.get('q')?.trim() ?? '',
    topic: params.get('topic')?.trim() ?? '',
    collection: collectionValue === 'unsorted' ? 'unsorted' : collectionValue,
    usage: usageValue === 'used' ? 'current' : usageValue === 'current' || usageValue === 'historical' || usageValue === 'unused' ? usageValue : 'all',
    status: statusValue === 'active' || statusValue === 'inactive' ? statusValue : 'all',
    source: sourceValue === 'known' || sourceValue === 'unknown' ? sourceValue : 'all',
    sort: sortValue === 'oldest' || sortValue === 'name-asc' || sortValue === 'name-desc' || sortValue === 'most-used' || sortValue === 'least-used' || sortValue === 'collection-asc' || sortValue === 'collection-desc' || sortValue === 'unsorted-first' ? sortValue : 'newest'
  };
}

/** @param {URLSearchParams | { get(name: string): string | null }} params */
export function parseAssetLibraryPage(params) {
  const raw = Number(params.get('page') ?? 1);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : 1;
}

/** @param {ReturnType<typeof parseAssetLibraryFilters>} filters */
export function assetLibraryQueryContext(filters) {
  return JSON.stringify({ q: filters.search, topic: filters.topic, collection: filters.collection, usage: filters.usage, status: filters.status, source: filters.source, sort: filters.sort });
}

/** @param {LearningDb} db */
export async function listAssetLibraryTopics(db) {
  return db.select({ id: concepts.id, name: concepts.name }).from(concepts).orderBy(asc(concepts.name), asc(concepts.id));
}

/** @param {LearningDb} db */
export async function listAssetLibraryCollections(db) {
  return db.select({
    id: imageCollections.id,
    name: imageCollections.name,
    assetCount: sql`(select count(*) from assets collection_assets where collection_assets.image_collection_id = ${imageCollections.id})`.mapWith(Number)
  })
    .from(imageCollections)
    .orderBy(asc(imageCollections.name), asc(imageCollections.id));
}

/** @param {LearningDb} db @param {string | null | undefined} name */
export async function createImageCollection(db, name) {
  const normalizedName = requiredText(name, 'Collection name');
  if (normalizedName.length > 200) throw new AssetLibraryInputError('Collection name must be 200 characters or fewer.');
  const existing = await db.select({ id: imageCollections.id }).from(imageCollections).where(eq(imageCollections.name, normalizedName)).limit(1);
  if (existing[0]) throw new AssetLibraryInputError('A Collection with that name already exists.');
  const id = crypto.randomUUID();
  try {
    await db.insert(imageCollections).values({ id, name: normalizedName });
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) throw new AssetLibraryInputError('A Collection with that name already exists.');
    throw error;
  }
  return { id, name: normalizedName };
}

/** @param {LearningDb} db @param {string} collectionId @param {string | null | undefined} name */
export async function renameImageCollection(db, collectionId, name) {
  const normalizedId = requiredText(collectionId, 'Collection');
  const normalizedName = requiredText(name, 'Collection name');
  if (normalizedName.length > 200) throw new AssetLibraryInputError('Collection name must be 200 characters or fewer.');
  const existing = await db.select({ id: imageCollections.id, name: imageCollections.name })
    .from(imageCollections)
    .where(eq(imageCollections.id, normalizedId))
    .limit(1);
  if (!existing[0]) throw new AssetLibraryInputError('The selected Collection no longer exists.');
  const duplicate = await db.select({ id: imageCollections.id })
    .from(imageCollections)
    .where(and(eq(imageCollections.name, normalizedName), not(eq(imageCollections.id, normalizedId))))
    .limit(1);
  if (duplicate[0]) throw new AssetLibraryInputError('A Collection with that name already exists.');
  try {
    await db.update(imageCollections).set({ name: normalizedName, updatedAt: new Date() }).where(eq(imageCollections.id, normalizedId));
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) throw new AssetLibraryInputError('A Collection with that name already exists.');
    throw error;
  }
  return { id: normalizedId, previousName: existing[0].name, name: normalizedName };
}

/** @param {LearningDb} db @param {string} collectionId */
export async function deleteImageCollection(db, collectionId) {
  const normalizedId = requiredText(collectionId, 'Collection');
  const existing = await db.select({ id: imageCollections.id, name: imageCollections.name })
    .from(imageCollections)
    .where(eq(imageCollections.id, normalizedId))
    .limit(1);
  if (!existing[0]) throw new AssetLibraryInputError('The selected Collection no longer exists.');
  const countRows = await db.select({ count: sql`count(*)`.mapWith(Number) })
    .from(assets)
    .where(eq(assets.imageCollectionId, normalizedId));
  const assetCount = Number(countRows[0]?.count ?? 0);
  const detachAssets = db.update(assets)
    .set({ imageCollectionId: null, updatedAt: new Date() })
    .where(eq(assets.imageCollectionId, normalizedId));
  const deleteCollection = db.delete(imageCollections).where(eq(imageCollections.id, normalizedId));
  if (typeof db.batch === 'function') await db.batch([detachAssets, deleteCollection]);
  else {
    await detachAssets;
    await deleteCollection;
  }
  return { id: normalizedId, name: existing[0].name, assetCount };
}

// Count distinct active production Cases currently using an active Asset. This
// matches learner eligibility: fixed relationships need an active Case, while
// alternatives also need an active group and active, non-removed option. This is one scalar correlated
// subquery over cases, which SQLite supports reliably; the nested EXISTS clauses
// avoid the unsupported "outer reference inside derived UNION table" pattern.
const usageCountExpr = sql`(
  select count(*)
  from cases usage_case
  where usage_case.preview_session_id is null
    and usage_case.is_active = true
    and ${assets.isActive} = true
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
          and usage_sg.is_active = true
          and usage_sgo.is_active = true
          and usage_sgo.removed_from_case = false
      )
    )
)`;

const currentUseExpr = sql`exists (
  select 1 from cases usage_case
  where usage_case.preview_session_id is null
    and usage_case.is_active = true
    and ${assets.isActive} = true
    and (
      exists (select 1 from case_assets usage_ca where usage_ca.case_id = usage_case.id and usage_ca.asset_id = ${assets.id})
      or exists (
        select 1
        from stimulus_group_options usage_sgo
        join stimulus_groups usage_sg on usage_sg.id = usage_sgo.stimulus_group_id
        where usage_sg.case_id = usage_case.id and usage_sgo.asset_id = ${assets.id}
          and usage_sg.is_active = true and usage_sgo.is_active = true
          and usage_sgo.removed_from_case = false
      )
    )
)`;

// Any retained production relationship or provenance that would make deletion
// unsafe. Current relationships deliberately satisfy this too; the derived
// Historical-only state adds NOT currentUseExpr.
const retainedHistoryExpr = sql`(
  exists (
    select 1 from case_assets history_ca
    join cases history_case on history_case.id = history_ca.case_id
    where history_ca.asset_id = ${assets.id}
      and history_case.preview_session_id is null
  )
  or exists (
    select 1 from stimulus_group_options history_sgo
    join stimulus_groups history_sg on history_sg.id = history_sgo.stimulus_group_id
    join cases history_case on history_case.id = history_sg.case_id
    where history_sgo.asset_id = ${assets.id}
      and history_case.preview_session_id is null
  )
  or exists (select 1 from review_assets history_ra where history_ra.asset_id = ${assets.id})
  or exists (select 1 from asset_questions history_aq where history_aq.asset_id = ${assets.id})
  or ${assets.supersededByAssetId} is not null
  or exists (select 1 from assets history_predecessor where history_predecessor.superseded_by_asset_id = ${assets.id})
)`;

const historicalOnlyExpr = sql`not (${currentUseExpr}) and ${retainedHistoryExpr}`;
const unusedExpr = sql`not (${currentUseExpr}) and not (${retainedHistoryExpr})`;
const historicalReviewCountExpr = sql`(
  select count(distinct history_ra.review_id)
  from review_assets history_ra
  where history_ra.asset_id = ${assets.id}
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
  if (filters.usage === 'current') conditions.push(currentUseExpr);
  if (filters.usage === 'historical') conditions.push(historicalOnlyExpr);
  if (filters.usage === 'unused') conditions.push(unusedExpr);
  if (filters.topic) {
    conditions.push(sql`(
      exists (
        select 1
        from case_assets topic_ca
        join cases topic_case on topic_case.id = topic_ca.case_id
        join case_concepts topic_cc on topic_cc.case_id = topic_ca.case_id and topic_cc.role = 'primary'
        where topic_ca.asset_id = ${assets.id}
          and topic_case.preview_session_id is null
          and topic_case.is_active = true
          and ${assets.isActive} = true
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
          and topic_case.is_active = true
          and topic_cc.concept_id = ${filters.topic}
          and topic_sg.is_active = true
          and topic_sgo.is_active = true
          and ${assets.isActive} = true
          and topic_sgo.removed_from_case = false
      )
    )`);
  }
  if (filters.collection === 'unsorted') conditions.push(isNull(assets.imageCollectionId));
  else if (filters.collection) conditions.push(eq(assets.imageCollectionId, filters.collection));
  return conditions;
}

const collectionNameExpr = sql`(select collection_sort.name from image_collections collection_sort where collection_sort.id = ${assets.imageCollectionId})`;

/** @param {ReturnType<typeof parseAssetLibraryFilters>['sort']} sort */
function libraryOrder(sort) {
  if (sort === 'oldest') return [asc(assets.createdAt), asc(assets.id)];
  if (sort === 'name-asc') return [asc(assets.originalFilename), asc(assets.id)];
  if (sort === 'name-desc') return [desc(assets.originalFilename), desc(assets.id)];
  if (sort === 'most-used') return [desc(usageCountExpr), desc(assets.createdAt), desc(assets.id)];
  if (sort === 'least-used') return [asc(usageCountExpr), asc(assets.createdAt), asc(assets.id)];
  if (sort === 'collection-asc') return [sql`case when ${assets.imageCollectionId} is null then 1 else 0 end`, asc(collectionNameExpr), asc(assets.id)];
  if (sort === 'collection-desc') return [sql`case when ${assets.imageCollectionId} is null then 1 else 0 end`, desc(collectionNameExpr), desc(assets.id)];
  if (sort === 'unsorted-first') return [sql`case when ${assets.imageCollectionId} is null then 0 else 1 end`, asc(collectionNameExpr), asc(assets.id)];
  return [desc(assets.createdAt), desc(assets.id)];
}

/** @param {LearningDb} db @param {string[]} assetIds */
async function listUsageRows(db, assetIds) {
  if (!assetIds.length) return [];
  const fixedRows = await db.select({ assetId: caseAssets.assetId, caseId: cases.id, caseTitle: cases.title, caseIsActive: cases.isActive, captionMd: caseAssets.captionMd, displayOrder: caseAssets.displayOrder, conceptId: caseConcepts.conceptId, conceptName: concepts.name, stimulusGroupId: sql`null`.as('stimulus_group_id'), stimulusGroupName: sql`null`.as('stimulus_group_name'), stimulusOptionId: sql`null`.as('stimulus_option_id') })
    .from(caseAssets).innerJoin(cases, eq(cases.id, caseAssets.caseId)).innerJoin(assets, eq(assets.id, caseAssets.assetId)).leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary'))).leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(and(isNull(cases.previewSessionId), eq(cases.isActive, true), eq(assets.isActive, true), inArray(caseAssets.assetId, assetIds))).orderBy(asc(cases.title), asc(caseAssets.displayOrder), asc(cases.id));
  const groupedRows = await db.select({ assetId: stimulusGroupOptions.assetId, caseId: cases.id, caseTitle: cases.title, caseIsActive: cases.isActive, captionMd: stimulusGroupOptions.captionMd, displayOrder: stimulusGroupOptions.displayOrder, conceptId: caseConcepts.conceptId, conceptName: concepts.name, stimulusGroupId: stimulusGroups.id, stimulusGroupName: stimulusGroups.name, stimulusOptionId: stimulusGroupOptions.id })
    .from(stimulusGroupOptions).innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId)).innerJoin(cases, eq(cases.id, stimulusGroups.caseId)).innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId)).leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary'))).leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(and(isNull(cases.previewSessionId), eq(cases.isActive, true), eq(stimulusGroups.isActive, true), eq(stimulusGroupOptions.isActive, true), eq(assets.isActive, true), inArray(stimulusGroupOptions.assetId, assetIds), eq(stimulusGroupOptions.removedFromCase, false))).orderBy(asc(cases.title), asc(stimulusGroupOptions.displayOrder), asc(cases.id));
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
    collectionId: assets.imageCollectionId,
    collectionName: imageCollections.name,
    isActive: assets.isActive,
    hasCurrentUsage: currentUseExpr.mapWith(Boolean),
    hasRetainedHistory: retainedHistoryExpr.mapWith(Boolean),
    historicalReviewCount: historicalReviewCountExpr.mapWith(Number),
    createdAt: assets.createdAt,
    updatedAt: assets.updatedAt
  }).from(assets).leftJoin(imageCollections, eq(assets.imageCollectionId, imageCollections.id)).where(where).orderBy(...libraryOrder(filters.sort)).limit(pageSize).offset((page - 1) * pageSize);
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
    /** @type {'current' | 'historical' | 'unused'} */
    const usageState = asset.hasCurrentUsage ? 'current' : asset.hasRetainedHistory ? 'historical' : 'unused';
    return {
      ...asset,
      usageCount: usageCasesByAsset.get(asset.id)?.size ?? 0,
      usageState,
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

/**
 * Backwards-compatible unpaged helper retained for legacy callers/tests.
 * @param {LearningDb} db
 * @param {Partial<ReturnType<typeof parseAssetLibraryFilters>>} [filters]
 */
export async function listAssetLibrary(db, filters = {}) {
  const normalized = { search: String(filters.search ?? '').trim(), topic: String(filters.topic ?? '').trim(), collection: String(filters.collection ?? '').trim(), usage: filters.usage ?? 'all', status: filters.status ?? 'all', source: filters.source ?? 'all', sort: filters.sort ?? 'newest' };
  const first = await getAssetLibraryPage(db, normalized, { page: 1, pageSize: ASSET_LIBRARY_PAGE_SIZE });
  const rows = [...first.rows];
  for (let page = 2; page <= first.totalPages; page += 1) rows.push(...(await getAssetLibraryPage(db, normalized, { page, pageSize: ASSET_LIBRARY_PAGE_SIZE })).rows);
  return rows;
}

/** @param {LearningDb} db @param {string} assetId */
export async function getAssetLibraryDetail(db, assetId) {
  const normalizedId = requiredText(assetId, 'Asset');
  const rows = await db.select({
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
    collectionName: imageCollections.name,
    previewSessionId: assets.previewSessionId,
    isActive: assets.isActive,
    createdAt: assets.createdAt,
    updatedAt: assets.updatedAt
  }).from(assets).leftJoin(imageCollections, eq(assets.imageCollectionId, imageCollections.id)).where(and(eq(assets.id, normalizedId), isNull(assets.previewSessionId))).limit(1);
  const asset = rows[0];
  if (!asset) return null;
  const usages = await listUsageRows(db, [asset.id]);
  return { asset: { ...asset, imageUrl: asset.isActive ? getTeachingImageUrl(asset.id) : null, usageCount: new Set(usages.map((usage) => usage.caseId)).size }, usages };
}

/**
 * Update only D1 Asset metadata. In particular, storageKey is deliberately not
 * accepted here, so renaming can never mutate the immutable R2 object identity.
 * Preview-owned Assets are not valid normal Admin mutation targets.
 *
 * @param {LearningDb} db
 * @param {string} assetId
 * @param {{ originalFilename?: string | null, altText?: string | null, sourceLabel?: string | null, sourceUrl?: string | null, licence?: string | null, imageCollectionId?: string | null, isActive?: boolean | string }} input
 */
export async function updateAssetMetadata(db, assetId, input) {
  const normalizedId = requiredText(assetId, 'Asset');
  const existing = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.id, normalizedId), isNull(assets.previewSessionId))).limit(1);
  if (!existing[0]) throw new AssetLibraryInputError('The selected production Asset no longer exists.');
  const imageCollectionId = optionalText(input.imageCollectionId);
  await validateCollection(db, imageCollectionId);
  const update = { originalFilename: optionalText(input.originalFilename), altText: optionalText(input.altText), sourceLabel: optionalText(input.sourceLabel), sourceUrl: validateAssetSourceUrl(input.sourceUrl), licence: optionalText(input.licence), imageCollectionId, isActive: booleanValue(input.isActive), updatedAt: new Date() };
  await db.update(assets).set(update).where(and(eq(assets.id, normalizedId), isNull(assets.previewSessionId)));
  return update;
}

/** @param {LearningDb} db @param {string | null} collectionId */
async function validateCollection(db, collectionId) {
  if (!collectionId) return;
  const rows = await db.select({ id: imageCollections.id }).from(imageCollections).where(eq(imageCollections.id, collectionId)).limit(1);
  if (!rows[0]) throw new AssetLibraryInputError('The selected Collection does not exist.');
}

/**
 * Replace the Collection assignment for a bounded production Asset batch.
 * A null target deliberately means Unsorted; Preview-owned Assets are never
 * valid mutation targets.
 * @param {LearningDb} db
 * @param {string[]} assetIds
 * @param {string | null | undefined} collectionId
 */
export async function setAssetCollection(db, assetIds, collectionId) {
  const uniqueIds = [...new Set(assetIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (!uniqueIds.length) throw new AssetLibraryInputError('Select at least one Asset.');
  if (uniqueIds.length > ASSET_LIBRARY_COLLECTION_BULK_LIMIT) throw new AssetLibraryInputError(`Collection updates are limited to ${ASSET_LIBRARY_COLLECTION_BULK_LIMIT} Assets per request.`);
  const normalizedCollectionId = optionalText(collectionId);
  await validateCollection(db, normalizedCollectionId);
  const existing = await db.select({ id: assets.id }).from(assets).where(and(isNull(assets.previewSessionId), inArray(assets.id, uniqueIds)));
  if (existing.length !== uniqueIds.length) throw new AssetLibraryInputError('One or more selected production Assets no longer exist.');
  await db.update(assets).set({ imageCollectionId: normalizedCollectionId, updatedAt: new Date() }).where(and(isNull(assets.previewSessionId), inArray(assets.id, uniqueIds)));
  return { updatedCount: uniqueIds.length, collectionId: normalizedCollectionId };
}

/** @param {string} mimeType */
function extensionForType(mimeType) { return mimeType === 'image/png' ? 'png' : 'jpg'; }

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
