<script>
  import { tick } from 'svelte';
  import { caseLibraryNamedActionHref } from '$lib/admin-case-library-state.ts';

  /** @type {{ selectedCaseIds: string[], parentOptions: { id: string, name: string, kind: string, breadcrumb: { id: string, name: string, kind: string }[] }[], error?: string, initialName?: string, initialParentId?: string, actionQuery?: string, retryRequiresSelection?: boolean }} */
  let { selectedCaseIds, parentOptions, error = '', initialName = '', initialParentId = '', actionQuery = '', retryRequiresSelection = false } = $props();

  let editorOpen = $state(false);
  let topicName = $state('');
  let parentId = $state('');
  let nameInput = $state();
  let createButton = $state();
  let selectedCount = $derived(selectedCaseIds.length);
  let systemOptions = $derived(parentOptions.filter((option) => option.kind === 'system').sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)));
  let topicOptions = $derived(parentOptions.filter((option) => option.kind === 'topic').sort((left, right) => {
    const leftLabel = left.breadcrumb.map((item) => item.name).join(' → ');
    const rightLabel = right.breadcrumb.map((item) => item.name).join(' → ');
    return leftLabel.localeCompare(rightLabel) || left.id.localeCompare(right.id);
  }));

  $effect(() => {
    if (!error) return;
    topicName = initialName;
    parentId = initialParentId;
    editorOpen = true;
  });

  async function openEditor() {
    editorOpen = true;
    await tick();
    nameInput?.focus();
  }

  function toggleEditor() {
    if (editorOpen) editorOpen = false;
    else void openEditor();
  }

  /** @param {PointerEvent} event */
  function closeOnOutsidePointer(event) {
    const target = event.target;
    if (editorOpen && target instanceof Element && !target.closest('.case-library-topic-creator')) editorOpen = false;
  }

  /** @param {KeyboardEvent} event */
  function closeOnEscape(event) {
    if (event.key === 'Escape') editorOpen = false;
  }

  /** @param {KeyboardEvent} event */
  function createTopicOnEnter(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (topicName.trim()) createButton?.click();
  }
</script>

<svelte:window onpointerdowncapture={closeOnOutsidePointer} onkeydown={closeOnEscape} />

<div class="case-library-topic-creator">
  {#each selectedCaseIds as caseId}<input type="hidden" name="topic_case_ids" value={caseId} />{/each}
  <button type="button" class="trigger" aria-expanded={editorOpen} onclick={toggleEditor}>New Topic</button>

  {#if editorOpen}
    <div class="editor-panel" role="dialog" aria-label="Create Topic from Case Library">
      <div class="editor-heading">
        <div>
          <strong>Create Topic</strong>
          <span>{selectedCount ? `Assign to ${selectedCount} selected Case${selectedCount === 1 ? '' : 's'} after creation` : retryRequiresSelection ? 'Select an eligible Case to retry the failed assignment' : 'Create a global Topic without assigning a Case'}</span>
        </div>
        <button type="button" class="close-button" aria-label="Close Topic creator" onclick={() => editorOpen = false}>×</button>
      </div>

      {#if error}<p class="form-error" role="alert">{error}</p>{/if}

      <label for="case-library-new-topic">
        Topic name
        <input bind:this={nameInput} id="case-library-new-topic" name="new_topic_name" bind:value={topicName} maxlength="200" required placeholder="Canonical Topic name" onkeydown={createTopicOnEnter} />
      </label>

      <label for="case-library-topic-parent">
        Parent placement
        <select id="case-library-topic-parent" name="parent_id" bind:value={parentId}>
          <option value="">Unassigned</option>
          {#if systemOptions.length}
            <optgroup label="Systems">{#each systemOptions as option}<option value={option.id}>{option.name}</option>{/each}</optgroup>
          {/if}
          {#if topicOptions.length}
            <optgroup label="Topics">{#each topicOptions as option}<option value={option.id}>{option.breadcrumb.map((item) => item.name).join(' → ')}</option>{/each}</optgroup>
          {/if}
        </select>
      </label>

      <div class="editor-actions">
        <button type="button" class="button" onclick={() => editorOpen = false}>Cancel</button>
        <button bind:this={createButton} class="button primary" type="submit" formaction={caseLibraryNamedActionHref('createCaseLibraryTopic', actionQuery)} formnovalidate disabled={!topicName.trim() || (retryRequiresSelection && !selectedCount)}>{selectedCount ? `Create & assign to ${selectedCount}` : retryRequiresSelection ? 'Select a Case to retry' : 'Create Topic'}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .case-library-topic-creator { position: relative; flex: 0 0 auto; }
  .trigger, .button, .close-button { border: 1px solid #cdd6e3; background: #fff; color: #172033; font: inherit; cursor: pointer; }
  .trigger, .button { padding: 0.7rem 1rem; border-radius: 8px; font-weight: 650; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .button:disabled { cursor: not-allowed; opacity: 0.55; }
  .editor-panel { position: absolute; z-index: 35; top: calc(100% + 0.55rem); right: 0; width: min(520px, calc(100vw - 2rem)); padding: 1rem; border: 1px solid #d0d5dd; border-radius: 10px; background: #fff; box-shadow: 0 14px 34px rgba(16, 24, 40, 0.16); }
  .editor-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
  .editor-heading > div { display: grid; gap: 0.18rem; }
  .editor-heading strong { font-size: 1rem; }
  .editor-heading span { color: #667085; font-size: 0.82rem; }
  .close-button { width: 2rem; height: 2rem; padding: 0; border-radius: 7px; font-size: 1.2rem; line-height: 1; }
  label { display: grid; gap: 0.38rem; margin-top: 0.85rem; color: #344054; font-size: 0.84rem; font-weight: 700; }
  input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: 0.65rem 0.7rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  .form-error { margin: 0.75rem 0 0; padding: 0.7rem; border-radius: 8px; background: #fef3f2; color: #b42318; font-size: 0.84rem; }
  .editor-actions { display: flex; justify-content: end; gap: 0.55rem; margin-top: 1rem; }
  @media (max-width: 700px) { .case-library-topic-creator { width: 100%; } .trigger { width: 100%; } .editor-panel { position: static; width: 100%; margin-top: 0.55rem; box-sizing: border-box; box-shadow: none; } .editor-actions { flex-direction: column-reverse; } .editor-actions .button { width: 100%; } }
</style>