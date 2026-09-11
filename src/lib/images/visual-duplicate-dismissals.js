// Session-only "Not duplicate" suppression for visual duplicate discovery.
//
// Decisions live exclusively in the current tab's sessionStorage. They are never
// written to D1, never shared across tabs/devices, and clear when the tab session
// ends. See docs/ADMIN_IMAGE_DEDUPLICATION_PLAN.md section 23.

import { canonicalPairKey } from './visual-duplicate-matcher.js';

export const DISMISSED_PAIRS_STORAGE_KEY = 'flashcards.admin.visual-duplicates.dismissed.v1';

/**
 * @param {Storage | null | undefined} storage
 */
export function createVisualDuplicateDismissals(storage) {
  /** @returns {Set<string>} */
  function read() {
    if (!storage) return new Set();
    try {
      const raw = storage.getItem(DISMISSED_PAIRS_STORAGE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((value) => typeof value === 'string' && value.includes('\u0000')));
    } catch {
      return new Set();
    }
  }

  /** @param {Set<string>} keys */
  function write(keys) {
    if (!storage) return;
    try {
      storage.setItem(DISMISSED_PAIRS_STORAGE_KEY, JSON.stringify([...keys].sort()));
    } catch {
      // A disabled or full sessionStorage must never break discovery.
    }
  }

  return {
    /** @param {string} assetIdA @param {string} assetIdB */
    has(assetIdA, assetIdB) {
      return read().has(canonicalPairKey(assetIdA, assetIdB));
    },
    /** @param {string} assetIdA @param {string} assetIdB */
    dismiss(assetIdA, assetIdB) {
      const keys = read();
      keys.add(canonicalPairKey(assetIdA, assetIdB));
      write(keys);
      return keys.size;
    },
    reset() {
      if (!storage) return;
      try {
        storage.removeItem(DISMISSED_PAIRS_STORAGE_KEY);
      } catch {
        // ignore storage failures
      }
    },
    list() {
      return [...read()].sort();
    },
    get size() {
      return read().size;
    }
  };
}
