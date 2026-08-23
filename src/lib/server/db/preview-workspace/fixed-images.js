import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { assets, caseAssets, stimulusGroupOptions, stimulusGroups } from '../schema.js';
import { PreviewWorkspaceError } from './errors.js';
import { optionalText } from './input.js';
import { requireOwnedPreviewCase, requirePreviewUsableAsset } from './ownership.js';

/** @typedef {import('../index.js').LearningDb} LearningDb */

/**
 * Read the fixed Case-image relationships used by the shared Preview Case editor.
 * The caller is responsible for validating Preview Case ownership before calling this
 * read helper so the editor load does not repeat the same ownership query.
 *
 * @param {LearningDb} db
 * @param {string} caseId
 */
export async function listPreviewFixedCaseAssets(db, caseId) {
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

/**
 * Attach already-bounded Asset IDs to an ownership-validated Preview Case as fixed images.
 * The public facade performs the Case ownership check before bounding/deduplicating input
 * so error precedence and the original single ownership-query behavior are preserved.
 *
 * @param {LearningDb} db
 * @param {string} previewSessionId
 * @param {string} caseId
 * @param {string[]} assetIds
 */
export async function attachPreviewAssetsToCase(db, previewSessionId, caseId, assetIds) {
  for (const assetId of assetIds) await requirePreviewUsableAsset(db, previewSessionId, assetId);

  const [fixedRows, groupedRows] = await Promise.all([
    db
      .select({ assetId: caseAssets.assetId })
      .from(caseAssets)
      .where(and(eq(caseAssets.caseId, caseId), inArray(caseAssets.assetId, assetIds))),
    db
      .select({ assetId: stimulusGroupOptions.assetId })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .where(and(eq(stimulusGroups.caseId, caseId), inArray(stimulusGroupOptions.assetId, assetIds)))
  ]);

  if (groupedRows.length) {
    throw new PreviewWorkspaceError(
      'One or more selected images are already in an alternative set in this Preview Case.',
      'INVALID_INPUT'
    );
  }

  const existing = new Set(fixedRows.map((row) => row.assetId));
  const newIds = assetIds.filter((id) => !existing.has(id));
  if (!newIds.length) {
    return { attachedCount: 0, alreadyAttachedCount: assetIds.length, caseId };
  }

  const last = (
    await db
      .select({ displayOrder: caseAssets.displayOrder })
      .from(caseAssets)
      .where(eq(caseAssets.caseId, caseId))
      .orderBy(desc(caseAssets.displayOrder))
      .limit(1)
  )[0];
  const startOrder = (last?.displayOrder ?? -1) + 1;
  const writes = newIds.map((assetId, index) =>
    db.insert(caseAssets).values({
      caseId,
      assetId,
      displayOrder: startOrder + index,
      captionMd: null
    })
  );
  if (typeof db.batch === 'function') await db.batch(/** @type {[any, ...any[]]} */ (writes));
  else for (const write of writes) await write;

  return {
    attachedCount: newIds.length,
    alreadyAttachedCount: assetIds.length - newIds.length,
    caseId
  };
}

/**
 * @param {LearningDb} db
 * @param {string} previewSessionId
 * @param {string} caseId
 * @param {string} assetId
 * @param {string | null} [captionMd]
 */
export async function attachPreviewAsset(db, previewSessionId, caseId, assetId, captionMd = null) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  await requirePreviewUsableAsset(db, previewSessionId, assetId);

  const fixed = (
    await db
      .select({ assetId: caseAssets.assetId })
      .from(caseAssets)
      .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)))
      .limit(1)
  )[0];
  if (fixed) {
    throw new PreviewWorkspaceError('That image is already attached to this Preview Case.', 'INVALID_INPUT');
  }

  const grouped = (
    await db
      .select({ id: stimulusGroupOptions.id })
      .from(stimulusGroupOptions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .where(and(eq(stimulusGroups.caseId, caseId), eq(stimulusGroupOptions.assetId, assetId)))
      .limit(1)
  )[0];
  if (grouped) {
    throw new PreviewWorkspaceError(
      'That image is already used in an alternative set for this Preview Case.',
      'INVALID_INPUT'
    );
  }

  const last = (
    await db
      .select({ displayOrder: caseAssets.displayOrder })
      .from(caseAssets)
      .where(eq(caseAssets.caseId, caseId))
      .orderBy(desc(caseAssets.displayOrder))
      .limit(1)
  )[0];
  await db.insert(caseAssets).values({
    caseId,
    assetId,
    displayOrder: (last?.displayOrder ?? -1) + 1,
    captionMd: optionalText(captionMd)
  });
}

/**
 * @param {LearningDb} db
 * @param {string} previewSessionId
 * @param {string} caseId
 * @param {string} assetId
 */
export async function detachPreviewAsset(db, previewSessionId, caseId, assetId) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  const row = (
    await db
      .select({ assetId: caseAssets.assetId })
      .from(caseAssets)
      .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)))
      .limit(1)
  )[0];
  if (!row) {
    throw new PreviewWorkspaceError('That image is not a fixed image on this Preview Case.', 'INVALID_INPUT');
  }

  await db.delete(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)));
  await normalizePreviewCaseAssetOrder(db, caseId);
}

/**
 * @param {LearningDb} db
 * @param {string} previewSessionId
 * @param {string} caseId
 * @param {string} assetId
 * @param {string | null} captionMd
 */
export async function updatePreviewAssetCaption(db, previewSessionId, caseId, assetId, captionMd) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  const row = (
    await db
      .select({ assetId: caseAssets.assetId })
      .from(caseAssets)
      .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)))
      .limit(1)
  )[0];
  if (!row) {
    throw new PreviewWorkspaceError('That image is not a fixed image on this Preview Case.', 'INVALID_INPUT');
  }

  await db
    .update(caseAssets)
    .set({ captionMd: optionalText(captionMd) })
    .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)));
}

/** @param {LearningDb} db @param {string} caseId */
async function normalizePreviewCaseAssetOrder(db, caseId) {
  const rows = await db
    .select({ assetId: caseAssets.assetId })
    .from(caseAssets)
    .where(eq(caseAssets.caseId, caseId))
    .orderBy(asc(caseAssets.displayOrder));
  const offset = rows.length + 1000;
  for (const [i, row] of rows.entries()) {
    await db
      .update(caseAssets)
      .set({ displayOrder: offset + i })
      .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, row.assetId)));
  }
  for (const [i, row] of rows.entries()) {
    await db
      .update(caseAssets)
      .set({ displayOrder: i })
      .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, row.assetId)));
  }
}

/**
 * @param {LearningDb} db
 * @param {string} previewSessionId
 * @param {string} caseId
 * @param {string} assetId
 * @param {'up'|'down'} direction
 */
export async function movePreviewCaseAsset(db, previewSessionId, caseId, assetId, direction) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  const rows = await db
    .select({ assetId: caseAssets.assetId })
    .from(caseAssets)
    .where(eq(caseAssets.caseId, caseId))
    .orderBy(asc(caseAssets.displayOrder));
  const index = rows.findIndex((row) => row.assetId === assetId);
  const next = direction === 'up' ? index - 1 : direction === 'down' ? index + 1 : -1;
  if (index < 0 || next < 0 || next >= rows.length) return false;

  [rows[index], rows[next]] = [rows[next], rows[index]];
  const offset = rows.length + 1000;
  for (const [i, row] of rows.entries()) {
    await db
      .update(caseAssets)
      .set({ displayOrder: offset + i })
      .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, row.assetId)));
  }
  for (const [i, row] of rows.entries()) {
    await db
      .update(caseAssets)
      .set({ displayOrder: i })
      .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, row.assetId)));
  }
  return true;
}
