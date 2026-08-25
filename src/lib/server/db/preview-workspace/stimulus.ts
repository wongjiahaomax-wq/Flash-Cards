import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { caseAssets, cases, stimulusGroupOptions, stimulusGroupQuestions, stimulusGroups } from '../schema.js';
import { PreviewWorkspaceError } from './errors.js';
import { booleanValue, optionalText, requiredText } from './input.js';
import {
  requireOwnedPreviewCase,
  requireOwnedPreviewGroup,
  requireOwnedPreviewOption,
  requirePreviewUsableAsset
} from './ownership.js';

type LearningDb = import('../index.js').LearningDb;
type OwnedPreviewGroup = Awaited<ReturnType<typeof requireOwnedPreviewGroup>>;

function newId() {
  return crypto.randomUUID();
}

export async function validatePreviewStimulusGroupTarget(db: LearningDb, previewSessionId: string, groupId: string) {
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

/**
 * Add already-bounded Asset IDs to an already-validated Preview Stimulus Group.
 * The façade deliberately performs group-target validation before bulk-input
 * validation so the established ownership/error precedence remains unchanged.
 */
export async function addPreviewAssetsToStimulusGroup(
  db: LearningDb,
  previewSessionId: string,
  group: OwnedPreviewGroup,
  ids: string[]
) {
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
    if (existing && existing.groupId !== group.id) throw new PreviewWorkspaceError('One or more selected images belong to another alternative set in this Preview Case.', 'INVALID_INPUT');
    if (existing && !existing.isActive) throw new PreviewWorkspaceError('One or more selected images are inactive in this Preview alternative set.', 'INVALID_INPUT');
  }
  const newIds = ids.filter((id) => !byAsset.has(id));
  if (!newIds.length) return { addedCount: 0, alreadyPresentCount: ids.length, caseId: group.caseId };
  const last = (
    await db
      .select({ displayOrder: stimulusGroupOptions.displayOrder })
      .from(stimulusGroupOptions)
      .where(eq(stimulusGroupOptions.stimulusGroupId, group.id))
      .orderBy(desc(stimulusGroupOptions.displayOrder))
      .limit(1)
  )[0];
  const startOrder = (last?.displayOrder ?? -1) + 1;
  const writes = newIds.map((assetId, index) =>
    db.insert(stimulusGroupOptions).values({
      id: newId(),
      stimulusGroupId: group.id,
      assetId,
      displayOrder: startOrder + index,
      captionMd: null,
      isActive: true
    })
  );
  if (typeof db.batch === 'function') await db.batch(writes as [any, ...any[]]);
  else for (const write of writes) await write;
  return { addedCount: newIds.length, alreadyPresentCount: ids.length - newIds.length, caseId: group.caseId };
}

export async function updatePreviewStimulusOptionCaption(
  db: LearningDb,
  previewSessionId: string,
  caseId: string,
  optionId: string,
  captionMd: unknown
) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  const option = await requireOwnedPreviewOption(db, previewSessionId, optionId);
  if (option.caseId !== caseId) throw new PreviewWorkspaceError('That alternative image does not belong to this Preview Case.', 'NOT_OWNED');
  await db.update(stimulusGroupOptions).set({ captionMd: optionalText(captionMd) }).where(eq(stimulusGroupOptions.id, optionId));
}

export async function createPreviewStimulusGroup(
  db: LearningDb,
  previewSessionId: string,
  caseId: string,
  input: { name: string; specificQuestionMode?: string; minimumSpecificQuestions?: unknown }
) {
  await requireOwnedPreviewCase(db, previewSessionId, caseId);
  const mode = String(input.specificQuestionMode || 'none');
  if (!['none', 'minimum', 'all'].includes(mode)) {
    throw new PreviewWorkspaceError('Specific-question coverage is invalid.', 'INVALID_INPUT');
  }
  let minimum: number | null = null;
  if (mode === 'minimum') {
    const parsedMinimum = Number(input.minimumSpecificQuestions);
    if (!Number.isInteger(parsedMinimum) || parsedMinimum < 1) {
      throw new PreviewWorkspaceError('Minimum specific questions must be a positive integer.', 'INVALID_INPUT');
    }
    minimum = parsedMinimum;
  }
  const last = (
    await db
      .select({ displayOrder: stimulusGroups.displayOrder })
      .from(stimulusGroups)
      .where(eq(stimulusGroups.caseId, caseId))
      .orderBy(desc(stimulusGroups.displayOrder))
      .limit(1)
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

export async function startPreviewAlternativeSet(
  db: LearningDb,
  previewSessionId: string,
  caseId: string,
  assetId: string,
  name: string
) {
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

export async function updatePreviewStimulusGroup(
  db: LearningDb,
  previewSessionId: string,
  groupId: string,
  input: Record<string, unknown>
) {
  await requireOwnedPreviewGroup(db, previewSessionId, groupId);
  const mode = String(input.specificQuestionMode || 'none');
  if (!['none', 'minimum', 'all'].includes(mode)) {
    throw new PreviewWorkspaceError('Specific-question coverage is invalid.', 'INVALID_INPUT');
  }
  let minimum: number | null = null;
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

async function nextOptionOrder(db: LearningDb, groupId: string) {
  const last = (
    await db
      .select({ displayOrder: stimulusGroupOptions.displayOrder })
      .from(stimulusGroupOptions)
      .where(eq(stimulusGroupOptions.stimulusGroupId, groupId))
      .orderBy(desc(stimulusGroupOptions.displayOrder))
      .limit(1)
  )[0];
  return (last?.displayOrder ?? -1) + 1;
}

export async function addPreviewStimulusOption(
  db: LearningDb,
  previewSessionId: string,
  groupId: string,
  assetId: string,
  captionMd: string | null = null
) {
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

export async function convertPreviewFixedAssetToOption(db: LearningDb, previewSessionId: string, groupId: string, assetId: string) {
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
  if (typeof db.batch === 'function') await db.batch(writes as [any, ...any[]]);
  else for (const write of writes) await write;
  return optionId;
}

export async function setPreviewStimulusOptionActive(
  db: LearningDb,
  previewSessionId: string,
  optionId: string,
  active: boolean
) {
  await requireOwnedPreviewOption(db, previewSessionId, optionId);
  await db.update(stimulusGroupOptions).set({ isActive: Boolean(active) }).where(eq(stimulusGroupOptions.id, optionId));
}

export async function movePreviewStimulusOption(
  db: LearningDb,
  previewSessionId: string,
  groupId: string,
  optionId: string,
  direction: 'up' | 'down'
) {
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
