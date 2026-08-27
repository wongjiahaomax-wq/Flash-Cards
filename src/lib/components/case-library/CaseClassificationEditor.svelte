<script>
  import { invalidateAll } from '$app/navigation';
  import { tick } from 'svelte';
  import {
    CASE_LIBRARY_UNASSIGNED_SYSTEM,
    caseLibrarySystemContextForTopic,
    caseLibraryTopicLabel,
    filterCaseLibraryParentOptionsBySystem,
    filterCaseLibraryTopicsBySystem
  } from '$lib/case-library-classification.ts';

  /** @type {{ caseId: string, caseTitle: string, currentTopicId: string, currentTopicName: string, currentSystemName: string, topics: { id: string, name: string, breadcrumb: { id: string, name: string, kind: string }[] }[], parentOptions: { id: string, name: string, kind: string, breadcrumb: { id: string, name: string, kind: string }[] }[] }} */
  let { caseId, caseTitle, currentTopicId, currentTopicName, currentSystemName, topics, parentOptions } = $props();

  let root = $state();
  let triggerButton = $state();
  let systemSelect = $state();
  let newTopicInput = $state();
  let editorOpen = $state(false);
  let newTopicOpen = $state(false);
  let systemContext = $state(CASE_LIBRARY_UNASSIGNED_SYSTEM);
  let selectedTopicId = $state('');
  let newTopicName = $state('');
  let newTopicParentId = $state('');
  let error = $state('');
  let busy = $state(false);

  let currentTopic = $derived(topics.find((topic) => topic.id === currentTopicId) ?? null);
  let currentTopicLabel = $derived(currentTopic ? caseLibraryTopicLabel(currentTopic) : currentTopicName || 'Unassigned');
  let systemOptions = $derived(parentOptions.filter((option) => option.kind === 'system').sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)));
  let filteredTopics = $derived(filterCaseLibraryTopicsBySystem(topics, systemContext));
  let filteredParentOptions = $derived(filterCaseLibraryParentOptionsBySystem(parentOptions, systemContext));

  /** @param {string} context */
  function defaultParentForSystem(context) {
    return context === CASE_LIBRARY_UNASSIGNED_SYSTEM ? '' : context;
  }

  async function openEditor() {
    systemContext = currentTopic ? caseLibrarySystemContextForTopic(currentTopic) : CASE_LIBRARY_UNASSIGNED_SYSTEM;
    selectedTopicId = currentTopicId;
    newTopicOpen = false;
    newTopicName = '';
    newTopicParentId = defaultParentForSystem(systemContext);
    error = '';
    editorOpen = true;
    await tick();
    systemSelect?.focus();
  }

  async function closeEditor(restoreFocus = true) {
    editorOpen = false;
    newTopicOpen = false;
    error = '';
    if (!restoreFocus) return;
    await tick();
    triggerButton?.focus();
  }

  /** @param {string} nextContext */
  function changeSystem(nextContext) {
    systemContext = nextContext;
    if (selectedTopicId && !filterCaseLibraryTopicsBySystem(topics, nextContext).some((topic) => topic.id === selectedTopicId)) {
      selectedTopicId = '';
    }
    newTopicParentId = defaultParentForSystem(nextContext);
  }

  async function openNewTopic() {
    newTopicOpen = true;
    newTopicName = '';
    newTopicParentId = defaultParentForSystem(systemContext);
    error = '';
    await tick();
    newTopicInput?.focus();
  }

  /** @param {'select-topic' | 'create-topic'} operation */
  async function mutate(operation) {
    error = '';
    busy = true;
    const body = new FormData();
    body.set('case_id', caseId);
    body.set('operation', operation);
    if (operation === 'select-topic') {
      body.set('concept_id', selectedTopicId);
    } else {
      body.set('name', newTopicName.trim());
      body.set('parent_id', newTopicParentId);
    }

    try {
      const response = await fetch(`/admin/cases/${encodeURIComponent(caseId)}/classification`, { method: 'POST', body });
      if (!response.ok) {
        error = (await response.text()).trim() || 'Unable to update this Case classification.';
        return;
      }
      await invalidateAll();
      await closeEditor(false);
    } catch {
      error = 'Unable to update this Case classification.';
    } finally {
      busy = false;
    }
  }

  /** @param {PointerEvent} event */
  function closeOnOutsidePointer(event) {
    if (!editorOpen) return;
    const target = event.target;
    if (target instanceof Node && root instanceof Node && !root.contains(target)) void closeEditor(false);
  }

  /** @param {KeyboardEvent} event */
  function closeOnEscape(event) {
    if (event.key !== 'Escape' || !editorOpen) return;
    event.preventDefault();
    void closeEditor(true);
  }

  /** @param {KeyboardEvent} event */
  function preventOuterFormSubmit(event) {
    if (event.key === 'Enter') event.preventDefault();
  }
</script>

<svelte:window onpointerdowncapture={closeOnOutsidePointer} onkeydown={closeOnEscape} />

<div class="case-classification-editor" bind:this={root}>
  <button bind:this={triggerButton} class="trigger" type="button" aria-expanded={editorOpen} onclick={() => editorOpen ? void closeEditor(false) : void openEditor()}>Edit classification</button>

  {#if editorOpen}
    <div class="editor-panel" role="dialog" aria-label={`Edit classification for ${caseTitle}`}>
      <div class="editor-heading">
        <div>
          <strong>Edit classification</strong>
          <span>{caseTitle}</span>
        </div>
        <button type="button" class="close-button" aria-label="Close classification editor" onclick={() => void closeEditor(true)}>×</button>
      </div>

      <div class="current-context" aria-label="Current Case classification">
        <span><strong>Current Topic</strong>{currentTopicLabel}</span>
        <span><strong>Current System</strong>{currentSystemName || 'Unassigned'}</span>
      </div>

      <label for={`classification-system-${caseId}`}>
        System
        <select bind:this={systemSelect} id={`classification-system-${caseId}`} value={systemContext} disabled={busy} onchange={(event) => changeSystem(event.currentTarget.value)}>
          <option value={CASE_LIBRARY_UNASSIGNED_SYSTEM}>Unassigned</option>
          {#each systemOptions as system}<option value={system.id}>{system.name}</option>{/each}
        </select>
        <span class="field-help">Filters Topic choices only; it does not change taxonomy hierarchy.</span>
      </label>

      <label for={`classification-topic-${caseId}`}>
        Topic
        <select id={`classification-topic-${caseId}`} value={selectedTopicId} disabled={busy} onchange={(event) => selectedTopicId = event.currentTarget.value}>
          <option value="">Choose a Topic</option>
          {#each filteredTopics as topic}<option value={topic.id}>{caseLibraryTopicLabel(topic)}</option>{/each}
        </select>
      </label>

      <button type="button" class="new-topic-trigger" disabled={busy} aria-expanded={newTopicOpen} onclick={() => newTopicOpen ? newTopicOpen = false : void openNewTopic()}>+ New Topic</button>

      {#if newTopicOpen}
        <section class="new-topic-section" aria-label={`Create a new Topic for ${caseTitle}`}>
          <label for={`classification-new-topic-${caseId}`}>
            Topic name
            <input bind:this={newTopicInput} id={`classification-new-topic-${caseId}`} value={newTopicName} maxlength="200" disabled={busy} placeholder="Canonical Topic name" oninput={(event) => newTopicName = event.currentTarget.value} onkeydown={preventOuterFormSubmit} />
          </label>
          <label for={`classification-parent-${caseId}`}>
            Parent placement
            <select id={`classification-parent-${caseId}`} value={newTopicParentId} disabled={busy} onchange={(event) => newTopicParentId = event.currentTarget.value}>
              {#if systemContext === CASE_LIBRARY_UNASSIGNED_SYSTEM}<option value="">Unassigned</option>{/if}
              {#each filteredParentOptions as option}
                <option value={option.id}>{option.kind === 'system' ? `System — ${option.name}` : caseLibraryTopicLabel(option)}</option>
              {/each}
            </select>
          </label>
          <div class="new-topic-actions">
            <button type="button" class="button" disabled={busy} onclick={() => newTopicOpen = false}>Cancel new Topic</button>
            <button type="button" class="button primary" disabled={busy || !newTopicName.trim()} onclick={() => void mutate('create-topic')}>Create & assign</button>
          </div>
        </section>
      {/if}

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <div class="editor-actions">
        <button type="button" class="button" disabled={busy} onclick={() => void closeEditor(true)}>Cancel</button>
        <button type="button" class="button primary" disabled={busy || !selectedTopicId} onclick={() => void mutate('select-topic')}>Save</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .case-classification-editor { position: relative; min-width: 0; }
  .trigger, .button, .close-button, .new-topic-trigger { border: 1px solid #cdd6e3; background: #fff; color: #172033; font: inherit; cursor: pointer; }
  .trigger { padding: 0.2rem 0.45rem; border-radius: 999px; font-size: 0.76rem; font-weight: 700; white-space: nowrap; }
  .editor-panel { position: absolute; z-index: 30; top: calc(100% + 0.45rem); left: 0; width: min(440px, calc(100vw - 2.5rem)); padding: 0.95rem; border: 1px solid #d0d5dd; border-radius: 10px; background: #fff; box-shadow: 0 14px 34px rgba(16, 24, 40, 0.16); color: #172033; }
  .editor-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
  .editor-heading > div { display: grid; gap: 0.15rem; min-width: 0; }
  .editor-heading span { color: #667085; font-size: 0.82rem; overflow-wrap: anywhere; }
  .close-button { width: 2rem; height: 2rem; flex: 0 0 auto; padding: 0; border-radius: 7px; font-size: 1.2rem; line-height: 1; }
  .current-context { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; margin-top: 0.8rem; padding: 0.65rem; border-radius: 8px; background: #f8fafc; }
  .current-context span { display: grid; gap: 0.15rem; min-width: 0; color: #475467; font-size: 0.8rem; overflow-wrap: anywhere; }
  .current-context strong { color: #344054; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; }
  label { display: grid; gap: 0.36rem; margin-top: 0.8rem; color: #344054; font-size: 0.84rem; font-weight: 700; }
  input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: 0.62rem 0.7rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  .field-help { color: #667085; font-size: 0.74rem; font-weight: 500; line-height: 1.35; }
  .new-topic-trigger { margin-top: 0.8rem; padding: 0.42rem 0.62rem; border-radius: 7px; font-size: 0.8rem; font-weight: 700; }
  .new-topic-section { margin-top: 0.7rem; padding: 0.75rem; border: 1px solid #e4e7ec; border-radius: 8px; background: #fcfcfd; }
  .new-topic-section label:first-child { margin-top: 0; }
  .new-topic-actions, .editor-actions { display: flex; justify-content: end; gap: 0.5rem; margin-top: 0.8rem; }
  .button { padding: 0.58rem 0.75rem; border-radius: 7px; font-size: 0.82rem; font-weight: 700; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: 0.55; }
  .error { margin: 0.75rem 0 0; padding: 0.62rem; border-radius: 7px; background: #fef3f2; color: #b42318; font-size: 0.8rem; }

  @media (max-width: 700px) {
    .case-classification-editor { width: 100%; }
    .trigger { width: 100%; border-radius: 7px; padding: 0.48rem 0.6rem; }
    .editor-panel { position: static; width: 100%; margin-top: 0.45rem; box-sizing: border-box; box-shadow: none; }
    .current-context { grid-template-columns: minmax(0, 1fr); }
    .new-topic-actions, .editor-actions { flex-direction: column-reverse; }
    .new-topic-actions .button, .editor-actions .button { width: 100%; }
  }
</style>
