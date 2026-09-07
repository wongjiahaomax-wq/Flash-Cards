// @ts-nocheck

import { applyAction, enhance } from '$app/forms';
import { invalidateAll, replaceState } from '$app/navigation';
import { tick } from 'svelte';
import { createCoordinatedFormSaveState } from '$lib/case-editor-coordinator.js';
import { captureEditableFormSnapshot, changedFormFieldLabels, formCanHoldMeaningfulStructuralInput, formHasMeaningfulUnsubmittedInput, formHasMeaningfulUnsubmittedInputAgainst, mutationMayChangeEditorFormTopology, sameEditableFormSnapshot } from '$lib/case-editor-form-state.js';

export { captureEditableFormSnapshot, sameEditableFormSnapshot } from '$lib/case-editor-form-state.js';

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

function restoreEditableFormSnapshot(form, snapshot) {
  const elements = [...form.elements].filter((element) => {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
    if (element instanceof HTMLInputElement && ['hidden', 'submit', 'button', 'reset'].includes(element.type)) return false;
    return true;
  });
  elements.forEach((element, index) => {
    const value = snapshot[index];
    if (!value) return;
    if (element instanceof HTMLInputElement && element.type === 'file') return;
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

function structuralFormLabel(form) {
  const action = form.getAttribute('action') ?? '';
  if (action.includes('question-scope')) return 'Question scope change';
  if (action.includes('createStimulusGroup') || action.includes('startAlternativeSet')) return 'Create image set';
  if (action.includes('saveStimulusOptionQuestion')) return 'Image-specific question';
  if (action.includes('createReusableImageQuestion')) return 'Create reusable image question';
  if (action.includes('uploadAndAttach')) return 'Image upload';
  if (action.includes('attachMany')) return 'Image picker';
  if (form.querySelector('[name="prompt_md"]') && form.querySelector('[name="answer_md"]')) return 'Add Case question';
  return 'Case-editor form';
}

/**
 * Register non-saveable forms with an explicit initial baseline. A MutationObserver
 * keeps conditionally mounted editor forms in the same inventory as the header and guard.
 */
export function registerCaseEditorStructuralForms(coordinator) {
  if (!coordinator || typeof document === 'undefined') return () => {};
  const registrations = new Map();
  const isStructural = (form) => form instanceof HTMLFormElement
    && form.matches('.case-editor form')
    && !form.classList.contains('question-edit-form')
    && form.id !== 'case-details-form'
    && !form.hasAttribute('data-case-editor-coordinated')
    && !form.hasAttribute('data-case-editor-picker')
    && !form.hasAttribute('data-case-editor-picker-search')
    && formCanHoldMeaningfulStructuralInput(form);

  const sync = () => {
    const forms = new Set([...document.querySelectorAll('.case-editor form')].filter(isStructural));
    for (const [form, registration] of registrations) {
      if (forms.has(form) && form.isConnected) continue;
      registration.unregister?.();
      registration.status?.remove();
      form.removeEventListener('input', registration.refresh);
      form.removeEventListener('change', registration.refresh);
      registrations.delete(form);
      delete form.dataset.caseEditorStructuralKey;
    }
    for (const form of forms) {
      if (registrations.has(form)) continue;
      const baseline = captureEditableFormSnapshot(form);
      const key = `structural:${editorFormKey(form)}`;
      const label = structuralFormLabel(form);
      const entry = {
        saveable: false,
        label,
        isDirty: () => form.isConnected && formHasMeaningfulUnsubmittedInputAgainst(form, baseline),
        dirtyFields: () => changedFormFieldLabels(form, baseline),
        status: () => 'Not submitted — use this form\'s action',
        target: () => form.id || null
      };
      const status = document.createElement('span');
      status.className = 'case-editor-inline-save-state';
      status.setAttribute('role', 'status');
      status.hidden = true;
      form.append(status);
      const refresh = () => {
        const dirty = entry.isDirty();
        status.hidden = !dirty;
        status.textContent = dirty ? `${label} — Not submitted` : '';
        coordinator.refresh();
      };
      form.addEventListener('input', refresh);
      form.addEventListener('change', refresh);
      registrations.set(form, { unregister: coordinator.register(key, entry), status, refresh });
      form.dataset.caseEditorStructuralKey = key;
    }
  };

  sync();
  const root = document.querySelector('.case-editor') ?? document.body;
  const observer = new MutationObserver((records) => {
    if (mutationMayChangeEditorFormTopology(records)) sync();
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    for (const [form, registration] of registrations) {
      registration.unregister?.();
      registration.status?.remove();
      form.removeEventListener('input', registration.refresh);
      form.removeEventListener('change', registration.refresh);
      delete form.dataset.caseEditorStructuralKey;
    }
    registrations.clear();
  };
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
      return { ok: result.type === 'success', submittedSnapshot, currentSubmittedSnapshot };
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
    return { ok: true, submittedSnapshot, currentSubmittedSnapshot };
  };
}

export function isOrdinaryCaseEditorDraftForm(form) {
  return form?.id === 'case-details-form'
    || form?.classList?.contains('question-edit-form')
    || form?.hasAttribute?.('data-case-editor-coordinated');
}

export function caseEditorHasConflictingUnsavedWork(submittedForm, coordinator) {
  const otherPartialForm = [...document.querySelectorAll('.case-editor form')].some((form) => {
    if (!(form instanceof HTMLFormElement) || form === submittedForm || isOrdinaryCaseEditorDraftForm(form) || form.hasAttribute('data-case-editor-structural-key')) return false;
    return formHasMeaningfulUnsubmittedInput(form);
  });
  const submittedCoordinatorKey = submittedForm?.hasAttribute?.('data-case-editor-coordinated')
    ? `form:${editorFormKey(submittedForm)}`
    : null;
  const submittedStructuralKey = submittedForm?.dataset?.caseEditorStructuralKey ?? null;
  const submittedPickerKey = submittedForm?.id === 'case-image-picker-attach' ? 'picker-selection' : null;
  const unrelatedDirtyDraft = !isOrdinaryCaseEditorDraftForm(submittedForm)
    && (submittedPickerKey
      ? (coordinator?.dirtyItems?.({ excludeKey: submittedPickerKey }).length ?? 0) > 0
      : submittedStructuralKey
      ? (coordinator?.dirtyItems?.().some((item) => item.key !== submittedStructuralKey) ?? false)
      : (coordinator?.dirtyCount?.(submittedCoordinatorKey) ?? 0) > 0);
  const pickerSelectionDirty = submittedForm?.id !== 'case-image-picker-attach'
    && Boolean(document.querySelector('.case-editor [data-case-editor-picker-dirty="true"]'));
  return otherPartialForm || unrelatedDirtyDraft || pickerSelectionDirty;
}

export function hasCaseEditorPickerSelection() {
  return Boolean(document.querySelector('.case-editor [data-case-editor-picker-dirty="true"]'));
}

/**
 * Enhance and register a dynamically mounted ordinary Case-editor form.
 * Structural forms such as question-scope intentionally do not use this helper.
 */
export function registerCaseEditorForm(node, { coordinator, key }) {
  let currentKey = key;
  let baseline = captureEditableFormSnapshot(node);
  let unregister = register();
  let pending = null;
  let resolvePending = null;
  const status = document.createElement('span');
  status.className = 'case-editor-inline-save-state';
  status.setAttribute('role', 'status');
  status.hidden = true;
  node.append(status);
  const saveState = createCoordinatedFormSaveState(() => !sameEditableFormSnapshot(captureEditableFormSnapshot(node), baseline));

  function register() {
    return coordinator?.register(`form:${currentKey}`, {
      label: () => coordinatedFormLabel(node, currentKey),
      dirtyFields: () => changedFormFieldLabels(node, baseline),
      isSaving: () => saveState.isPending(),
      status: () => saveState.isPending() ? 'Saving…' : saveState.hasFailed() ? 'Save failed — still unsaved' : 'Unsaved — included in Save all',
      isDirty: () => node.isConnected && !sameEditableFormSnapshot(captureEditableFormSnapshot(node), baseline),
      save: () => {
        if (pending) return pending;
        if (!node.reportValidity()) return Promise.resolve(false);
        node.requestSubmit();
        return pending ?? Promise.resolve(false);
      }
    });
  }

  const refresh = () => {
    if (saveState.refresh() === 'Unsaved changes') {
      status.hidden = false;
      const fields = changedFormFieldLabels(node, baseline);
      status.textContent = fields.length ? `Unsaved changes — ${fields.join(', ')}` : 'Unsaved changes';
      status.classList.remove('error');
    }
    coordinator?.refresh();
  };
  node.addEventListener('input', refresh);
  node.addEventListener('change', refresh);

  node.dataset.caseEditorEnhanced = 'true';
  node.dataset.caseEditorLogicalKey = currentKey;
  const enhanced = enhance(node, ({ formElement, cancel }) => {
    if (pending) {
      cancel();
      return;
    }
    const submittedSnapshot = captureEditableFormSnapshot(formElement);
    pending = new Promise((resolve) => { resolvePending = resolve; });
    status.hidden = false;
    status.textContent = saveState.begin();
    if (caseEditorHasConflictingUnsavedWork(formElement, coordinator) && !window.confirm('Another Case-editor form contains unsaved work. Continue and risk discarding it?')) {
      cancel();
      const resolve = resolvePending;
      pending = null;
      resolvePending = null;
      saveState.cancel();
      status.hidden = true;
      coordinator?.refresh();
      resolve?.(false);
      return;
    }
    const stable = stableCaseEditorEnhance(captureCaseEditorView(), formElement, { reconcileSubmittedDraft: true, logicalKey: currentKey });
    return async ({ result }) => {
      let ok = false;
      try {
        const outcome = await stable({ result });
        ok = outcome.ok;
        if (ok && sameEditableFormSnapshot(outcome.currentSubmittedSnapshot, outcome.submittedSnapshot)) {
          const candidate = findSubmittedEditorForm(formElement, editorFormKey(formElement), currentKey);
          if (candidate) baseline = captureEditableFormSnapshot(candidate);
        }
      } finally {
        const resolve = resolvePending;
        pending = null;
        resolvePending = null;
        status.textContent = saveState.complete(ok);
        status.classList.toggle('error', !ok);
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
      baseline = captureEditableFormSnapshot(node);
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

function coordinatedFormLabel(node, key) {
  const text = (selector, root = node) => root.querySelector(selector)?.textContent?.trim().replace(/\s+/g, ' ') || '';
  const fixedImage = text('.asset-title strong', node.closest('.fixed-asset-card') ?? node);
  const optionImage = text('.option-editor-heading h4', node.closest('.option-editor') ?? node);
  const imageSet = text('h3', node.closest('.alternative-set') ?? node);
  if (key.startsWith('caption:')) return fixedImage ? `Always-shown image “${fixedImage}”` : 'Always-shown image';
  if (key.startsWith('option-caption:')) return optionImage ? `Image “${optionImage}”` : 'Image-specific caption';
  const title = node.querySelector('textarea[name="answer_md"], input[name="answer_md"]')
    ? (key.startsWith('reusable-answer:') ? (optionImage ? `Reusable image question “${optionImage}”` : 'Reusable image question') : key.startsWith('group-') ? (imageSet ? `Image set “${imageSet}”` : 'Image set') : key.startsWith('option-') ? (optionImage ? `Image-specific question “${optionImage}”` : 'Image-specific question') : 'Question')
    : key.startsWith('group-settings:') ? (imageSet ? `Image set “${imageSet}”` : 'Image set')
        : 'Case-editor form';
  return title;
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
