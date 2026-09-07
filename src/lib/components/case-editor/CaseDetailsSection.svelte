<script>
  // @ts-nocheck
  import { onDestroy, onMount } from 'svelte';
  import { enhance } from '$app/forms';
  import { caseEditorUnsavedWorkMessage, captureCaseEditorView, stableCaseEditorEnhance } from '$lib/case-editor-mutation.js';
  import { cloneCaseEditorSnapshot, reconcileSubmittedCaseEditorDraft, sameCaseEditorSnapshot } from '$lib/case-editor-coordinator.js';
  import AccessibleInfo from '$lib/components/AccessibleInfo.svelte';

  let { selectedCase, primaryTopic, editorLayout, coordinator = null, caseLibraryReturnQuery = '' } = $props();
  const serverSnapshot = (value) => ({
    title: value.case.title ?? '',
    vignetteMd: value.case.vignetteMd ?? '',
    questionSelectionMode: value.case.questionSelectionMode ?? 'automatic',
    questionCount: value.case.questionCount ?? ''
  });
  let draft = $state({ title: '', vignetteMd: '', questionSelectionMode: 'automatic', questionCount: '' });
  let baseline = $state({ title: '', vignetteMd: '', questionSelectionMode: 'automatic', questionCount: '' });
  let initialized = $state(false);
  let detailsForm = $state();
  let pending = $state(null);
  let submittedSnapshot = $state(null);
  let saveState = $state('saved');
  let resolvePending = null;
  let dirty = $derived(!sameCaseEditorSnapshot(draft, baseline));
  function dirtyFields() {
    return [
      draft.title !== baseline.title ? 'Internal title' : null,
      draft.vignetteMd !== baseline.vignetteMd ? 'Vignette' : null,
      draft.questionSelectionMode !== baseline.questionSelectionMode ? 'Question selection' : null,
      draft.questionCount !== baseline.questionCount ? 'Question count' : null
    ].filter(Boolean);
  }

  $effect(() => {
    const current = serverSnapshot(selectedCase);
    if (!initialized) {
      baseline = current;
      draft = cloneCaseEditorSnapshot(current);
      initialized = true;
    } else if (!pending && !dirty) {
      if (!sameCaseEditorSnapshot(baseline, current)) baseline = current;
      if (!sameCaseEditorSnapshot(draft, current)) draft = cloneCaseEditorSnapshot(current);
    }
  });

  function beginSubmit(snapshot = draft) {
    submittedSnapshot = cloneCaseEditorSnapshot(snapshot);
    pending = new Promise((resolve) => { resolvePending = resolve; });
    saveState = 'saving';
    coordinator?.refresh();
  }

  function prepareDraftSave() {
    return detailsForm?.reportValidity() ? cloneCaseEditorSnapshot(draft) : null;
  }
  function commitDraftSave(snapshot, authoritative = null) {
    const reconciled = reconcileSubmittedCaseEditorDraft(draft, snapshot, authoritative ?? snapshot);
    baseline = reconciled.baseline;
    draft = reconciled.draft;
    saveState = 'saved';
    coordinator?.refresh();
  }

  function submitDraft(snapshot = null) {
    if (pending) return pending;
    if (!snapshot && !detailsForm?.reportValidity()) return Promise.resolve(false);
    if (snapshot) submittedSnapshot = cloneCaseEditorSnapshot(snapshot);
    detailsForm.requestSubmit();
    return pending ?? Promise.resolve(false);
  }

  function enhanceDetails({ formElement, cancel }) {
    if (pending) {
      cancel();
      return;
    }
    const conflictMessage = caseEditorUnsavedWorkMessage(formElement, coordinator, { allowSaveableWork: true, allowStructuralWork: true });
    if (conflictMessage) {
      window.alert(conflictMessage);
      cancel();
      return;
    }
    beginSubmit(submittedSnapshot ?? draft);
    const view = captureCaseEditorView();
    const stable = stableCaseEditorEnhance(view, formElement, {
      reconcileSubmittedDraft: true,
      deferInvalidation: () => coordinator?.dirtyCount?.('case-details') > 0
    });
    return async ({ result }) => {
      const outcome = await stable({ result });
      if (outcome.ok) {
        const current = outcome.deferred ? submittedSnapshot : serverSnapshot(selectedCase);
        const reconciled = reconcileSubmittedCaseEditorDraft(draft, submittedSnapshot, current);
        baseline = reconciled.baseline;
        draft = reconciled.draft;
        saveState = 'saved';
      } else {
        saveState = 'error';
      }
      const resolve = resolvePending;
      pending = null;
      submittedSnapshot = null;
      resolvePending = null;
      coordinator?.refresh();
      resolve?.(outcome.ok);
    };
  }

  onMount(() => coordinator?.register('case-details', {
    label: 'Case details',
    dirtyFields,
    isSaving: () => Boolean(pending),
    status: () => pending ? 'Saving…' : !dirty ? 'Saved' : saveState === 'error' ? 'Save failed — still unsaved' : 'Unsaved — included in Save all',
    isDirty: () => dirty,
    prepareSave: prepareDraftSave,
    saveAllPayload: (snapshot) => ({ kind: 'case-details', fields: snapshot }),
    commitSaveAll: commitDraftSave,
    save: submitDraft
  }));
  onDestroy(() => coordinator?.refresh());
</script>

<section id="case" class="panel stack">
  <div class="case-heading">
    <div>
      <p class="eyebrow">Clinical presentation</p>
      <h2>
        Case
        {#if editorLayout === 'compact'}
          <AccessibleInfo label="Case" text="The Case is one coherent clinical presentation. The internal title is Admin-facing; the learner sees the vignette/stem and selected stimuli." />
        {/if}
      </h2>
      <p class="muted compact-hide-explainer">Cases under the same Topic can have different stems, causes, findings, or educational intent. The internal title is not shown to learners.</p>
    </div>
    <span class="save-state" class:error={saveState === 'error' && dirty}>{saveState === 'saving' ? 'Saving…' : dirty && saveState === 'error' ? 'Save failed — changes remain unsaved' : dirty ? `Unsaved changes — ${dirtyFields().join(', ')}` : 'Saved'}</span><button class="button primary" type="submit" form="case-details-form" disabled={Boolean(pending)}>Save Case</button>
  </div>

  <form bind:this={detailsForm} id="case-details-form" method="POST" action="?/updateCase" class="case-form" data-case-editor-internal use:enhance={enhanceDetails}>
    <input type="hidden" name="case_id" value={selectedCase.case.id} />
    <input type="hidden" name="return_query" value={caseLibraryReturnQuery} />

    <label class="title-field">
      Internal Case title
      <input name="title" bind:value={draft.title} oninput={() => coordinator?.refresh()} maxlength="300" required />
    </label>

    <div class="current-case-topic">
      <span class="topic-label">Primary Topic</span>
      <span class="topic-state">
        {#if primaryTopic}
          <a class="topic-link" href={'/admin/topics/' + primaryTopic.id}>{primaryTopic.name}</a>
        {:else}
          <span class="muted">No primary Topic assigned</span>
        {/if}
      </span>
      <a class="topic-manage" href="#topics">Change in Topics</a>
    </div>

    <div class="case-main-layout">
      <label class="vignette-field">
        <span>Case stem / vignette <span class="muted field-helper">Optional</span></span>
        <textarea name="vignette_md" bind:value={draft.vignetteMd} oninput={() => coordinator?.refresh()} rows="6" maxlength="5000"></textarea>
      </label>

      <aside class="review-setup" aria-labelledby="review-setup-heading">
        <div class="review-setup-heading">
          <strong id="review-setup-heading">Review setup</strong>
          <span class="muted">How this Case samples eligible questions.</span>
        </div>

        <label>
          Question selection
          <select name="question_selection_mode" bind:value={draft.questionSelectionMode} onchange={() => coordinator?.refresh()}>
            <option value="automatic">Automatic</option>
            <option value="all">Ask all eligible</option>
            <option value="fixed">Choose N questions</option>
          </select>
        </label>

        <label hidden={draft.questionSelectionMode !== 'fixed'}>
          Question count
          <input type="number" name="question_count" bind:value={draft.questionCount} oninput={() => coordinator?.refresh()} min="1" />
        </label>
      </aside>
    </div>
  </form>
</section>

<style>
  h2, p { margin-top: 0; }
  h2 { margin-bottom: 0.2rem; font-size: 1.2rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .stack { display: grid; gap: 0.85rem; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; }
  .case-heading { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
  .case-heading > div { min-width: 0; }
  .case-heading p:last-child { margin-bottom: 0; }
  .case-form { display: grid; gap: 0.8rem; }
  label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; }
  input, textarea, select { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  textarea { resize: vertical; }
  .title-field { width: 100%; }
  .current-case-topic { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem 0.7rem; min-height: 2.2rem; padding: 0.15rem 0; color: #344054; }
  .topic-label { color: #667085; font-size: 0.78rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.035em; }
  .topic-state { min-width: 0; }
  .topic-link { display: inline-block; padding: 0.32rem 0.55rem; border: 1px solid #d0d5dd; border-radius: 999px; background: #f8fafc; color: #344054; font-size: 0.86rem; font-weight: 650; text-decoration: none; }
  .topic-link:hover { border-color: #98a2b3; background: #f2f4f7; }
  .topic-manage { margin-left: auto; color: #475467; font-size: 0.8rem; font-weight: 650; }
  .case-main-layout { display: grid; gap: 0.9rem; align-items: stretch; }
  .vignette-field { min-width: 0; }
  .vignette-field textarea { min-height: 10.5rem; }
  .field-helper { margin-left: 0.25rem; font-size: 0.78rem; font-weight: 500; }
  .review-setup { display: grid; align-content: start; gap: 0.8rem; min-width: 0; padding: 0.9rem; border: 1px solid #dfe5ee; border-radius: 9px; background: #f8fafc; }
  .review-setup-heading { display: grid; gap: 0.15rem; padding-bottom: 0.65rem; border-bottom: 1px solid #e4e7ec; }
  .review-setup-heading strong { color: #172033; font-size: 0.94rem; }
  .review-setup-heading span { font-size: 0.78rem; line-height: 1.35; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .save-state { color: #667085; font-size: 0.8rem; font-weight: 650; }
  .save-state.error { color: #b42318; }
  button:focus-visible, a:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  :global(.case-editor[data-editor-layout="compact"]) .compact-hide-explainer { display: none; }

  @media (min-width: 1024px) {
    :global(.case-editor[data-editor-layout="compact"]) #case { scroll-margin-top: 4.75rem; }
    .case-main-layout { grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); }
  }

  @media (max-width: 760px) {
    .case-heading { flex-direction: column; }
    .case-heading .button { width: 100%; }
    .topic-manage { width: 100%; margin-left: 0; }
    .vignette-field textarea { min-height: 9rem; }
  }
</style>
