/** @typedef {{ selectedIds?: Iterable<string>, orderedIds?: string[], anchorId?: string | null, assetId?: string, shiftKey?: boolean, toggleKey?: boolean }} AssetSelectionInput */

/**
 * Apply desktop-style Asset selection against the exact currently displayed
 * order. Shift ranges never span unloaded pages.
 * @param {AssetSelectionInput} input
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
 * Retained for the bounded Case picker, where hidden results must be pruned.
 * @param {{ selectedIds?: Iterable<string>, orderedIds?: string[], anchorId?: string | null }} input
 */
export function pruneAssetSelection(input) {
  const visibleIds = new Set(input.orderedIds ?? []);
  const selectedIds = new Set([...(input.selectedIds ?? [])].filter((id) => visibleIds.has(id)));
  const anchorId = input.anchorId && visibleIds.has(input.anchorId) ? input.anchorId : null;
  return { selectedIds, anchorId };
}

/**
 * Preserve explicit selections while only the page changes. Any authoritative
 * query-context change clears the selection universe.
 * @param {{ selectedIds?: Iterable<string>, orderedIds?: string[], anchorId?: string | null, previousContextKey?: string | null, nextContextKey: string }} input
 */
export function reconcileLibrarySelection(input) {
  const previousContextKey = input.previousContextKey ?? null;
  if (previousContextKey && previousContextKey !== input.nextContextKey) {
    return { selectedIds: new Set(), anchorId: null, contextKey: input.nextContextKey };
  }
  const selectedIds = new Set(input.selectedIds ?? []);
  const visibleIds = new Set(input.orderedIds ?? []);
  const anchorId = input.anchorId && visibleIds.has(input.anchorId) ? input.anchorId : null;
  return { selectedIds, anchorId, contextKey: input.nextContextKey };
}

/** @param {{ selectedIds?: Iterable<string>, orderedIds?: string[], previousContextKey?: string | null, nextContextKey: string }} input */
export function reconcileCasePickerSelection(input) {
  const previousContextKey = input.previousContextKey ?? null;
  if (previousContextKey && previousContextKey !== input.nextContextKey) return { selectedIds: new Set(), contextKey: input.nextContextKey };
  const pruned = pruneAssetSelection({ selectedIds: input.selectedIds, orderedIds: input.orderedIds });
  return { selectedIds: pruned.selectedIds, contextKey: input.nextContextKey };
}

export function clearAssetSelection() { return { selectedIds: new Set(), anchorId: null }; }

/**
 * Split explicit IDs into sequential server-safe mutation chunks.
 * @param {Iterable<unknown>} values
 * @param {number} [limit]
 * @returns {string[][]}
 */
export function chunkAssetIds(values, limit = 30) {
  const ids = [...new Set([...values].map((value) => String(value ?? '').trim()).filter(Boolean))];
  const size = Math.max(1, Number(limit) || 30);
  /** @type {string[][]} */
  const chunks = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}

/**
 * Execute chunks strictly one-at-a-time. The caller owns transport details.
 * On failure, completed IDs are removed from the remaining selection while the
 * failed and unprocessed IDs remain available for retry/inspection.
 * @param {Iterable<unknown>} values
 * @param {number} limit
 * @param {(chunk: string[], state: { index: number, processed: number, total: number }) => Promise<unknown> | unknown} mutate
 */
export async function runSequentialAssetChunks(values, limit, mutate) {
  const chunks = chunkAssetIds(values, limit);
  const allIds = chunks.flat();
  let processed = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    try {
      await mutate(chunk, { index, processed, total: allIds.length });
      processed += chunk.length;
    } catch (error) {
      return { ok: false, processed, total: allIds.length, remainingIds: allIds.slice(processed), error };
    }
  }
  return { ok: true, processed, total: allIds.length, remainingIds: [], error: null };
}
