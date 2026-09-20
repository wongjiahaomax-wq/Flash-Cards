/** @typedef {{ selectedIds?: Iterable<string>, orderedIds?: string[], anchorId?: string | null, caseId?: string, shiftKey?: boolean }} CaseSelectionInput */
/** @typedef {{ selectedIds?: unknown[], visibleIds?: string[] }} VisibleCaseSelectionInput */

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

/**
 * Reconcile a retry selection against the Cases that are freshly visible in
 * the current Case Library result. Invisible/stale IDs are deliberately
 * dropped so a failed action cannot retain hidden mutation targets.
 * @param {VisibleCaseSelectionInput} input
 */
export function reconcileVisibleCaseSelection(input) {
  const visibleIds = new Set(input.visibleIds ?? []);
  const submittedIds = [];
  const seen = new Set();
  for (const value of input.selectedIds ?? []) {
    if (typeof value !== 'string') continue;
    const caseId = value.trim();
    if (!caseId || seen.has(caseId)) continue;
    seen.add(caseId);
    submittedIds.push(caseId);
  }
  const selectedIds = submittedIds.filter((caseId) => visibleIds.has(caseId));
  return {
    selectedIds,
    submittedCount: submittedIds.length,
    removedCount: submittedIds.length - selectedIds.length
  };
}

/**
 * Remove one Case immediately after local filter reconciliation. This keeps
 * bulk controls and the Shift-click anchor from retaining an invisible Case
 * while a background Case Library refresh is still pending.
 * @param {{ selectedIds?: Iterable<string>, anchorId?: string | null, caseId: string }} input
 */
export function reconcileRemovedCaseSelection(input) {
  const caseId = String(input.caseId ?? '').trim();
  return {
    selectedIds: [...new Set(input.selectedIds ?? [])].filter((id) => id !== caseId),
    anchorId: input.anchorId === caseId ? null : input.anchorId ?? null
  };
}
