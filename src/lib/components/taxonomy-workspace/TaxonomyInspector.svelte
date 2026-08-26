<script lang="ts">
  import type { TaxonomyWorkspaceItem } from './taxonomy-workspace-model.ts';

  let {
    selected,
    subtopicCount = 0,
    casesRevealed = false,
    focused = false,
    onCreateChild,
    onToggleCases,
    onFocus,
    onClearFocus
  }: {
    selected: TaxonomyWorkspaceItem | null;
    subtopicCount?: number;
    casesRevealed?: boolean;
    focused?: boolean;
    onCreateChild: (parent: TaxonomyWorkspaceItem) => void;
    onToggleCases: (topicId: string) => void;
    onFocus: (systemId: string) => void;
    onClearFocus: () => void;
  } = $props();
</script>

<aside class="inspector" aria-label="Taxonomy inspector">
  {#if selected}
    <div class="inspector-heading">
      <div>
        <p class="eyebrow">Inspector</p>
        <h2>{selected.name}</h2>
        <div class="identity-row">
          <span class:system={selected.kind === 'system'} class="kind-badge">{selected.kind === 'system' ? 'System' : 'Topic'}</span>
          <span class:inactive={!selected.isActive} class="status-badge">{selected.isActive ? 'Active' : 'Inactive'}</span>
        </div>
      </div>
    </div>

    <div class="breadcrumb" aria-label="Hierarchy path">{selected.breadcrumbLabel || selected.name}</div>

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

    {#if selected.descriptionMd}
      <div class="description"><strong>Description</strong><p>{selected.descriptionMd}</p></div>
    {/if}

    <div class="actions">
      <button class="button primary" type="button" onclick={() => onCreateChild(selected)}>
        {selected.kind === 'system' ? '+ Add Topic' : '+ Add subtopic'}
      </button>
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
      <a class="button" href={'/admin/topics/' + selected.id}>Edit / open full {selected.kind === 'system' ? 'System' : 'Topic'}</a>
    </div>
  {:else}
    <div class="empty-inspector">
      <p class="eyebrow">Inspector</p>
      <h2>Select a System or Topic</h2>
      <p>Choose a node in the taxonomy tree to inspect its hierarchy, Case coverage, and contextual actions.</p>
    </div>
  {/if}
</aside>

<style>
  .inspector { position: sticky; top: 1rem; display: grid; align-content: start; gap: 1rem; min-width: 0; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 12px; background: #fff; }
  .inspector-heading { display: flex; justify-content: space-between; gap: 1rem; }
  .eyebrow { margin: 0 0 .28rem; color: #667085; font-size: .72rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  h2 { margin: 0; font-size: 1.3rem; overflow-wrap: anywhere; }
  .identity-row { display: flex; flex-wrap: wrap; gap: .35rem; margin-top: .55rem; }
  .kind-badge,.status-badge { display: inline-block; width: max-content; padding: .18rem .45rem; border-radius: 999px; background: #f2f4f7; color: #475467; font-size: .76rem; font-weight: 700; }
  .kind-badge.system { background: #eef4ff; color: #3538cd; }
  .status-badge { background: #ecfdf3; color: #027a48; }
  .status-badge.inactive { background: #f2f4f7; color: #667085; }
  .breadcrumb { padding: .7rem .8rem; border-radius: 8px; background: #f8fafc; color: #475467; font-size: .88rem; line-height: 1.45; overflow-wrap: anywhere; }
  .metrics { display: grid; gap: .55rem; margin: 0; }
  .metrics > div { display: flex; justify-content: space-between; gap: 1rem; padding-bottom: .5rem; border-bottom: 1px solid #eaecf0; }
  .metrics dt { color: #667085; }
  .metrics dd { margin: 0; color: #172033; font-weight: 750; }
  .description { display: grid; gap: .3rem; }
  .description p,.empty-inspector p { margin: 0; color: #667085; line-height: 1.5; white-space: pre-wrap; }
  .actions { display: flex; flex-wrap: wrap; gap: .5rem; }
  .button { display: inline-block; width: max-content; max-width: 100%; box-sizing: border-box; padding: .62rem .82rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; font-weight: 650; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .empty-inspector { display: grid; gap: .45rem; }
  @media (max-width: 920px) { .inspector { position: static; } }
</style>
