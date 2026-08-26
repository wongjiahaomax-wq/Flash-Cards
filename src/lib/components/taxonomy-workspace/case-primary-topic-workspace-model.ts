import {
  casePrimaryTopicTargets,
  listWorkspaceCases,
  type StagedCasePrimaryTopicChange,
  type TaxonomyWorkspaceItem
} from './taxonomy-workspace-model.ts';

export function stageFlexibleCasePrimaryTopicChanges(
  items: TaxonomyWorkspaceItem[],
  changes: StagedCasePrimaryTopicChange[],
  caseIds: string[],
  topicId: string
): StagedCasePrimaryTopicChange[] {
  const targetTopic = casePrimaryTopicTargets(items).find((item) => item.id === topicId);
  if (!targetTopic) throw new Error('Choose an active Topic as the new Primary Topic.');

  const uniqueCaseIds = [...new Set(caseIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (!uniqueCaseIds.length) throw new Error('Select at least one Case.');
  if (uniqueCaseIds.length > 60) throw new Error('Select no more than 60 Cases at a time.');

  const loadedAssignments = new Map(
    listWorkspaceCases(items, []).map((caseItem) => [caseItem.id, caseItem])
  );
  const selectedIds = new Set(uniqueCaseIds);
  const next = changes.filter((change) => !selectedIds.has(change.caseId));

  for (const caseId of uniqueCaseIds) {
    const loaded = loadedAssignments.get(caseId);
    if (!loaded) {
      throw new Error('One or more selected Cases are no longer available in this workspace. Refresh and try again.');
    }
    if (loaded.originalTopicId === topicId) continue;
    next.push({
      caseId,
      title: loaded.title,
      originalTopicId: loaded.originalTopicId,
      topicId
    });
  }

  return next.sort((left, right) => left.title.localeCompare(right.title) || left.caseId.localeCompare(right.caseId));
}
