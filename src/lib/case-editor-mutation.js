// @ts-nocheck

import { applyAction } from '$app/forms';
import { invalidateAll, replaceState } from '$app/navigation';
import { tick } from 'svelte';

export function stableCaseEditorEnhance({ scrollX, scrollY, activeElement, selectionStart, selectionEnd }) {
  return async ({ result }) => {
    if (result.type !== 'redirect') {
      await applyAction(result);
      return { ok: result.type === 'success' };
    }

    const location = new URL(result.location, document.baseURI);
    location.hash = '';
    replaceState(`${location.pathname}${location.search}`, {});
    await invalidateAll();
    await tick();
    window.scrollTo(scrollX, scrollY);
    if (activeElement?.isConnected && typeof activeElement.focus === 'function') {
      activeElement.focus({ preventScroll: true });
      if (selectionStart !== null && 'setSelectionRange' in activeElement) {
        activeElement.setSelectionRange(selectionStart, selectionEnd);
      }
    }
    return { ok: true };
  };
}

export function captureCaseEditorView() {
  const activeElement = document.activeElement;
  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    activeElement,
    selectionStart: activeElement && 'selectionStart' in activeElement ? activeElement.selectionStart : null,
    selectionEnd: activeElement && 'selectionEnd' in activeElement ? activeElement.selectionEnd : null
  };
}
