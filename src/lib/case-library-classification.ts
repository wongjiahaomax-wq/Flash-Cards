export const CASE_LIBRARY_UNASSIGNED_SYSTEM = '__unassigned__';

export type CaseLibraryBreadcrumbNode = {
  id: string;
  name: string;
  kind: string;
};

export type CaseLibraryTopicOption = {
  id: string;
  name: string;
  breadcrumb: CaseLibraryBreadcrumbNode[];
};

export type CaseLibraryParentOption = CaseLibraryTopicOption & {
  kind: string;
};

export function caseLibraryTopicSystemId(topic: CaseLibraryTopicOption) {
  return topic.breadcrumb.find((item) => item.kind === 'system')?.id ?? null;
}

export function caseLibrarySystemContextForTopic(topic: CaseLibraryTopicOption) {
  return caseLibraryTopicSystemId(topic) ?? CASE_LIBRARY_UNASSIGNED_SYSTEM;
}

export function caseLibraryTopicLabel(topic: CaseLibraryTopicOption) {
  return topic.breadcrumb.map((item) => item.name).join(' → ') || topic.name;
}

export function filterCaseLibraryTopicsBySystem(topics: CaseLibraryTopicOption[], systemContext: string) {
  return topics
    .filter((topic) => {
      const systemId = caseLibraryTopicSystemId(topic);
      return systemContext === CASE_LIBRARY_UNASSIGNED_SYSTEM ? systemId === null : systemId === systemContext;
    })
    .sort((left, right) => caseLibraryTopicLabel(left).localeCompare(caseLibraryTopicLabel(right)) || left.id.localeCompare(right.id));
}

export function filterCaseLibraryParentOptionsBySystem(parentOptions: CaseLibraryParentOption[], systemContext: string) {
  return parentOptions
    .filter((option) => {
      if (option.kind === 'system') return systemContext !== CASE_LIBRARY_UNASSIGNED_SYSTEM && option.id === systemContext;
      if (option.kind !== 'topic') return false;
      const systemId = caseLibraryTopicSystemId(option);
      return systemContext === CASE_LIBRARY_UNASSIGNED_SYSTEM ? systemId === null : systemId === systemContext;
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'system' ? -1 : 1;
      return caseLibraryTopicLabel(left).localeCompare(caseLibraryTopicLabel(right)) || left.id.localeCompare(right.id);
    });
}
