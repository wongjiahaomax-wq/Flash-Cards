import { and, asc, desc, eq, like } from 'drizzle-orm';

import { assets, caseAssets, caseConcepts, cases, concepts, stimulusGroupOptions, stimulusGroups } from './schema.js';
import { listCaseTopics } from './admin-content.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class CaseAssetInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'CaseAssetInputError';
  }
}

/** @param {App.Locals['user']} user */
export function canManageCaseAssets(user) {
  return String(user?.role ?? '')
    .split(',')
    .map((role) => role.trim())
    .includes('admin');
}

/** @param {LearningDb} db @param {string} [search] */
export async function listAdminCases(db, search = '') {
  const cleanSearch = search.trim();
  return db
    .select({
      id: cases.id,
      title: cases.title,
      vignetteMd: cases.vignetteMd,
      conceptId: caseConcepts.conceptId,
      conceptName: concepts.name
    })
    .from(cases)
    .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
    .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(cleanSearch ? and(eq(cases.isActive, true), like(cases.title, `%${cleanSearch}%`)) : eq(cases.isActive, true))
    .orderBy(asc(cases.title));
}

/** @param {LearningDb} db @param {string} caseId */
async function requireActiveCase(db, caseId) {
  const rows = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.isActive, true)))
    .limit(1);
  if (!rows[0]) throw new CaseAssetInputError('The selected Case is missing or inactive.');
}

/** @param {LearningDb} db @param {string} assetId */
async function requireActiveAsset(db, assetId) {
  const rows = await db
    .select({ id: assets.id, type: assets.type })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.isActive, true)))
    .limit(1);
  if (!rows[0]) throw new CaseAssetInputError('The selected Asset is missing or inactive.');
  if (rows[0].type !== 'image') throw new CaseAssetInputError('Only image Assets can be attached to a Case.');
}

/** @param {LearningDb} db @param {string} caseId */
async function attachedRows(db, caseId) {
  return db
    .select({
      caseId: caseAssets.caseId,
      assetId: caseAssets.assetId,
      displayOrder: caseAssets.displayOrder,
      captionMd: caseAssets.captionMd,
      assetType: assets.type,
      storageKey: assets.storageKey,
      mimeType: assets.mimeType,
      originalFilename: assets.originalFilename,
      altText: assets.altText,
      sourceLabel: assets.sourceLabel,
      sourceUrl: assets.sourceUrl,
      licence: assets.licence,
      isActive: assets.isActive
    })
    .from(caseAssets)
    .innerJoin(assets, eq(assets.id, caseAssets.assetId))
    .where(eq(caseAssets.caseId, caseId))
    .orderBy(asc(caseAssets.displayOrder));
}

/** @param {LearningDb} db @param {string} caseId */
export async function getAdminCaseData(db, caseId) {
  const caseRows = await listAdminCases(db);
  const selectedCase = caseRows.find((item) => item.id === caseId);
  if (!selectedCase) return null;
  const settings = (await db.select({ questionSelectionMode: cases.questionSelectionMode, questionCount: cases.questionCount }).from(cases).where(eq(cases.id, caseId)).limit(1))[0];
  const topics = await listCaseTopics(db, caseId);
  const primaryTopic = topics.find((topic) => topic.role === 'primary');

  const attached = await attachedRows(db, caseId);
  const attachedIds = new Set(attached.map((asset) => asset.assetId));
  const groupedRows = await db
    .select({ assetId: stimulusGroupOptions.assetId })
    .from(stimulusGroupOptions)
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .where(eq(stimulusGroups.caseId, caseId));
  const groupedIds = new Set(groupedRows.map((row) => row.assetId));
  const available = await db
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
      isActive: assets.isActive
    })
    .from(assets)
    .where(eq(assets.isActive, true))
    .orderBy(desc(assets.createdAt));

  return {
    case: {
      ...selectedCase,
      ...settings,
      conceptId: primaryTopic?.id ?? selectedCase.conceptId ?? null,
      conceptName: primaryTopic?.name ?? selectedCase.conceptName ?? null
    },
    topics,
    attached,
    available: available.filter((asset) => !attachedIds.has(asset.assetId) && !groupedIds.has(asset.assetId))
  };
}

/** @param {LearningDb} db @param {string} caseId @param {string} assetId @param {string | null} captionMd */
export async function attachAssetToCase(db, caseId, assetId, captionMd = null) {
  await requireActiveCase(db, caseId);
  await requireActiveAsset(db, assetId);

  const existing = await db
    .select({ assetId: caseAssets.assetId })
    .from(caseAssets)
    .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)))
    .limit(1);
  if (existing[0]) throw new CaseAssetInputError('That Asset is already attached to this Case.');
  const grouped = await db
    .select({ id: stimulusGroupOptions.id })
    .from(stimulusGroupOptions)
    .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
    .where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusGroupOptions.assetId, assetId)))
    .limit(1);
  if (grouped[0]) throw new CaseAssetInputError('That Asset is already an option in this Case.');

  const last = await db
    .select({ displayOrder: caseAssets.displayOrder })
    .from(caseAssets)
    .where(eq(caseAssets.caseId, caseId))
    .orderBy(desc(caseAssets.displayOrder))
    .limit(1);

  try {
    await db.insert(caseAssets).values({
      caseId,
      assetId,
      displayOrder: (last[0]?.displayOrder ?? -1) + 1,
      captionMd: normalizeCaption(captionMd)
    });
  } catch (error) {
    if (error instanceof Error && /unique|constraint/i.test(error.message)) {
      throw new CaseAssetInputError('That Asset is already attached to this Case.');
    }
    throw error;
  }
}

/** @param {LearningDb} db @param {string} caseId @param {string} assetId */
export async function detachAssetFromCase(db, caseId, assetId) {
  await requireActiveCase(db, caseId);
  await requireActiveAsset(db, assetId);
  const rows = await attachedRows(db, caseId);
  if (!rows.some((row) => row.assetId === assetId)) {
    throw new CaseAssetInputError('That Asset is not attached to this Case.');
  }

  await db.delete(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)));
  await normalizeOrder(db, caseId);
}

/** @param {LearningDb} db @param {string} caseId @param {string} assetId @param {string | null} captionMd */
export async function updateCaseAssetCaption(db, caseId, assetId, captionMd) {
  await requireActiveCase(db, caseId);
  await requireActiveAsset(db, assetId);
  const rows = await attachedRows(db, caseId);
  if (!rows.some((row) => row.assetId === assetId)) {
    throw new CaseAssetInputError('That Asset is not attached to this Case.');
  }
  await db
    .update(caseAssets)
    .set({ captionMd: normalizeCaption(captionMd) })
    .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)));
}

/** @param {LearningDb} db @param {string} caseId @param {string} assetId @param {'up' | 'down'} direction */
export async function moveCaseAsset(db, caseId, assetId, direction) {
  await requireActiveCase(db, caseId);
  await requireActiveAsset(db, assetId);
  const rows = await attachedRows(db, caseId);
  const currentIndex = rows.findIndex((row) => row.assetId === assetId);
  if (currentIndex < 0) throw new CaseAssetInputError('That Asset is not attached to this Case.');

  const nextIndex = direction === 'up' ? currentIndex - 1 : direction === 'down' ? currentIndex + 1 : -1;
  if (nextIndex < 0 || nextIndex >= rows.length) return false;

  const orderedIds = rows.map((row) => row.assetId);
  [orderedIds[currentIndex], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[currentIndex]];
  await writeOrder(db, caseId, orderedIds);
  return true;
}

/** @param {LearningDb} db @param {string} caseId */
async function normalizeOrder(db, caseId) {
  const rows = await attachedRows(db, caseId);
  await writeOrder(db, caseId, rows.map((row) => row.assetId));
}

/** @param {LearningDb} db @param {string} caseId @param {string[]} orderedAssetIds */
async function writeOrder(db, caseId, orderedAssetIds) {
  if (orderedAssetIds.length === 0) return;
  const currentRows = await attachedRows(db, caseId);
  const currentMax = Math.max(...currentRows.map((row) => row.displayOrder), -1);
  const offset = currentMax + orderedAssetIds.length + 1;
  const writes = [];
  for (const [index, assetId] of orderedAssetIds.entries()) {
    writes.push(
      db
        .update(caseAssets)
        .set({ displayOrder: offset + index })
        .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)))
    );
  }
  for (const write of writes) await write;
  for (const [index, assetId] of orderedAssetIds.entries()) {
    await db
      .update(caseAssets)
      .set({ displayOrder: index })
      .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)));
  }
}

/** @param {string | null | undefined} value */
function normalizeCaption(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}
