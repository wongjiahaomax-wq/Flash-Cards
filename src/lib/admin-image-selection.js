/**
 * Apply desktop-style Asset selection against the exact currently displayed
 * order. The caller decides when an ordinary click should navigate instead.
 *
 * @param {{
 *   selectedIds: Iterable<string>,
 *   orderedIds: string[],
 *   assetId: string,
 *   anchorId?: string | null,
 *   shiftKey?: boolean,
 *   toggleKey?: boolean
 * }} input
 */
export function applyAssetSelection(input) {
  const orderedIds = input.orderedIds ?? [];
  const assetId = String(input.assetId ?? '');
  const clickedIndex = orderedIds.indexOf(assetId);
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

  if (input.toggleKey) {
    if (selectedIds.has(assetId)) selectedIds.delete(assetId);
    else selectedIds.add(assetId);
    anchorId = assetId;
    return { selectedIds, anchorId };
  }

  return { selectedIds: new Set([assetId]), anchorId: assetId };
}

/**
 * Remove Assets that are no longer in the displayed filtered result set.
 * This prevents hidden selections from surviving a filter/search change.
 *
 * @param {{ selectedIds: Iterable<string>, orderedIds: string[], anchorId?: string | null }} input
 */
export function pruneAssetSelection(input) {
  const visibleIds = new Set(input.orderedIds ?? []);
  const selectedIds = new Set([...input.selectedIds].filter((id) => visibleIds.has(id)));
  const anchorId = input.anchorId && visibleIds.has(input.anchorId) ? input.anchorId : null;
  return { selectedIds, anchorId };
}

/**
 * Reconcile the Case image picker's local selection with new server data.
 * A Case/target change is a different attachment intent and clears selection;
 * a result/search change only retains IDs that remain visible.
 *
 * @param {{
 *   selectedIds: Iterable<string>,
 *   previousContextKey?: string | null,
 *   nextContextKey: string,
 *   orderedIds: string[]
 * }} input
 */
export function reconcileCasePickerSelection(input) {
  const previousContextKey = input.previousContextKey ?? null;
  if (previousContextKey && previousContextKey !== input.nextContextKey) {
    return { selectedIds: new Set(), contextKey: input.nextContextKey };
  }
  const pruned = pruneAssetSelection({ selectedIds: input.selectedIds, orderedIds: input.orderedIds });
  return { selectedIds: pruned.selectedIds, contextKey: input.nextContextKey };
}

export function clearAssetSelection() {
  return { selectedIds: new Set(), anchorId: null };
}
