<script lang="ts">
  import { enhance } from '$app/forms';
  import type { TaxonomyWorkspaceItem } from './taxonomy-workspace-model.ts';

  let {
    selected,
    subtopicCount = 0,
    casesRevealed = false,
    focused = false,
    organizeMode = false,
    moveStaged = false,
    onCreateChild,
    onToggleCases,
    onFocus,
    onClearFocus,
    onMoveTopic
  }: {
    selected: TaxonomyWorkspaceItem | null;
    subtopicCount?: number;
    casesRevealed?: boolean;
    focused?: boolean;
    organizeMode?: boolean;
    moveStaged?: boolean;
    onCreateChild: (parent: TaxonomyWorkspaceItem) => void;
    onToggleCases: (topicId: string) => void;
    onFocus: (systemId: string) => void;
    onClearFocus: () => void;
    onMoveTopic: (topic: TaxonomyWorkspaceItem) => void;
  } = $props();

  let editOpen = $state(false);
  let editSelectionId = $state('');

  $effect(() => {
    const id = selected?.id ?? '';
    if (id !== editSelectionId) {
      editSelectionId = id;
      editOpen = false;
    }
  });
</script>

<aside class="inspector" aria-label="Taxonomy inspector">
  {#if selected}
    <div class="heading">
      <div>
        <p class="eyebrow">Inspector</p>
        <h2>{selected.name}</h2>
        <div class="badges">
          <span class:system={selected.kind === 'system'} class="badge">{selected.kind === 'system' ? 'System' : 'Topic'}</span>
          <span class:inactive={!selected.isActive} class="status">{selected.isActive ? 'Active' : 'Inactive'}</span>
          {#if moveStaged}<span class="staged">Move staged</span>{/if}
        </div>
      </div>
    </div>

    <div class="breadcrumb">{selected.breadcrumbLabel || selected.name}</div>

    <dl class="metrics">
      {#if selected.kind === 'topic'}
        <div><dt>Direct Cases</dt><dd>{selected.directCaseCount}</dd></div>
        <div><dt>Descendant Cases</dt><dd>{selected.descendantStudyCaseCount}</dd></div>
        <div><dt>Subtopics</dt><dd>{subtopicCount}</dd></div>
        <div><dt>Reusable questions</dt><dd>{selected.activeSharedQuestionCount}</dd></div>
      {:else}
        <div><dt>Study Cases in System</dt><dd>{selected.descendantStudyCaseCount}</dd></div>
        <div><dt>Direct child Topics</dt><dd>{subtopicCount}</dd></div>
      {/if}
    </dl>

    {#if selected.descriptionMd && !editOpen}
      <div class="description"><strong>Description</strong><p>{selected.descriptionMd}</p></div>
    {/if}

    {#if editOpen}
      <form method="POST" action="?/updateConcept" use:enhance class="edit-form">
        <input type="hidden" name="concept_id" value={selected.id} />
        <input type="hidden" name="kind" value={selected.kind} />
        <label>Name<input name="name" maxlength="200" required value={selected.name} /></label>
        <label>Description<textarea name="description_md" rows="4">{selected.descriptionMd ?? ''}</textarea></label>
        <label class="toggle"><input name="is_active" type="checkbox" checked={selected.isActive} /> Active</label>
        <p class="note">Hierarchy is edited separately through staged Move to… / drag-and-drop. Detailed reusable-question editing remains on the full Topic page.</p>
        <div class="actions">
          <button class="button" type="button" onclick={() => { editOpen = false; }}>Cancel</button>
          <button class="button primary" type="submit">Save identity</button>
        </div>
      </form>
    {:else}
      <div class="actions">
        {#if !organizeMode}
          <button class="button" type="button" onclick={() => { editOpen = true; }}>Edit identity</button>
        {/if}
        {#if selected.isActive}
          <button class="button primary" type="button" onclick={() => onCreateChild(selected)}>
            {selected.kind === 'system' ? '+ Add Topic' : '+ Add subtopic'}
          </button>
        {/if}
        {#if organizeMode && selected.kind === 'topic'}
          <button class="button" type="button" onclick={() => onMoveTopic(selected)}>Move to…</button>
        {/if}
        {#if selected.kind === 'topic' && selected.directCaseCount > 0}
          <button class="button" type="button" aria-pressed={casesRevealed} onclick={() => onToggleCases(selected.id)}>
            {casesRevealed ? 'Hide Cases' : 'Show Cases'}
          </button>
        {/if}
        {#if selected.kind === 'system'}
          {#if focused}
            <button class="button" type="button" onclick={onClearFocus}>← All Systems</button>
          {:else}
            <button class="button" type="button" onclick={() => onFocus(selected.id)}>Focus on System</button>
          {/if}
        {/if}
        <a class="button" href={'/admin/topics/' + selected.id}>Open full {selected.kind === 'system' ? 'System' : 'Topic'}</a>
      </div>
    {/if}
  {:else}
    <div class="empty">
      <p class="eyebrow">Inspector</p>
      <h2>Select a System or Topic</h2>
      <p>Choose a node to inspect its hierarchy, Case coverage, identity, and contextual actions.</p>
    </div>
  {/if}
</aside>

<style>
  .inspector { position: sticky; top: 1rem; display: grid; align-content: start; gap: 1rem; min-width: 0; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 12px; background: #fff; }
  .heading { display: flex; justify-content: space-between; gap: 1rem; }
  .eyebrow { margin: 0 0 .28rem; color: #667085; font-size: .72rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  h2,p { margin-top: 0; }
  h2 { margin-bottom: 0; font-size: 1.3rem; overflow-wrap: anywhere; }
  .badges,.actions { display: flex; flex-wrap: wrap; gap: .45rem; }
  .badges { margin-top: .55rem; }
  .badge,.status,.staged { display: inline-block; padding: .18rem .45rem; border-radius: 999px; background: #f2f4f7; color: #475467; font-size: .76rem; font-weight: 700; }
  .badge.system { background: #eef4ff; color: #3538cd; }
  .status { background: #ecfdf3; color: #027a48; }
  .status.inactive { background: #f2f4f7; color: #667085; }
  .staged { background: #fffaeb; color: #b54708; }
  .breadcrumb { padding: .7rem .8rem; border-radius: 8px; background: #f8fafc; color: #475467; font-size: .88rem; line-height: 1.45; overflow-wrap: anywhere; }
  .metrics { display: grid; gap: .55rem; margin: 0; }
  .metrics > div { display: flex; justify-content: space-between; gap: 1rem; padding-bottom: .5rem; border-bottom: 1px solid #eaecf0; }
  .metrics dt { color: #667085; }
  .metrics dd { margin: 0; color: #172033; font-weight: 750; }
  .description { display: grid; gap: .3rem; }
  .description p,.empty p { margin-bottom: 0; color: #667085; line-height: 1.5; white-space: pre-wrap; }
  .edit-form { display: grid; gap: .65rem; padding: .8rem; border: 1px solid #b2ccff; border-radius: 9px; background: #f8faff; }
  .edit-form label { display: grid; gap: .3rem; color: #344054; font-weight: 650; }
  .edit-form .toggle { display: flex; align-items: center; gap: .45rem; }
  .toggle input { width: auto; }
  input,textarea { box-sizing: border-box; width: 100%; padding: .62rem .68rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  textarea { resize: vertical; }
  .note { margin-bottom: 0; color: #667085; font-size: .8rem; line-height: 1.45; }
  .button { display: inline-block; width: max-content; max-width: 100%; box-sizing: border-box; padding: .62rem .82rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; font-weight: 650; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  @media (max-width: 920px) { .inspector { position: static; } }
</style>
