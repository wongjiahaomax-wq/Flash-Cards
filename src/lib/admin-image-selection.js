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

export function clearAssetSelection() {
  return { selectedIds: new Set(), anchorId: null };
}
