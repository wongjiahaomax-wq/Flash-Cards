/** @typedef {{ selectedIds?: Iterable<string>, orderedIds?: string[], anchorId?: string | null, caseId?: string, shiftKey?: boolean }} CaseSelectionInput */

/**
 * Apply Case checkbox selection against the exact currently displayed order.
 * Shift ranges never span unloaded pages.
 * @param {CaseSelectionInput} input
 */
export function applyCaseSelection(input) {
  const orderedIds = input.orderedIds ?? [];
  const caseId = String(input.caseId ?? '');
  const clickedIndex = orderedIds.indexOf(caseId);
  const selectedIds = new Set(input.selectedIds ?? []);
  let anchorId = input.anchorId ?? null;
  if (clickedIndex < 0) return { selectedIds, anchorId };

  if (input.shiftKey && anchorId) {
    const anchorIndex = orderedIds.indexOf(anchorId);
    if (anchorIndex >= 0) {
      const start = Math.min(anchorIndex, clickedIndex);
      const end = Math.max(anchorIndex, clickedIndex);
      for (const id of orderedIds.slice(start, end + 1)) selectedIds.add(id);
      return { selectedIds, anchorId };
    }
  }

  if (selectedIds.has(caseId)) selectedIds.delete(caseId);
  else selectedIds.add(caseId);
  return { selectedIds, anchorId: caseId };
}
