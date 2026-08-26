<script lang="ts">
  import TaxonomyInspector from './TaxonomyInspector.svelte';
  import {
    activeSystemOptions,
    activeTaxonomyParents,
    buildTaxonomyWorkspaceRows,
    type TaxonomyWorkspaceItem,
    type WorkspaceFilter
  } from './taxonomy-workspace-model.ts';

  let {
    items,
    initialSearch = '',
    initialSelectedId = ''
  }: {
    items: TaxonomyWorkspaceItem[];
    initialSearch?: string;
    initialSelectedId?: string;
  } = $props();

  let query = $state(initialSearch);
  let filter = $state<WorkspaceFilter>('all');
  let selectedId = $state(initialSelectedId);
  let focusSystemId = $state('');
  let collapsedIds = $state<string[]>([]);
  let revealedTopicIds = $state<string[]>([]);
  let createOpen = $state(false);
  let createKind = $state<'system' | 'topic'>('topic');
  let createParentId = $state('');
  let createContextLabel = $state('');

  const parentOptions = $derived(activeTaxonomyParents(items));
  const systemOptions = $derived(activeSystemOptions(items));
  const rows = $derived(buildTaxonomyWorkspaceRows(items, {
    search: query,
    filter,
    focusSystemId: focusSystemId || null,
    collapsedIds
  }));
  const selected = $derived(items.find((item) => item.id === selectedId) ?? null);
  const focusedSystem = $derived(systemOptions.find((item) => item.id === focusSystemId) ?? null);
  const selectedSubtopicCount = $derived(selected
    ? items.filter((item) => item.parentId === selected.id && item.kind === 'topic').length
    : 0);

  const filters: { id: WorkspaceFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'systems', label: 'Systems' },
    { id: 'topics', label: 'Topics' },
    { id: 'unassigned', label: 'Unassigned' },
    { id: 'inactive', label: 'Inactive' }
  ];

  function toggleId(values: string[], id: string) {
    return values.includes(id) ? values.filter((value) => value !== id) : [...values, id];
  }

  function toggleCollapsed(id: string) {
    collapsedIds = toggleId(collapsedIds, id);
  }

  function toggleCases(id: string) {
    revealedTopicIds = toggleId(revealedTopicIds, id);
  }

  function queryMatchesCase(item: TaxonomyWorkspaceItem) {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return false;
    return Boolean(item.directCases?.some((caseItem) => caseItem.title.toLocaleLowerCase().includes(needle)));
  }

  function casesVisible(item: TaxonomyWorkspaceItem) {
    return revealedTopicIds.includes(item.id) || queryMatchesCase(item);
  }

  function openCreate(kind: 'system' | 'topic', parentId = '', contextLabel = '') {
    createKind = kind;
    createParentId = kind === 'topic' ? parentId : '';
    createContextLabel = contextLabel;
    createOpen = true;
  }

  function createChild(parent: TaxonomyWorkspaceItem) {
    openCreate('topic', parent.id, parent.kind === 'system'
      ? `New Topic under ${parent.name}`
      : `New subtopic under ${parent.breadcrumbLabel}`);
  }

  function focusSystem(systemId: string) {
    focusSystemId = systemId;
    filter = 'all';
    collapsedIds = [];
  }

  function clearFocus() {
    focusSystemId = '';
  }
</script>

<section class="workspace-shell">
  <div class="toolbar" aria-label="Taxonomy workspace controls">
    <label class="search-control" for="taxonomy-workspace-search">
      <span>Search taxonomy or Case title</span>
      <input id="taxonomy-workspace-search" bind:value={query} placeholder="e.g. Arrhythmias or AF with RVR" />
    </label>
    <div class="toolbar-actions">
      <button class="button" type="button" onclick={() => { collapsedIds = []; }}>Expand all</button>
      <button class="button" type="button" onclick={() => { collapsedIds = items.map((item) => item.id); }}>Collapse all</button>
      <button class="button" type="button" onclick={() => openCreate('system')}>+ New System</button>
      <button class="button primary" type="button" onclick={() => openCreate('topic')}>+ New Topic</button>
    </div>
  </div>

  <div class="filter-row" aria-label="Taxonomy filters">
    {#each filters as option}
      <button
        class:active={filter === option.id}
        class="filter-chip"
        type="button"
        aria-pressed={filter === option.id}
        onclick={() => { filter = option.id; }}
      >{option.label}</button>
    {/each}
  </div>

  {#if focusedSystem}
    <div class="focus-banner">
      <div><span class="muted">Systems &amp; Topics /</span> <strong>{focusedSystem.name}</strong></div>
      <button class="button compact" type="button" onclick={clearFocus}>← All Systems</button>
    </div>
  {/if}

  {#if createOpen}
    <section class="create-panel" aria-labelledby="create-taxonomy-heading">
      <div class="create-heading">
        <div>
          <p class="eyebrow">Create in context</p>
          <h2 id="create-taxonomy-heading">{createContextLabel || (createKind === 'system' ? 'New System' : 'New Topic')}</h2>
          <p class="muted">Systems stay top-level. Topics may be unassigned or nested beneath an active System or Topic.</p>
        </div>
        <button class="icon-button" type="button" aria-label="Close creation form" onclick={() => { createOpen = false; }}>×</button>
      </div>
      <form method="POST" action="?/createConcept" class="create-form">
        <label>Name<input name="name" maxlength="200" required placeholder="e.g. Arrhythmias" /></label>
        <label>Kind
          <select name="kind" bind:value={createKind} required>
            <option value="topic">Topic</option>
            <option value="system">System</option>
          </select>
        </label>
        {#if createKind === 'topic'}
          <label>Parent
            <select name="parent_id" bind:value={createParentId}>
              <option value="">Unassigned</option>
              {#each parentOptions as parent}
                <option value={parent.id}>{parent.breadcrumbLabel} · {parent.kind === 'system' ? 'System' : 'Topic'}</option>
              {/each}
            </select>
          </label>
        {:else}
          <input type="hidden" name="parent_id" value="" />
        {/if}
        <label class="wide">Description<textarea name="description_md" rows="2" placeholder="Optional Admin/learner context"></textarea></label>
        <div class="create-actions">
          <button class="button" type="button" onclick={() => { createOpen = false; }}>Cancel</button>
          <button class="button primary" type="submit">Create {createKind === 'system' ? 'System' : 'Topic'}</button>
        </div>
      </form>
    </section>
  {/if}

  <div class="workspace-grid">
    <section class="tree-panel" aria-labelledby="taxonomy-tree-heading">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Taxonomy workspace</p>
          <h2 id="taxonomy-tree-heading">Systems &amp; nested Topics</h2>
          <p class="muted">Browse safely here. Cases stay hidden until you reveal a Topic's direct Cases.</p>
        </div>
        <span class="result-count">{rows.length} visible</span>
      </div>

      {#if rows.length === 0}
        <div class="empty-state">No Systems or Topics match the current search and filter.</div>
      {:else}
        <div class="tree" role="tree" aria-label="System and Topic hierarchy">
          {#each rows as row (row.id)}
            <div class="tree-block">
              <div
                class:selected={selectedId === row.id}
                class:context-only={row.contextOnly}
                class:inactive={!row.isActive}
                class="tree-row"
                role="treeitem"
                aria-level={row.depth + 1}
                aria-selected={selectedId === row.id}
                aria-expanded={row.hasChildren ? !collapsedIds.includes(row.id) : undefined}
              >
                <div class="tree-main" style={`padding-left: ${row.depth * 1.05}rem`}>
                  {#if row.hasChildren}
                    <button
                      class="collapse-button"
                      type="button"
                      aria-label={(collapsedIds.includes(row.id) ? 'Expand ' : 'Collapse ') + row.name}
                      aria-expanded={!collapsedIds.includes(row.id)}
                      onclick={() => toggleCollapsed(row.id)}
                    >{collapsedIds.includes(row.id) ? '▸' : '▾'}</button>
                  {:else}
                    <span class="tree-spacer" aria-hidden="true"></span>
                  {/if}
                  <button class="node-button" type="button" onclick={() => { selectedId = row.id; }}>
                    <span class="node-name">{row.name}</span>
                    <span class="node-meta">
                      {row.kind === 'system' ? 'System' : 'Topic'}
                      {#if row.unassigned} · Unassigned{/if}
                      {#if !row.isActive} · Inactive{/if}
                    </span>
                  </button>
                </div>

                <div class="node-counts">
                  {#if row.kind === 'topic'}
                    <span><strong>{row.directCaseCount}</strong> direct</span>
                    {#if row.descendantStudyCaseCount !== row.directCaseCount}<span><strong>{row.descendantStudyCaseCount}</strong> subtree</span>{/if}
                    {#if row.directSubtopicCount}<span><strong>{row.directSubtopicCount}</strong> subtopics</span>{/if}
                  {:else}
                    <span><strong>{row.descendantStudyCaseCount}</strong> study Cases</span>
                    {#if row.directSubtopicCount}<span><strong>{row.directSubtopicCount}</strong> Topics</span>{/if}
                  {/if}
                </div>

                <div class="row-actions">
                  <button class="text-action" type="button" onclick={() => createChild(row)}>
                    {row.kind === 'system' ? '+ Add Topic' : '+ Add subtopic'}
                  </button>
                  {#if row.kind === 'topic' && row.directCaseCount > 0}
                    <button class="text-action" type="button" aria-pressed={casesVisible(row)} onclick={() => toggleCases(row.id)}>
                      {casesVisible(row) ? 'Hide Cases' : 'Show Cases'}
                    </button>
                  {/if}
                  {#if row.kind === 'system'}
                    <button class="text-action" type="button" onclick={() => focusSystem(row.id)}>Focus</button>
                  {/if}
                </div>
              </div>

              {#if row.kind === 'topic' && casesVisible(row)}
                <div class="case-list" style={`margin-left: ${Math.max(0, row.depth + 1) * 1.05 + 2.15}rem`}>
                  {#if row.directCases?.length}
                    {#each row.directCases as caseItem (caseItem.id)}
                      <a class="case-row" href={'/admin/cases/' + caseItem.id}>
                        <span class="case-title">{caseItem.title}</span>
                        <span class="case-open">Open Case</span>
                      </a>
                    {/each}
                  {:else}
                    <span class="muted">No active production Cases are directly assigned to this Topic.</span>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <TaxonomyInspector
      {selected}
      subtopicCount={selectedSubtopicCount}
      casesRevealed={selected ? casesVisible(selected) : false}
      focused={Boolean(selected && selected.kind === 'system' && selected.id === focusSystemId)}
      onCreateChild={createChild}
      onToggleCases={toggleCases}
      onFocus={focusSystem}
      onClearFocus={clearFocus}
    />
  </div>
</section>

<style>
  .workspace-shell { display: grid; gap: .9rem; margin-top: 1rem; }
  .toolbar { display: grid; grid-template-columns: minmax(260px, 1fr) auto; gap: .75rem; align-items: end; }
  .search-control { display: grid; gap: .32rem; color: #344054; font-weight: 650; }
  input,select,textarea { box-sizing: border-box; width: 100%; padding: .66rem .72rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  textarea { resize: vertical; }
  .toolbar-actions,.create-actions,.row-actions,.filter-row { display: flex; flex-wrap: wrap; gap: .45rem; }
  .button { display: inline-block; width: max-content; max-width: 100%; box-sizing: border-box; padding: .66rem .88rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; font-weight: 650; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .button.compact { padding: .45rem .65rem; }
  .filter-row { align-items: center; }
  .filter-chip { padding: .38rem .68rem; border: 1px solid #d0d5dd; border-radius: 999px; background: #fff; color: #475467; cursor: pointer; font: inherit; font-size: .84rem; font-weight: 650; }
  .filter-chip.active { border-color: #344054; background: #f2f4f7; color: #172033; }
  .focus-banner { display: flex; justify-content: space-between; align-items: center; gap: .75rem; padding: .7rem .85rem; border: 1px solid #c7d7fe; border-radius: 9px; background: #f5f8ff; }
  .muted { color: #667085; }
  .eyebrow { margin: 0 0 .28rem; color: #667085; font-size: .72rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  h2,p { margin-top: 0; }
  h2 { margin-bottom: .2rem; font-size: 1.16rem; }
  .create-panel { display: grid; gap: .85rem; padding: 1rem; border: 1px solid #b2ccff; border-radius: 10px; background: #f8faff; }
  .create-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  .create-heading p { margin-bottom: 0; }
  .icon-button { display: grid; place-items: center; width: 2rem; height: 2rem; padding: 0; border: 1px solid #d0d5dd; border-radius: 999px; background: #fff; color: #475467; cursor: pointer; font-size: 1.2rem; }
  .create-form { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(130px, .55fr) minmax(0, 1.5fr); gap: .7rem; align-items: end; }
  .create-form label { display: grid; gap: .3rem; color: #344054; font-weight: 650; }
  .create-form .wide { grid-column: 1 / -1; }
  .create-actions { grid-column: 1 / -1; justify-content: flex-end; }
  .workspace-grid { display: grid; grid-template-columns: minmax(0, 1.85fr) minmax(270px, .8fr); gap: 1rem; align-items: start; }
  .tree-panel { min-width: 0; padding: 1rem; border: 1px solid #dfe5ee; border-radius: 12px; background: #fff; }
  .panel-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding-bottom: .8rem; border-bottom: 1px solid #eaecf0; }
  .panel-heading p { margin-bottom: 0; }
  .result-count { color: #667085; font-size: .82rem; white-space: nowrap; }
  .tree { display: grid; margin-top: .55rem; }
  .tree-block { min-width: 0; border-bottom: 1px solid #f0f2f5; }
  .tree-block:last-child { border-bottom: 0; }
  .tree-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: .65rem; align-items: center; min-width: 0; padding: .55rem .45rem; border-radius: 8px; }
  .tree-row:hover { background: #f8fafc; }
  .tree-row.selected { background: #eef4ff; box-shadow: inset 3px 0 0 #6172f3; }
  .tree-row.context-only { background: #fcfcfd; }
  .tree-row.inactive { opacity: .68; }
  .tree-main { display: flex; align-items: center; min-width: 0; }
  .collapse-button,.tree-spacer { flex: 0 0 1.65rem; width: 1.65rem; }
  .collapse-button { height: 1.65rem; padding: 0; border: 0; border-radius: 5px; background: transparent; color: #475467; cursor: pointer; font-size: 1rem; }
  .collapse-button:hover { background: #eaecf0; }
  .node-button { display: grid; gap: .12rem; min-width: 0; padding: .12rem .2rem; border: 0; background: transparent; color: #172033; text-align: left; cursor: pointer; font: inherit; }
  .node-name { font-weight: 750; overflow-wrap: anywhere; }
  .node-meta { color: #667085; font-size: .76rem; }
  .node-counts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .45rem; color: #667085; font-size: .76rem; }
  .node-counts strong { color: #344054; }
  .row-actions { justify-content: flex-end; }
  .text-action { padding: .28rem .38rem; border: 0; background: transparent; color: #475467; cursor: pointer; font: inherit; font-size: .78rem; font-weight: 650; text-decoration: underline; text-decoration-color: #d0d5dd; text-underline-offset: 3px; }
  .text-action:hover { color: #172033; text-decoration-color: currentColor; }
  .case-list { display: grid; gap: .28rem; padding: .15rem .45rem .65rem 0; }
  .case-row { display: flex; justify-content: space-between; align-items: flex-start; gap: .8rem; padding: .52rem .65rem; border: 1px solid #e4e7ec; border-radius: 7px; background: #fcfcfd; color: #172033; text-decoration: none; }
  .case-row:hover { border-color: #b8c2d1; background: #fff; }
  .case-title { min-width: 0; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
  .case-open { flex: 0 0 auto; color: #667085; font-size: .76rem; font-weight: 650; }
  .empty-state { margin-top: .8rem; padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; color: #667085; }
  @media (max-width: 1120px) {
    .tree-row { grid-template-columns: minmax(0, 1fr) auto; }
    .row-actions { grid-column: 1 / -1; padding-left: 1.9rem; justify-content: flex-start; }
  }
  @media (max-width: 920px) {
    .toolbar,.workspace-grid { grid-template-columns: 1fr; }
    .toolbar-actions { justify-content: flex-start; }
    .create-form { grid-template-columns: 1fr; }
    .create-form .wide,.create-actions { grid-column: auto; }
  }
  @media (max-width: 620px) {
    .tree-row { grid-template-columns: 1fr; gap: .35rem; }
    .node-counts,.row-actions { justify-content: flex-start; padding-left: 1.9rem; }
    .case-list { margin-left: 2rem !important; }
    .focus-banner,.panel-heading { align-items: flex-start; flex-direction: column; }
  }
</style>
