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
      values: [...form.elements].map((element, index) => {
      if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) return { index, name: element.name, type: element.type, checked: element.checked };
      if (element instanceof HTMLInputElement && element.type === 'file') return null;
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return { index, name: element.name, type: element.type, value: element.value };
      return null;
    }).filter(Boolean)
    }));
}

function restoreEditorFormDrafts(drafts) {
  for (const draft of drafts) {
    const form = [...document.querySelectorAll('.case-editor form[method="POST"]')].find((candidate) => editorFormKey(candidate) === draft.key);
    if (!form) continue;
    for (const value of draft.values) {
      const element = form.elements[value.index];
      if (!element || element.name !== value.name || element.type !== value.type) continue;
      if (value.type === 'checkbox' || value.type === 'radio') element.checked = value.checked;
      else element.value = value.value;
    }
  }
}

function findSubmittedEditorForm(form, key, logicalKey = '') {
  return form?.isConnected
    ? form
    : [...document.querySelectorAll('.case-editor form[method="POST"]')].find((item) =>
      (logicalKey && item.dataset.caseEditorLogicalKey === logicalKey) || editorFormKey(item) === key
    );
}

function captureEditableFormSnapshot(form) {
  return [...form.elements]
    .filter((element) => {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
      if (element instanceof HTMLInputElement && ['hidden', 'file', 'submit', 'button', 'reset'].includes(element.type)) return false;
      return true;
    })
    .map((element) => {
      if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) return { name: element.name, type: element.type, checked: element.checked };
      return { name: element.name, type: element.type, value: element.value };
    });
}

function sameEditableFormSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function restoreEditableFormSnapshot(form, snapshot) {
  const elements = [...form.elements].filter((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
    if (element instanceof HTMLInputElement && ['hidden', 'file', 'submit', 'button', 'reset'].includes(element.type)) return false;
    return true;
  });
  elements.forEach((element, index) => {
    const value = snapshot[index];
    if (!value) return;
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) element.checked = value.checked;
    else element.value = value.value;
  });
}

function resetSubmittedEditorForm(form, key, logicalKey = '') {
  findSubmittedEditorForm(form, key, logicalKey)?.reset?.();
}

function reconcileSubmittedEditorForm(form, key, logicalKey, submittedSnapshot, currentSnapshot) {
  const candidate = findSubmittedEditorForm(form, key, logicalKey);
  if (!candidate) return;
  if (sameEditableFormSnapshot(currentSnapshot, submittedSnapshot)) candidate.reset?.();
  else restoreEditableFormSnapshot(candidate, currentSnapshot);
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

/** @param {{ scrollX: number, scrollY: number, activeElement: Element | null, selectionStart: number | null, selectionEnd: number | null }} view @param {HTMLFormElement | null} [submittedForm] @param {{ reconcileSubmittedDraft?: boolean, logicalKey?: string }} [options] */
export function stableCaseEditorEnhance({ scrollX, scrollY, activeElement, selectionStart, selectionEnd }, submittedForm = null, { reconcileSubmittedDraft = false, logicalKey = '' } = {}) {
  const submittedSnapshot = submittedForm ? captureEditableFormSnapshot(submittedForm) : null;
  const submittedLogicalKey = logicalKey || submittedForm?.dataset.caseEditorLogicalKey || '';
  return async ({ result }) => {
    const successful = result.type === 'redirect' || result.type === 'success';
    const submittedKey = submittedForm ? editorFormKey(submittedForm) : '';
    const currentSubmittedSnapshot = submittedForm ? captureEditableFormSnapshot(submittedForm) : null;
    const formDrafts = captureEditorFormDrafts(successful ? submittedForm : null);
    if (result.type !== 'redirect') {
      await applyAction(result);
      await tick();
      restoreEditorFormDrafts(formDrafts);
      if (successful) {
        if (reconcileSubmittedDraft) reconcileSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey, submittedSnapshot, currentSubmittedSnapshot);
        else resetSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey);
      }
      return { ok: result.type === 'success' };
    }

    const location = new URL(result.location, document.baseURI);
    location.hash = '';
    replaceState(`${location.pathname}${location.search}`, {});
    await invalidateAll();
    await tick();
    restoreEditorFormDrafts(formDrafts);
    if (reconcileSubmittedDraft) reconcileSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey, submittedSnapshot, currentSubmittedSnapshot);
    else resetSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey);
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

export function isOrdinaryCaseEditorDraftForm(form) {
  return form?.id === 'case-details-form'
    || form?.classList?.contains('question-edit-form')
    || form?.hasAttribute?.('data-case-editor-coordinated');
}

export function caseEditorHasConflictingUnsavedWork(submittedForm, coordinator) {
  const otherPartialForm = [...document.querySelectorAll('.case-editor form')].some((form) => {
    if (!(form instanceof HTMLFormElement) || form === submittedForm || isOrdinaryCaseEditorDraftForm(form)) return false;
    return formHasMeaningfulUnsubmittedInput(form);
  });
  const submittedCoordinatorKey = submittedForm?.hasAttribute?.('data-case-editor-coordinated')
    ? `form:${editorFormKey(submittedForm)}`
    : null;
  const unrelatedDirtyDraft = !isOrdinaryCaseEditorDraftForm(submittedForm)
    && (coordinator?.dirtyCount?.(submittedCoordinatorKey) ?? 0) > 0;
  return otherPartialForm || unrelatedDirtyDraft;
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
  const status = document.createElement('span');
  status.className = 'case-editor-inline-save-state';
  status.setAttribute('role', 'status');
  status.hidden = true;
  node.append(status);

  function register() {
    return coordinator?.register(`form:${currentKey}`, {
      isDirty: () => node.isConnected && formHasMeaningfulUnsubmittedInput(node),
      save: () => {
        if (pending) return pending;
        if (!node.reportValidity()) return Promise.resolve(false);
        node.requestSubmit();
        return pending ?? Promise.resolve(false);
      }
    });
  }

  const refresh = () => coordinator?.refresh();
  node.addEventListener('input', refresh);
  node.addEventListener('change', refresh);

  node.dataset.caseEditorEnhanced = 'true';
  node.dataset.caseEditorLogicalKey = currentKey;
  const enhanced = enhance(node, ({ formElement, cancel }) => {
    if (pending) {
      cancel();
      return;
    }
    pending = new Promise((resolve) => { resolvePending = resolve; });
    status.hidden = false;
    status.textContent = 'Saving…';
    if (caseEditorHasConflictingUnsavedWork(formElement, coordinator) && !window.confirm('Another Case-editor form contains unsaved work. Continue and risk discarding it?')) {
      cancel();
      const resolve = resolvePending;
      pending = null;
      resolvePending = null;
      status.hidden = true;
      coordinator?.refresh();
      resolve?.(false);
      return;
    }
    const stable = stableCaseEditorEnhance(captureCaseEditorView(), formElement, { reconcileSubmittedDraft: true, logicalKey: currentKey });
    return async ({ result }) => {
      let ok = false;
      try {
        ok = (await stable({ result })).ok;
      } finally {
        const resolve = resolvePending;
        pending = null;
        resolvePending = null;
        coordinator?.refresh();
        status.textContent = ok ? 'Saved' : 'Save failed — try again';
        status.classList.toggle('error', !ok);
        resolve?.(ok);
      }
    };
  });

  return {
    update(nextKey) {
      if (nextKey === currentKey) return;
      unregister?.();
      currentKey = nextKey;
      node.dataset.caseEditorLogicalKey = currentKey;
      unregister = register();
    },
    destroy() {
      enhanced?.destroy?.();
      delete node.dataset.caseEditorEnhanced;
      delete node.dataset.caseEditorLogicalKey;
      status.remove();
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
