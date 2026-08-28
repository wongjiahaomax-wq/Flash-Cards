<script>
  import { page } from '$app/state';
  import { caseLibraryNamedActionHref, caseLibraryReturnQuery } from '$lib/admin-case-library-state.ts';

  /** @type {{ selectedCaseIds: string[], cases: { id: string, title: string, tags: { id: string, name: string }[] }[], availableTags: { id: string, name: string }[], triggerLabel?: string, compactTrigger?: boolean, actionQuery?: string }} */
  let { selectedCaseIds, cases, availableTags, triggerLabel = 'Manage Tags', compactTrigger = false, actionQuery = '' } = $props();

  let editorOpen = $state(false);
  let tagQuery = $state('');
  let newTagName = $state('');
  let createButton = $state();
  let effectiveActionQuery = $derived(actionQuery || caseLibraryReturnQuery(page.url.searchParams));
  let selectedCases = $derived(cases.filter((item) => selectedCaseIds.includes(item.id)));
  let selectedCount = $derived(selectedCases.length);
  let tagStates = $derived.by(() => {
    const query = tagQuery.trim().toLocaleLowerCase();
    return availableTags
      .map((tag) => {
        const membershipCount = selectedCases.filter((item) => item.tags.some((current) => current.id === tag.id)).length;
        const state = selectedCount > 0 && membershipCount === selectedCount
          ? 'All'
          : membershipCount > 0
            ? 'Some'
            : 'None';
        return { ...tag, membershipCount, state };
      })
      .filter((tag) => !query || tag.name.toLocaleLowerCase().includes(query));
  });

  $effect(() => {
    if (!selectedCount) editorOpen = false;
  });

  function toggleEditor() {
    if (selectedCount) editorOpen = !editorOpen;
  }

  /** @param {PointerEvent} event */
  function closeOnOutsidePointer(event) {
    const target = event.target;
    if (editorOpen && target instanceof Element && !target.closest('.bulk-case-tag-editor')) {
      editorOpen = false;
    }
  }

  /** @param {KeyboardEvent} event */
  function closeOnEscape(event) {
    if (event.key === 'Escape') editorOpen = false;
  }

  /** @param {KeyboardEvent} event */
  function preventSearchSubmit(event) {
    if (event.key === 'Enter') event.preventDefault();
  }

  /** @param {KeyboardEvent} event */
  function createTagOnEnter(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (newTagName.trim()) createButton?.click();
  }
</script>

<svelte:window onpointerdowncapture={closeOnOutsidePointer} onkeydown={closeOnEscape} />

<div class="bulk-case-tag-editor">
  <button
    type="button"
    class="trigger"
    class:compact-trigger={compactTrigger}
    disabled={!selectedCount}
    aria-expanded={editorOpen}
    onclick={toggleEditor}
  >{triggerLabel}</button>

  {#if editorOpen}
    <div class="editor-panel" role="dialog" aria-label={`Manage Tags for ${selectedCount} selected Cases`}>
      <div class="editor-heading">
        <div>
          <strong>Manage Tags</strong>
          <span>{selectedCount} selected Case{selectedCount === 1 ? '' : 's'}</span>
        </div>
        <button type="button" class="close-button" aria-label="Close bulk Tag editor" onclick={() => editorOpen = false}>×</button>
      </div>

      <p class="guidance">Add or remove one Tag without replacing any other Tags on the selected Cases.</p>

      <label class="search-field" for="bulk-tag-search">
        Search Tags
        <input id="bulk-tag-search" type="search" bind:value={tagQuery} onkeydown={preventSearchSubmit} placeholder="e.g. hypocalcaemia" />
      </label>

      <div class="tag-state-legend" aria-label="Tag membership states">
        <span><strong>All</strong> every selected Case</span>
        <span><strong>Some</strong> mixed membership</span>
        <span><strong>None</strong> no selected Cases</span>
      </div>

      <div class="tag-state-list">
        {#if tagStates.length}
          {#each tagStates as tag}
            <div class="tag-state-row">
              <div class="tag-details">
                <strong>{tag.name}</strong>
                <span>{tag.membershipCount} / {selectedCount} Cases <span class:some={tag.state === 'Some'} class="state-label">{tag.state}</span></span>
              </div>
              <div class="tag-actions">
                {#if tag.membershipCount < selectedCount}
                  <button
                    class="small-button"
                    type="submit"
                    name="tag_id"
                    value={tag.id}
                    formaction={caseLibraryNamedActionHref('bulkAddCaseTag', effectiveActionQuery)}
                    formnovalidate
                  >Add to all</button>
                {/if}
                {#if tag.membershipCount > 0}
                  <button
                    class="small-button remove"
                    type="submit"
                    name="tag_id"
                    value={tag.id}
                    formaction={caseLibraryNamedActionHref('bulkRemoveCaseTag', effectiveActionQuery)}
                    formnovalidate
                  >Remove from all</button>
                {/if}
              </div>
            </div>
          {/each}
        {:else}
          <p class="empty-state">No active Tags match this search.</p>
        {/if}
      </div>

      <section class="create-section" aria-label="Create and attach a new Tag">
        <label for="bulk-new-tag">Create new Tag</label>
        <div class="create-row">
          <input
            id="bulk-new-tag"
            name="new_tag_name"
            bind:value={newTagName}
            onkeydown={createTagOnEnter}
            maxlength="120"
            placeholder="Canonical Tag name"
          />
          <button
            bind:this={createButton}
            class="small-button primary"
            type="submit"
            formaction={caseLibraryNamedActionHref('bulkCreateAndAddCaseTag', effectiveActionQuery)}
            formnovalidate
            disabled={!newTagName.trim()}
          >Create & add to all</button>
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .bulk-case-tag-editor { position: relative; flex: 0 0 auto; }
  .trigger, .small-button, .close-button { border: 1px solid #cdd6e3; background: #fff; color: #172033; font: inherit; cursor: pointer; }
  .trigger { padding: 0.7rem 1rem; border-radius: 8px; font-weight: 650; }
  .trigger.compact-trigger { padding: 0.2rem 0.45rem; border-radius: 999px; font-size: 0.76rem; font-weight: 700; }
  .trigger:disabled, .small-button:disabled { cursor: not-allowed; opacity: 0.55; }
  .editor-panel { position: absolute; z-index: 30; top: calc(100% + 0.55rem); right: 0; width: min(620px, calc(100vw - 2rem)); padding: 1rem; border: 1px solid #d0d5dd; border-radius: 10px; background: #fff; box-shadow: 0 14px 34px rgba(16, 24, 40, 0.16); }
  .editor-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
  .editor-heading > div { display: grid; gap: 0.18rem; }
  .editor-heading strong { font-size: 1rem; }
  .editor-heading span, .guidance, .tag-details span, .tag-state-legend, .empty-state { color: #667085; font-size: 0.82rem; }
  .close-button { width: 2rem; height: 2rem; padding: 0; border-radius: 7px; font-size: 1.2rem; line-height: 1; }
  .guidance { margin: 0.75rem 0; }
  .search-field, .create-section > label { display: grid; gap: 0.35rem; color: #344054; font-size: 0.84rem; font-weight: 700; }
  input { width: 100%; min-width: 0; box-sizing: border-box; padding: 0.62rem 0.7rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  .tag-state-legend { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin: 0.75rem 0 0.45rem; }
  .tag-state-list { max-height: 320px; overflow: auto; border: 1px solid #eaecf0; border-radius: 8px; }
  .tag-state-row { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; padding: 0.65rem 0.7rem; border-bottom: 1px solid #eaecf0; }
  .tag-state-row:last-child { border-bottom: 0; }
  .tag-details { display: grid; min-width: 0; gap: 0.15rem; }
  .tag-details strong { overflow-wrap: anywhere; }
  .state-label { display: inline-block; margin-left: 0.3rem; padding: 0.08rem 0.32rem; border-radius: 999px; background: #f2f4f7; color: #475467; font-size: 0.72rem; font-weight: 750; }
  .state-label.some { background: #fffaeb; color: #b54708; }
  .tag-actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 0.4rem; flex: 0 0 auto; }
  .small-button { padding: 0.42rem 0.58rem; border-radius: 7px; font-size: 0.8rem; font-weight: 700; }
  .small-button.primary { border-color: #172033; background: #172033; color: #fff; }
  .small-button.remove { color: #b42318; }
  .empty-state { margin: 0; padding: 0.85rem; }
  .create-section { margin-top: 0.85rem; padding-top: 0.85rem; border-top: 1px solid #eaecf0; }
  .create-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.55rem; margin-top: 0.4rem; }

  @media (max-width: 700px) {
    .bulk-case-tag-editor { width: 100%; }
    .trigger { width: 100%; }
    .editor-panel { position: static; width: 100%; margin-top: 0.55rem; box-sizing: border-box; box-shadow: none; }
    .tag-state-row { align-items: start; flex-direction: column; }
    .tag-actions { justify-content: start; }
    .create-row { grid-template-columns: minmax(0, 1fr); }
  }
</style>
