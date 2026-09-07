// @ts-nocheck

import { applyAction, enhance } from '$app/forms';
import { invalidateAll, replaceState } from '$app/navigation';
import { tick } from 'svelte';
import { createCoordinatedFormSaveState } from '$lib/case-editor-coordinator.js';
import { captureEditableFormSnapshot, changedFormFieldLabels, formCanHoldMeaningfulStructuralInput, formHasMeaningfulUnsubmittedInput, formHasSelectedFile, mutationMayChangeEditorFormTopology, sameEditableFormSnapshot } from '$lib/case-editor-form-state.js';

export { captureEditableFormSnapshot, sameEditableFormSnapshot } from '$lib/case-editor-form-state.js';

export function editorFormKey(form) {
  const action = form.getAttribute('action') ?? '';
  const hidden = [...form.querySelectorAll('input[type="hidden"]')]
    .map((input) => `${input.name}=${input.value}`)
    .sort()
    .join('&');
  return `${action}|${hidden}`;
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
  const candidate = findSubmittedEditorForm(form, key, logicalKey);
  if (candidate?.hasAttribute?.('data-case-editor-controlled')) return;
  candidate?.reset?.();
}

function reconcileSubmittedEditorForm(form, key, logicalKey, submittedSnapshot, currentSnapshot, authoritativeSnapshot) {
  const candidate = findSubmittedEditorForm(form, key, logicalKey);
  if (!candidate) return;
  if (sameEditableFormSnapshot(currentSnapshot, submittedSnapshot)) {
    if (authoritativeSnapshot) restoreEditableFormSnapshot(candidate, authoritativeSnapshot);
    return;
  }
  restoreEditableFormSnapshot(candidate, currentSnapshot);
}

function structuralFormLabel(form) {
  const action = form.getAttribute('action') ?? '';
  if (action.includes('question-scope')) return 'Question scope change';
  if (action.includes('createStimulusGroup') || action.includes('startAlternativeSet')) return 'Create image set';
  if (action.includes('saveStimulusOptionQuestion')) return 'Image-specific question';
  if (action.includes('createReusableImageQuestion')) return 'Create reusable image question';
  if (action.includes('uploadAndAttach')) return 'Image upload';
  if (action.includes('attachMany')) return 'Image picker';
  if (action.includes('assignPrimaryTopicToSystem')) return 'Primary Topic — Parent System';
  if (action.includes('promoteTopic')) return 'Primary Topic replacement';
  if (action.includes('createCaseTopic')) return 'Create Topic';
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
      let baseline = captureEditableFormSnapshot(form);
      let cachedSnapshot = baseline;
      let cachedDirty = false;
      let cachedFields = [];
      const updateCachedState = () => {
        const nextSnapshot = captureEditableFormSnapshot(form);
        const nextDirty = !sameEditableFormSnapshot(nextSnapshot, baseline);
        const nextFields = nextDirty ? changedFormFieldLabels(form, baseline, nextSnapshot) : [];
        const changed = cachedDirty !== nextDirty
          || !sameEditableFormSnapshot(cachedSnapshot, nextSnapshot)
          || JSON.stringify(cachedFields) !== JSON.stringify(nextFields);
        cachedSnapshot = nextSnapshot;
        cachedDirty = nextDirty;
        cachedFields = nextFields;
        return changed;
      };
      const key = `structural:${editorFormKey(form)}`;
      const label = structuralFormLabel(form);
      const entry = {
        saveable: false,
        label,
        isDirty: () => form.isConnected && cachedDirty,
        dirtyFields: () => cachedFields,
        status: () => 'Not submitted — use this form\'s action',
        target: () => form.id || null,
        rebaseline(snapshot) {
          baseline = snapshot ?? captureEditableFormSnapshot(form);
          updateCachedState();
          status.hidden = !cachedDirty;
          status.textContent = cachedDirty ? `${label} — Not submitted` : '';
          coordinator.refresh();
        }
      };
      const status = document.createElement('span');
      status.className = 'case-editor-inline-save-state';
      status.setAttribute('role', 'status');
      status.hidden = true;
      form.append(status);
      const refresh = () => {
        if (!updateCachedState()) return;
        const dirty = cachedDirty;
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

/** @param {{ scrollX: number, scrollY: number, activeElement: Element | null, selectionStart: number | null, selectionEnd: number | null }} view @param {HTMLFormElement | null} [submittedForm] @param {{ reconcileSubmittedDraft?: boolean, logicalKey?: string, deferInvalidation?: boolean | (() => boolean), submittedSnapshot?: any[] | null }} [options] */
export function stableCaseEditorEnhance({ scrollX, scrollY, activeElement, selectionStart, selectionEnd }, submittedForm = null, { reconcileSubmittedDraft = false, logicalKey = '', deferInvalidation = false, submittedSnapshot: plannedSnapshot = null } = {}) {
  const submittedSnapshot = plannedSnapshot ?? (submittedForm ? captureEditableFormSnapshot(submittedForm) : null);
  const submittedLogicalKey = logicalKey || submittedForm?.dataset.caseEditorLogicalKey || '';
  return async ({ result }) => {
    const successful = result.type === 'redirect' || result.type === 'success';
    const submittedKey = submittedForm ? editorFormKey(submittedForm) : '';
    const currentSubmittedSnapshot = submittedForm ? captureEditableFormSnapshot(submittedForm) : null;
    if (result.type !== 'redirect') {
      await applyAction(result);
      await tick();
      const authoritativeCandidate = successful
        ? findSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey)
        : null;
      const authoritativeSnapshot = authoritativeCandidate ? captureEditableFormSnapshot(authoritativeCandidate) : null;
      if (successful) {
        if (reconcileSubmittedDraft) reconcileSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey, submittedSnapshot, currentSubmittedSnapshot, authoritativeSnapshot);
        else resetSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey);
      }
      const postSuccessCandidate = successful ? findSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey) : null;
      const postSuccessSnapshot = postSuccessCandidate ? captureEditableFormSnapshot(postSuccessCandidate) : null;
      return { ok: result.type === 'success', submittedSnapshot, currentSubmittedSnapshot, authoritativeSnapshot, postSuccessSnapshot };
    }

    const location = new URL(result.location, document.baseURI);
    location.hash = '';
    replaceState(`${location.pathname}${location.search}`, {});
    const deferred = typeof deferInvalidation === 'function' ? deferInvalidation() : deferInvalidation;
    if (!deferred) await invalidateAll();
    await tick();
    const authoritativeCandidate = findSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey);
    const authoritativeSnapshot = authoritativeCandidate ? captureEditableFormSnapshot(authoritativeCandidate) : null;
    if (reconcileSubmittedDraft) reconcileSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey, submittedSnapshot, currentSubmittedSnapshot, authoritativeSnapshot);
    else resetSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey);
    const postSuccessCandidate = findSubmittedEditorForm(submittedForm, submittedKey, submittedLogicalKey);
    const postSuccessSnapshot = postSuccessCandidate ? captureEditableFormSnapshot(postSuccessCandidate) : null;
    window.scrollTo(scrollX, scrollY);
    if (activeElement?.isConnected && typeof activeElement.focus === 'function') {
      activeElement.focus({ preventScroll: true });
      if (selectionStart !== null && 'setSelectionRange' in activeElement) {
        activeElement.setSelectionRange(selectionStart, selectionEnd);
      }
    }
    return { ok: true, deferred, submittedSnapshot, currentSubmittedSnapshot, authoritativeSnapshot, postSuccessSnapshot };
  };
}

export function isOrdinaryCaseEditorDraftForm(form) {
  return form?.id === 'case-details-form'
    || form?.classList?.contains('question-edit-form')
    || form?.hasAttribute?.('data-case-editor-coordinated');
}

function submittedCaseEditorKey(form) {
  if (!form) return null;
  if (form.id === 'case-image-picker-attach' || form.matches?.('[data-case-editor-picker-search]')) return 'picker-selection';
  if (form.id === 'case-details-form') return 'case-details';
  if (form.classList?.contains('question-edit-form')) {
    const caseQuestionId = form.id?.startsWith('question-edit-') ? form.id.slice('question-edit-'.length) : '';
    return caseQuestionId ? `question:${caseQuestionId}` : null;
  }
  if (form.hasAttribute?.('data-case-editor-coordinated')) {
    return `form:${form.dataset?.caseEditorLogicalKey || editorFormKey(form)}`;
  }
  return form.dataset?.caseEditorStructuralKey ?? null;
}

function conflictItemLabel(item) {
  return item.fields?.length ? `${item.label} — ${item.fields.join(', ')}` : item.label;
}

function structuralFormConflictLabels(submittedForm, knownKeys) {
  if (typeof document === 'undefined') return [];
  const labels = [];
  for (const form of [...document.querySelectorAll('.case-editor form')]) {
    if (!(form instanceof HTMLFormElement) || form === submittedForm || isOrdinaryCaseEditorDraftForm(form)) continue;
    const key = form.dataset?.caseEditorStructuralKey;
    if (key && knownKeys.has(key)) continue;
    if (formHasMeaningfulUnsubmittedInput(form) || formHasSelectedFile(form)) labels.push(structuralFormLabel(form));
  }
  if (submittedForm?.id !== 'case-image-picker-attach' && document.querySelector('.case-editor [data-case-editor-picker-dirty="true"]')) {
    if (!knownKeys.has('picker-selection')) labels.push('Image picker');
  }
  return labels;
}

/**
 * Return the blocking explanation for an individual save or Save All, if any.
 * @param {HTMLFormElement | null} [submittedForm]
 * @param {any} coordinator
 */
export function caseEditorUnsavedWorkMessage(submittedForm = null, coordinator, { allowSaveableWork = false } = {}) {
  const submittedKey = submittedCaseEditorKey(submittedForm);
  const items = coordinator?.dirtyItems?.() ?? [];
  const otherItems = items.filter((item) => item.key !== submittedKey);
  const structuralItems = otherItems.filter((item) => !item.saveable);
  const saveableItems = submittedForm && !allowSaveableWork ? otherItems.filter((item) => item.saveable) : [];
  const knownStructuralKeys = new Set(structuralItems.map((item) => item.key));
  const structuralLabels = [...new Set([...structuralItems.map(conflictItemLabel), ...structuralFormConflictLabels(submittedForm, knownStructuralKeys)])];
  const messages = [];
  if (structuralLabels.length) {
    const verb = structuralLabels.length === 1 ? 'has' : 'have';
    messages.push(`Submit or discard it first: ${structuralLabels.join(', ')} ${verb} incomplete structural work.`);
  }
  if (saveableItems.length) {
    const verb = saveableItems.length === 1 ? 'is' : 'are';
    messages.push(`Save all changes instead: ${saveableItems.map(conflictItemLabel).join(', ')} ${verb} also unsaved.`);
  }
  return messages.length ? `Cannot continue. ${messages.join(' ')}` : '';
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
  let cachedSnapshot = baseline;
  let cachedDirty = false;
  let cachedFields = [];
  let unregister = register();
  let pending = null;
  let resolvePending = null;
  let preparedSnapshot = null;
  const status = document.createElement('span');
  status.className = 'case-editor-inline-save-state';
  status.setAttribute('role', 'status');
  status.hidden = true;
  node.append(status);
  const updateCachedState = () => {
    const nextSnapshot = captureEditableFormSnapshot(node);
    const nextDirty = !sameEditableFormSnapshot(nextSnapshot, baseline);
    const nextFields = nextDirty ? changedFormFieldLabels(node, baseline, nextSnapshot) : [];
    const changed = cachedDirty !== nextDirty
      || !sameEditableFormSnapshot(cachedSnapshot, nextSnapshot)
      || JSON.stringify(cachedFields) !== JSON.stringify(nextFields);
    cachedSnapshot = nextSnapshot;
    cachedDirty = nextDirty;
    cachedFields = nextFields;
    return changed;
  };
  const saveState = createCoordinatedFormSaveState(() => cachedDirty);

  function register() {
    return coordinator?.register(`form:${currentKey}`, {
      label: () => coordinatedFormLabel(node, currentKey),
      dirtyFields: () => cachedFields,
      isSaving: () => saveState.isPending(),
      status: () => saveState.isPending() ? 'Saving…' : saveState.hasFailed() ? 'Save failed — still unsaved' : 'Unsaved — included in Save all',
      isDirty: () => node.isConnected && cachedDirty,
      prepareSave: () => node.reportValidity() ? captureEditableFormSnapshot(node) : null,
      saveAllPayload: (snapshot) => ({ kind: 'form', action: node.getAttribute('action') ?? '', fields: snapshot }),
      commitSaveAll: (snapshot) => {
        baseline = snapshot;
        saveState.complete(true);
        updateCachedState();
        coordinator?.refresh();
      },
      save: (snapshot = null) => {
        if (pending) return pending;
        if (!snapshot && !node.reportValidity()) return Promise.resolve(false);
        preparedSnapshot = snapshot;
        node.requestSubmit();
        return pending ?? Promise.resolve(false);
      }
    });
  }

  const refresh = () => {
    if (!updateCachedState()) return;
    const currentStatus = saveState.refresh();
    if (currentStatus === 'Unsaved changes') {
      status.hidden = false;
      status.textContent = cachedFields.length ? `Unsaved changes — ${cachedFields.join(', ')}` : 'Unsaved changes';
      status.classList.remove('error');
    } else if (!cachedDirty && !saveState.isPending()) {
      status.hidden = true;
      status.textContent = '';
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
    const submittedSnapshot = preparedSnapshot ?? captureEditableFormSnapshot(formElement);
    preparedSnapshot = null;
    pending = new Promise((resolve) => { resolvePending = resolve; });
    status.hidden = false;
    status.textContent = saveState.begin();
    const conflictMessage = caseEditorUnsavedWorkMessage(formElement, coordinator);
    if (conflictMessage) {
      window.alert(conflictMessage);
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
    const stable = stableCaseEditorEnhance(captureCaseEditorView(), formElement, { reconcileSubmittedDraft: true, logicalKey: currentKey, submittedSnapshot });
    return async ({ result }) => {
      let ok = false;
      let outcome = null;
      try {
        outcome = await stable({ result });
        ok = outcome.ok;
        if (ok) baseline = outcome.deferred ? outcome.submittedSnapshot : outcome.authoritativeSnapshot ?? outcome.submittedSnapshot ?? baseline;
        updateCachedState();
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
      updateCachedState();
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
