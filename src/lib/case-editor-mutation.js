// @ts-nocheck

import { applyAction, enhance } from '$app/forms';
import { invalidateAll, replaceState } from '$app/navigation';
import { tick } from 'svelte';

export function editorFormKey(form) {
  const action = form.getAttribute('action') ?? '';
  const hidden = [...form.querySelectorAll('input[type="hidden"]')]
    .map((input) => `${input.name}=${input.value}`)
    .sort()
    .join('&');
  return `${action}|${hidden}`;
}

function captureEditorFormDrafts(excludedForm = null) {
  return [...document.querySelectorAll('.case-editor form[method="POST"]')]
    .filter((form) => form !== excludedForm)
    .map((form) => ({
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

function resetSubmittedEditorForm(form, key) {
  const candidate = form?.isConnected
    ? form
    : [...document.querySelectorAll('.case-editor form[method="POST"]')].find((item) => editorFormKey(item) === key);
  candidate?.reset?.();
}

export function formHasMeaningfulUnsubmittedInput(form) {
  return [...form.elements].some((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
    if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
    if (element instanceof HTMLInputElement && element.type === 'file') return Boolean(element.files?.length);
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) return element.checked !== element.defaultChecked;
    if (element instanceof HTMLSelectElement) return [...element.options].some((option) => option.selected !== option.defaultSelected);
    return element.value.trim() !== element.defaultValue.trim();
  });
}

/** @param {{ scrollX: number, scrollY: number, activeElement: Element | null, selectionStart: number | null, selectionEnd: number | null }} view @param {HTMLFormElement | null} [submittedForm] */
export function stableCaseEditorEnhance({ scrollX, scrollY, activeElement, selectionStart, selectionEnd }, submittedForm = null) {
  return async ({ result }) => {
    const successful = result.type === 'redirect' || result.type === 'success';
    const submittedKey = submittedForm ? editorFormKey(submittedForm) : '';
    const formDrafts = captureEditorFormDrafts(successful ? submittedForm : null);
    if (result.type !== 'redirect') {
      await applyAction(result);
      await tick();
      restoreEditorFormDrafts(formDrafts);
      if (successful) resetSubmittedEditorForm(submittedForm, submittedKey);
      return { ok: result.type === 'success' };
    }

    const location = new URL(result.location, document.baseURI);
    location.hash = '';
    replaceState(`${location.pathname}${location.search}`, {});
    await invalidateAll();
    await tick();
    restoreEditorFormDrafts(formDrafts);
    resetSubmittedEditorForm(submittedForm, submittedKey);
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

/**
 * Enhance and register a dynamically mounted ordinary Case-editor form.
 * Structural forms such as question-scope intentionally do not use this helper.
 */
export function registerCaseEditorForm(node, { coordinator, key }) {
  let currentKey = key;
  let unregister = register();
  let pending = null;
  let resolvePending = null;

  function register() {
    return coordinator?.register(`form:${currentKey}`, {
      isDirty: () => node.isConnected && formHasMeaningfulUnsubmittedInput(node),
      save: () => {
        if (pending) return pending;
        if (!node.reportValidity()) return Promise.resolve(false);
        pending = new Promise((resolve) => { resolvePending = resolve; });
        node.requestSubmit();
        if (!pending) return Promise.resolve(false);
        return pending;
      }
    });
  }

  const refresh = () => coordinator?.refresh();
  node.addEventListener('input', refresh);
  node.addEventListener('change', refresh);

  const enhanced = enhance(node, ({ formElement }) => {
    const stable = stableCaseEditorEnhance(captureCaseEditorView(), formElement);
    return async ({ result }) => {
      let ok = false;
      try {
        ok = (await stable({ result })).ok;
      } finally {
        const resolve = resolvePending;
        pending = null;
        resolvePending = null;
        coordinator?.refresh();
        resolve?.(ok);
      }
    };
  });

  return {
    update(nextKey) {
      if (nextKey === currentKey) return;
      unregister?.();
      currentKey = nextKey;
      unregister = register();
    },
    destroy() {
      enhanced?.destroy?.();
      node.removeEventListener('input', refresh);
      node.removeEventListener('change', refresh);
      unregister?.();
    }
  };
}

export function captureCaseEditorView() {
  const activeElement = document.activeElement;
  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    activeElement,
    selectionStart: activeElement && 'selectionStart' in activeElement ? Number(activeElement.selectionStart) : null,
    selectionEnd: activeElement && 'selectionEnd' in activeElement ? Number(activeElement.selectionEnd) : null
  };
}
