export const CASE_EDITOR_LAYOUT_STORAGE_KEY = 'flash-cards-admin-case-editor-layout';
export const DEFAULT_CASE_EDITOR_LAYOUT = 'compact';

/** @typedef {'classic' | 'compact'} CaseEditorLayout */

/** @param {unknown} value @returns {CaseEditorLayout} */
export function normalizeCaseEditorLayout(value) {
  return value === 'classic' || value === 'compact' ? value : DEFAULT_CASE_EDITOR_LAYOUT;
}

/** @param {{ getItem: (key: string) => string | null } | null | undefined} storage @returns {CaseEditorLayout} */
export function readCaseEditorLayout(storage) {
  try {
    return normalizeCaseEditorLayout(storage?.getItem(CASE_EDITOR_LAYOUT_STORAGE_KEY));
  } catch {
    return DEFAULT_CASE_EDITOR_LAYOUT;
  }
}

/** @param {{ setItem: (key: string, value: string) => void } | null | undefined} storage @param {unknown} layout @returns {CaseEditorLayout} */
export function writeCaseEditorLayout(storage, layout) {
  const normalized = normalizeCaseEditorLayout(layout);
  try {
    storage?.setItem(CASE_EDITOR_LAYOUT_STORAGE_KEY, normalized);
  } catch {
    // Browser storage is a convenience only; authoring must keep working without it.
  }
  return normalized;
}
