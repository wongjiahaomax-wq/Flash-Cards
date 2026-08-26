<script>
  import { invalidateAll } from '$app/navigation';

  /** @type {{ caseId: string, caseTitle: string, tags: { id: string, name: string }[], availableTags: { id: string, name: string }[] }} */
  let { caseId, caseTitle, tags, availableTags } = $props();
  let selectedTagId = $state('');
  let newTagName = $state('');
  let error = $state('');
  let busy = $state(false);
  let addableTags = $derived(availableTags.filter((tag) => !tags.some((current) => current.id === tag.id)));

  /**
   * @param {'add'|'remove'|'create-and-add'} operation
   * @param {{ tagId?: string, name?: string }} [values]
   */
  async function mutate(operation, values = {}) {
    error = '';
    busy = true;
    const body = new FormData();
    body.set('case_id', caseId);
    body.set('operation', operation);
    body.set('response', 'json');
    if (values.tagId) body.set('tag_id', values.tagId);
    if (values.name) body.set('name', values.name);

    try {
      const response = await fetch(`/admin/cases/${encodeURIComponent(caseId)}/case-tags`, {
        method: 'POST',
        body
      });
      if (!response.ok) {
        error = (await response.text()).trim() || 'Unable to update this Case Tag.';
        return;
      }
      selectedTagId = '';
      newTagName = '';
      await invalidateAll();
    } catch {
      error = 'Unable to update this Case Tag.';
    } finally {
      busy = false;
    }
  }

  function addSelectedTag() {
    if (selectedTagId) void mutate('add', { tagId: selectedTagId });
  }

  function createTag() {
    const name = newTagName.trim();
    if (name) void mutate('create-and-add', { name });
  }

  /** @param {KeyboardEvent} event */
  function createTagOnEnter(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    createTag();
  }
</script>

<div class="case-tag-editor">
  <div class="tag-summary">
    {#if tags.length}
      {#each tags as tag}<span class="tag-chip">{tag.name}</span>{/each}
    {:else}
      <span class="muted">—</span>
    {/if}
    <details>
      <summary>Edit tags</summary>
      <div class="editor-panel">
        <div class="editor-heading">
          <strong>{caseTitle}</strong>
          <span class="muted">Case Tags</span>
        </div>

        <section aria-label={`Current Tags for ${caseTitle}`}>
          <span class="field-label">Current</span>
          {#if tags.length}
            <div class="current-tags">
              {#each tags as tag}
                <div class="current-tag">
                  <span>{tag.name}</span>
                  <button type="button" class="text-button" disabled={busy} onclick={() => void mutate('remove', { tagId: tag.id })}>Remove</button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="muted compact">No Tags attached.</p>
          {/if}
        </section>

        <section class="add-section" aria-label={`Add an existing Tag to ${caseTitle}`}>
          <label for={`existing-tag-${caseId}`}>Add existing Tag</label>
          <div class="inline-action">
            <select id={`existing-tag-${caseId}`} bind:value={selectedTagId} disabled={busy || !addableTags.length}>
              <option value="">{addableTags.length ? 'Choose a Tag' : 'All active Tags attached'}</option>
              {#each addableTags as tag}<option value={tag.id}>{tag.name}</option>{/each}
            </select>
            <button type="button" class="small-button" disabled={busy || !selectedTagId} onclick={addSelectedTag}>Add</button>
          </div>
        </section>

        <section class="add-section" aria-label={`Create a new Tag for ${caseTitle}`}>
          <label for={`new-tag-${caseId}`}>Create new Tag</label>
          <div class="inline-action">
            <input id={`new-tag-${caseId}`} bind:value={newTagName} maxlength="120" placeholder="Tag name" disabled={busy} onkeydown={createTagOnEnter} />
            <button type="button" class="small-button" disabled={busy || !newTagName.trim()} onclick={createTag}>Create & add</button>
          </div>
        </section>

        {#if error}<p class="error" role="alert">{error}</p>{/if}
      </div>
    </details>
  </div>
</div>

<style>
  .case-tag-editor { min-width: 0; color: #475467; }
  .tag-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; position: relative; }
  .tag-chip { display: inline-block; padding: 0.18rem 0.4rem; border-radius: 999px; background: #ecfdf3; color: #027a48; font-size: 0.76rem; font-weight: 650; }
  .muted { color: #667085; }
  details { position: relative; }
  summary { list-style: none; cursor: pointer; padding: 0.2rem 0.45rem; border: 1px solid #d0d5dd; border-radius: 999px; background: #fff; color: #344054; font-size: 0.76rem; font-weight: 700; user-select: none; }
  summary::-webkit-details-marker { display: none; }
  .editor-panel { position: absolute; z-index: 30; right: 0; top: calc(100% + 0.4rem); width: min(340px, calc(100vw - 2.5rem)); padding: 0.85rem; border: 1px solid #d0d5dd; border-radius: 10px; background: #fff; box-shadow: 0 12px 28px rgba(16, 24, 40, 0.14); }
  .editor-heading { display: grid; gap: 0.12rem; margin-bottom: 0.8rem; color: #172033; }
  section { margin-top: 0.75rem; }
  .field-label, label { display: block; margin-bottom: 0.35rem; color: #344054; font-size: 0.78rem; font-weight: 700; }
  .current-tags { display: grid; gap: 0.3rem; }
  .current-tag { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; padding: 0.38rem 0.5rem; border-radius: 7px; background: #f8fafc; }
  .text-button { border: 0; background: transparent; color: #b42318; cursor: pointer; font: inherit; font-size: 0.76rem; font-weight: 700; }
  .inline-action { display: flex; gap: 0.4rem; align-items: stretch; }
  input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: 0.55rem 0.6rem; border: 1px solid #cdd6e3; border-radius: 7px; background: #fff; font: inherit; font-size: 0.82rem; }
  .small-button { flex: 0 0 auto; padding: 0.5rem 0.65rem; border: 1px solid #cdd6e3; border-radius: 7px; background: #fff; color: #172033; cursor: pointer; font: inherit; font-size: 0.78rem; font-weight: 700; white-space: nowrap; }
  button:disabled, input:disabled, select:disabled { cursor: not-allowed; opacity: 0.55; }
  .compact { margin: 0; font-size: 0.8rem; }
  .error { margin: 0.7rem 0 0; padding: 0.55rem; border-radius: 7px; background: #fef3f2; color: #b42318; font-size: 0.78rem; }
  @media (max-width: 600px) { .editor-panel { left: 0; right: auto; } }
</style>
