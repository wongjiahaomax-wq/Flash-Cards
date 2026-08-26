export type CaseTagOption = {
  id: string;
  name: string;
};

export type CaseTagAssignment = {
  caseId: string;
  tagId: string;
  tagName: string;
};

export type StagedCaseTagChange = {
  caseId: string;
  title: string;
  tagId: string;
  tagName: string;
  operation: 'add' | 'remove';
  expectedAttached: boolean;
};

export type WorkspaceCaseIdentity = {
  id: string;
  title: string;
};

function pairKey(caseId: string, tagId: string) {
  return `${caseId}\u0000${tagId}`;
}

function loadedMembership(assignments: CaseTagAssignment[]) {
  return new Set(assignments.map((assignment) => pairKey(assignment.caseId, assignment.tagId)));
}

export function projectedCaseTagIds(
  assignments: CaseTagAssignment[],
  changes: StagedCaseTagChange[],
  caseId: string
) {
  const ids = new Set(
    assignments
      .filter((assignment) => assignment.caseId === caseId)
      .map((assignment) => assignment.tagId)
  );
  for (const change of changes) {
    if (change.caseId !== caseId) continue;
    if (change.operation === 'add') ids.add(change.tagId);
    else ids.delete(change.tagId);
  }
  return ids;
}

export function projectedCaseTags(
  assignments: CaseTagAssignment[],
  changes: StagedCaseTagChange[],
  caseId: string,
  options: CaseTagOption[]
) {
  const ids = projectedCaseTagIds(assignments, changes, caseId);
  const optionById = new Map(options.map((option) => [option.id, option]));
  const loadedNameById = new Map(
    assignments
      .filter((assignment) => assignment.caseId === caseId)
      .map((assignment) => [assignment.tagId, assignment.tagName])
  );
  return [...ids]
    .map((id) => ({ id, name: optionById.get(id)?.name ?? loadedNameById.get(id) ?? id }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function stageCaseTagChanges(
  assignments: CaseTagAssignment[],
  changes: StagedCaseTagChange[],
  selectedCases: WorkspaceCaseIdentity[],
  tag: CaseTagOption,
  operation: 'add' | 'remove'
): StagedCaseTagChange[] {
  const uniqueCases = [...new Map(selectedCases.map((caseItem) => [caseItem.id, caseItem])).values()];
  if (!uniqueCases.length) throw new Error('Select at least one Case.');
  if (uniqueCases.length > 60) throw new Error('Select no more than 60 Cases at a time.');
  if (!String(tag.id ?? '').trim()) throw new Error('Choose a Tag.');

  const loaded = loadedMembership(assignments);
  const changeByPair = new Map(changes.map((change) => [pairKey(change.caseId, change.tagId), change]));

  for (const caseItem of uniqueCases) {
    const key = pairKey(caseItem.id, tag.id);
    const expectedAttached = loaded.has(key);
    const existing = changeByPair.get(key);
    const projectedAttached = existing ? existing.operation === 'add' : expectedAttached;
    const requestedAttached = operation === 'add';

    if (projectedAttached === requestedAttached) continue;
    if (requestedAttached === expectedAttached) {
      changeByPair.delete(key);
      continue;
    }

    changeByPair.set(key, {
      caseId: caseItem.id,
      title: caseItem.title,
      tagId: tag.id,
      tagName: tag.name,
      operation,
      expectedAttached
    });
  }

  return [...changeByPair.values()].sort((left, right) => (
    left.title.localeCompare(right.title)
    || left.tagName.localeCompare(right.tagName)
    || left.caseId.localeCompare(right.caseId)
    || left.tagId.localeCompare(right.tagId)
  ));
}
