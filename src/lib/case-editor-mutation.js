// @ts-nocheck

import { applyAction } from '$app/forms';
import { invalidateAll, replaceState } from '$app/navigation';
import { tick } from 'svelte';

function editorFormKey(form) {
  const action = form.getAttribute('action') ?? '';
  const hidden = [...form.querySelectorAll('input[type="hidden"]')]
    .map((input) => `${input.name}=${input.value}`)
    .sort()
    .join('&');
  return `${action}|${hidden}`;
}

function captureEditorFormDrafts() {
  return [...document.querySelectorAll('.case-editor form[method="POST"]')].map((form) => ({
    key: editorFormKey(form),
    values: [...form.elements].map((element) => {
      if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) return { name: element.name, type: element.type, checked: element.checked };
      if (element instanceof HTMLInputElement && element.type === 'file') return null;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return { name: element.name, type: element.type, value: element.value };
      return null;
    }).filter(Boolean)
  }));
}

function restoreEditorFormDrafts(drafts) {
  for (const draft of drafts) {
    const form = [...document.querySelectorAll('.case-editor form[method="POST"]')].find((candidate) => editorFormKey(candidate) === draft.key);
    if (!form) continue;
    for (const value of draft.values) {
      const elements = [...form.elements].filter((element) => element.name === value.name && element.type === value.type);
      for (const element of elements) {
        if (value.type === 'checkbox' || value.type === 'radio') element.checked = value.checked;
        else element.value = value.value;
      }
    }
  }
}

export function stableCaseEditorEnhance({ scrollX, scrollY, activeElement, selectionStart, selectionEnd }) {
  return async ({ result }) => {
    const formDrafts = captureEditorFormDrafts();
    if (result.type !== 'redirect') {
      await applyAction(result);
      await tick();
      restoreEditorFormDrafts(formDrafts);
      return { ok: result.type === 'success' };
    }

    const location = new URL(result.location, document.baseURI);
    location.hash = '';
    replaceState(`${location.pathname}${location.search}`, {});
    await invalidateAll();
    await tick();
    restoreEditorFormDrafts(formDrafts);
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
