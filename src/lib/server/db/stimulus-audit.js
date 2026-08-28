import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import { assets, caseAssets, cases, stimulusGroupOptions, stimulusGroups } from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

/**
 * Find production Cases whose stimulus semantics need explicit human curation.
 * A lone ordinary Case image is intentionally omitted: it is the unambiguous
 * legacy Original representation. Multiple ordinary images are only a
 * suggestion because they may all be legitimate always-shown supporting images.
 *
 * @param {LearningDb} db
 */
export async function listStimulusCleanupIssues(db) {
  const activeCases = await db
    .select({ caseId: cases.id, caseTitle: cases.title })
    .from(cases)
    .where(and(eq(cases.isActive, true), isNull(cases.previewSessionId)))
    .orderBy(asc(cases.title), asc(cases.id));
  if (activeCases.length === 0) return [];
  const caseIds = activeCases.map((row) => row.caseId);

  const [ordinaryRows, groupRows] = await Promise.all([
    db
      .select({ caseId: caseAssets.caseId, assetId: caseAssets.assetId })
      .from(caseAssets)
      .innerJoin(assets, eq(assets.id, caseAssets.assetId))
      .where(and(inArray(caseAssets.caseId, caseIds), eq(assets.isActive, true))),
    db
      .select({
        groupId: stimulusGroups.id,
        caseId: stimulusGroups.caseId,
        groupName: stimulusGroups.name,
        originalOptionId: stimulusGroups.originalOptionId
      })
      .from(stimulusGroups)
      .where(and(inArray(stimulusGroups.caseId, caseIds), eq(stimulusGroups.isActive, true)))
      .orderBy(asc(stimulusGroups.displayOrder), asc(stimulusGroups.id))
  ]);

  const groupIds = groupRows.map((row) => row.groupId);
  const optionRows = groupIds.length
    ? await db
        .select({
          optionId: stimulusGroupOptions.id,
          groupId: stimulusGroupOptions.stimulusGroupId
        })
        .from(stimulusGroupOptions)
        .innerJoin(assets, eq(assets.id, stimulusGroupOptions.assetId))
        .where(and(
          inArray(stimulusGroupOptions.stimulusGroupId, groupIds),
          eq(stimulusGroupOptions.isActive, true),
          eq(stimulusGroupOptions.removedFromCase, false),
          eq(assets.isActive, true)
        ))
    : [];

  /** @type {{ caseId: string, caseTitle: string, severity: 'needs_cleanup'|'review_suggested', groupId: string | null, groupName: string | null, reason: string }[]} */
  const issues = [];
  const caseById = new Map(activeCases.map((row) => [row.caseId, row]));
  const casesWithCuratedOriginal = new Set();

  for (const group of groupRows) {
    const eligible = optionRows.filter((option) => option.groupId === group.groupId);
    const originalValid = Boolean(
      group.originalOptionId && eligible.some((option) => option.optionId === group.originalOptionId)
    );
    if (originalValid) casesWithCuratedOriginal.add(group.caseId);
    if (!originalValid && eligible.length > 0) {
      const currentCase = caseById.get(group.caseId);
      if (!currentCase) continue;
      issues.push({
        caseId: group.caseId,
        caseTitle: currentCase.caseTitle,
        severity: 'needs_cleanup',
        groupId: group.groupId,
        groupName: group.groupName,
        reason: eligible.length > 1
          ? `This legacy family has ${eligible.length} eligible images but no curated Original. It keeps legacy random selection until one is chosen.`
          : 'This one-option family has no valid Original and should be repaired before learner use.'
      });
    }
  }

  for (const currentCase of activeCases) {
    const ordinaryImageCount = ordinaryRows.filter((row) => row.caseId === currentCase.caseId).length;
    if (ordinaryImageCount <= 1 || casesWithCuratedOriginal.has(currentCase.caseId)) continue;
    issues.push({
      caseId: currentCase.caseId,
      caseTitle: currentCase.caseTitle,
      severity: 'review_suggested',
      groupId: null,
      groupName: null,
      reason: `This Case has ${ordinaryImageCount} ordinary learner images and no curated Original family. Review whether one is principal or whether all are always-shown supporting images.`
    });
  }

  return issues.sort((left, right) =>
    left.caseTitle.localeCompare(right.caseTitle)
    || left.severity.localeCompare(right.severity)
    || (left.groupName ?? '').localeCompare(right.groupName ?? '')
  );
}
