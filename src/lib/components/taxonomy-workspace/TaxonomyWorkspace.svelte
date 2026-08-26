<script lang="ts">
  import CaseTaxonomyInspector from './CaseTaxonomyInspector.svelte';
  import SearchableTaxonomyPicker from './SearchableTaxonomyPicker.svelte';
  import TaxonomyChangeTray from './TaxonomyChangeTray.svelte';
  import TaxonomyInspector from './TaxonomyInspector.svelte';
  import type { SearchableTaxonomyOption } from './taxonomy-picker-model.ts';
  import {
    stageCaseTagChanges,
    type CaseTagAssignment,
    type CaseTagOption,
    type StagedCaseTagChange
  } from './case-tag-workspace-model.ts';
  import {
    activeSystemOptions,
    activeTaxonomyParents,
    buildTaxonomyWorkspaceRows,
    canStageTopicMove,
    listWorkspaceCases,
    projectTaxonomyWithCasePrimaryTopics,
    projectTaxonomyWithMoves,
    stageCasePrimaryTopicChanges,
    stageTopicMove,
    taxonomyOptionLabel,
    topicMoveTargets,
    type StagedCasePrimaryTopicChange,
    type StagedTopicMove,
    type TaxonomyWorkspaceItem,
    type WorkspaceFilter
  } from './taxonomy-workspace-model.ts';

  let {
    items,
    initialSearch = '',
    initialSelectedId = '',
    availableTags = [],
    caseTagAssignments = []
  }: {
    items: TaxonomyWorkspaceItem[];
    initialSearch?: string;
    initialSelectedId?: string;
    availableTags?: CaseTagOption[];
    caseTagAssignments?: CaseTagAssignment[];
  } = $props();

  let query = $state('');
  let filter = $state<WorkspaceFilter>('all');
  let selectedId = $state('');
  let selectedCaseIds = $state<string[]>([]);
  let focusSystemId = $state('');
  let collapsedIds = $state<string[]>([]);
  let revealedTopicIds = $state<string[]>([]);
  let createOpen = $state(false);
  let createKind = $state<'system' | 'topic'>('topic');
  let createParentId = $state('');
  let createContextLabel = $state('');
  let organizeMode = $state(false);
  let stagedMoves = $state<StagedTopicMove[]>([]);
  let stagedCaseChanges = $state<StagedCasePrimaryTopicChange[]>([]);
  let stagedCaseTagChanges = $state<StagedCaseTagChange[]>([]);
  let draggedTopicId = $state('');
  let moveTopicId = $state('');
  let moveParentId = $state('');
  let caseStageError = $state('');

  function initializeFromProps() {
    query = initialSearch;
    selectedId = initialSelectedId;
  }
  initializeFromProps();

  const caseProjectedItems = $derived(projectTaxonomyWithCasePrimaryTopics(items, stagedCaseChanges));
  const projectedItems = $derived(projectTaxonomyWithMoves(caseProjectedItems, stagedMoves));
  const parentOptions = $derived(activeTaxonomyParents(projectedItems));
  const parentSearchOptions = $derived<SearchableTaxonomyOption[]>(parentOptions.map((parent) => ({
    id: parent.id,
    label: parent.name,
    displayLabel: taxonomyOptionLabel(parent),
    searchLabel: parent.breadcrumbLabel,
    meta: parent.kind === 'system' ? 'System' : 'Topic'
  })));
  const systemOptions = $derived(activeSystemOptions(projectedItems));
  const rows = $derived(buildTaxonomyWorkspaceRows(projectedItems, {
    search: query,
    filter,
    focusSystemId: focusSystemId || null,
    collapsedIds
  }));
  const selected = $derived(projectedItems.find((item) => item.id === selectedId) ?? null);
  const workspaceCases = $derived(listWorkspaceCases(items, stagedCaseChanges));
  const selectedCases = $derived(workspaceCases.filter((caseItem) => selectedCaseIds.includes(caseItem.id)));
  const focusedSystem = $derived(systemOptions.find((item) => item.id === focusSystemId) ?? null);
  const selectedSubtopicCount = $derived(selected
    ? projectedItems.filter((item) => item.parentId === selected.id && item.kind === 'topic').length
    : 0);
  const moveTopic = $derived(projectedItems.find((item) => item.id === moveTopicId && item.kind === 'topic') ?? null);
  const moveTargetOptions = $derived(moveTopicId ? topicMoveTargets(projectedItems, moveTopicId) : []);
  const moveSearchOptions = $derived<SearchableTaxonomyOption[]>(moveTargetOptions.map((parent) => ({
    id: parent.id,
    label: parent.name,
    displayLabel: taxonomyOptionLabel(parent),
    searchLabel: parent.breadcrumbLabel,
    meta: parent.kind === 'system' ? 'System' : 'Topic'
  })));
  const stagedChangeCount = $derived(stagedMoves.length + stagedCaseChanges.length + stagedCaseTagChanges.length);
  const hasCaseClassificationBatch = $derived(stagedCaseChanges.length > 0 || stagedCaseTagChanges.length > 0);

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

  function revealCases(id: string) {
    if (!revealedTopicIds.includes(id)) revealedTopicIds = [...revealedTopicIds, id];
  }

  function queryMatchesCase(item: TaxonomyWorkspaceItem) {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return false;
    return Boolean(item.directCases?.some((caseItem) => caseItem.title.toLocaleLowerCase().includes(needle)));
  }

  function casesVisible(item: TaxonomyWorkspaceItem) {
    return revealedTopicIds.includes(item.id) || queryMatchesCase(item);
  }

  function selectNode(id: string) {
    selectedId = id;
    selectedCaseIds = [];
    caseStageError = '';
  }

  function toggleCaseSelection(caseId: string) {
    selectedCaseIds = toggleId(selectedCaseIds, caseId);
    selectedId = '';
    caseStageError = '';
  }

  function selectOnlyCase(caseId: string) {
    selectedCaseIds = [caseId];
    selectedId = '';
    caseStageError = '';
  }

  function selectDirectCases(topic: TaxonomyWorkspaceItem) {
    selectedCaseIds = (topic.directCases ?? []).map((caseItem) => caseItem.id).slice(0, 60);
    selectedId = '';
    caseStageError = '';
  }

  function clearCaseSelection() {
    selectedCaseIds = [];
    caseStageError = '';
  }

  function openCreate(kind: 'system' | 'topic', parentId = '', contextLabel = '') {
    createKind = kind;
    createParentId = kind === 'topic' ? parentId : '';
    createContextLabel = contextLabel;
    createOpen = true;
  }

  function createChild(parent: TaxonomyWorkspaceItem) {
    if (!parent.isActive) return;
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

  function enterOrganize() {
    organizeMode = true;
    createOpen = false;
  }

  function exitOrganize() {
    if (stagedChangeCount) return;
    organizeMode = false;
    moveTopicId = '';
    draggedTopicId = '';
    selectedCaseIds = [];
    caseStageError = '';
  }

  function discardAllChanges() {
    stagedMoves = [];
    stagedCaseChanges = [];
    stagedCaseTagChanges = [];
    moveTopicId = '';
    draggedTopicId = '';
    caseStageError = '';
  }

  function undoMove(topicId: string) {
    stagedMoves = stagedMoves.filter((move) => move.id !== topicId);
  }

  function undoCaseChange(caseId: string) {
    stagedCaseChanges = stagedCaseChanges.filter((change) => change.caseId !== caseId);
    caseStageError = '';
  }

  function undoTagChange(caseId: string, tagId: string) {
    stagedCaseTagChanges = stagedCaseTagChanges.filter((change) => change.caseId !== caseId || change.tagId !== tagId);
    caseStageError = '';
  }

  function isMoveStaged(topicId: string) {
    return stagedMoves.some((move) => move.id === topicId);
  }

  function isCasePrimaryChangeStaged(caseId: string) {
    return stagedCaseChanges.some((change) => change.caseId === caseId);
  }

  function isCaseTagChangeStaged(caseId: string) {
    return stagedCaseTagChanges.some((change) => change.caseId === caseId);
  }

  function canMoveTopic(topicId: string, parentId: string | null) {
    return !hasCaseClassificationBatch && canStageTopicMove(items, stagedMoves, topicId, parentId);
  }

  function openMove(topic: TaxonomyWorkspaceItem) {
    if (!organizeMode || topic.kind !== 'topic' || hasCaseClassificationBatch) return;
    moveTopicId = topic.id;
    moveParentId = topic.parentId ?? '';
  }

  function stageSelectedMove() {
    if (!moveTopic || hasCaseClassificationBatch) return;
    stagedMoves = stageTopicMove(items, stagedMoves, moveTopic.id, moveParentId || null);
    selectedId = moveTopic.id;
    selectedCaseIds = [];
    moveTopicId = '';
  }

  function beginDrag(event: DragEvent, topicId: string) {
    if (!organizeMode || hasCaseClassificationBatch) return;
    draggedTopicId = topicId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', topicId);
    }
  }

  function draggedId(event: DragEvent) {
    return draggedTopicId || event.dataTransfer?.getData('text/plain')?.trim() || '';
  }

  function allowDrop(event: DragEvent, parentId: string | null) {
    const topicId = draggedId(event);
    if (!topicId || !canMoveTopic(topicId, parentId)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function dropTopic(event: DragEvent, parentId: string | null) {
    const topicId = draggedId(event);
    if (!topicId || !canMoveTopic(topicId, parentId)) return;
    event.preventDefault();
    stagedMoves = stageTopicMove(items, stagedMoves, topicId, parentId);
    selectedId = topicId;
    selectedCaseIds = [];
    draggedTopicId = '';
  }

  function endDrag() {
    draggedTopicId = '';
  }

  function stageCasePrimaryTopic(caseIds: string[], topicId: string) {
    if (stagedMoves.length || stagedCaseTagChanges.length) {
      caseStageError = stagedMoves.length
        ? 'Apply or discard the staged hierarchy batch before staging Case Primary Topic changes.'
        : 'Apply or discard the staged Case Tag batch before staging Case Primary Topic changes.';
      return;
    }
    try {
      stagedCaseChanges = stageCasePrimaryTopicChanges(items, stagedCaseChanges, caseIds, topicId);
      caseStageError = '';
      revealCases(topicId);
      filter = 'all';
      const target = projectedItems.find((item) => item.id === topicId);
      if (focusSystemId && target?.systemId !== focusSystemId) focusSystemId = '';
    } catch (error) {
      caseStageError = error instanceof Error ? error.message : 'Unable to stage the Primary Topic change.';
    }
  }

  function stageCaseTags(caseIds: string[], tagId: string, operation: 'add' | 'remove') {
    if (stagedMoves.length || stagedCaseChanges.length) {
      caseStageError = stagedMoves.length
        ? 'Apply or discard the staged hierarchy batch before staging Case Tag changes.'
        : 'Apply or discard the staged Primary Topic batch before staging Case Tag changes.';
      return;
    }
    const tag = availableTags.find((option) => option.id === tagId);
    if (!tag) {
      caseStageError = 'Choose an active Tag.';
      return;
    }
    const selected = workspaceCases.filter((caseItem) => caseIds.includes(caseItem.id));
    try {
      stagedCaseTagChanges = stageCaseTagChanges(caseTagAssignments, stagedCaseTagChanges, selected, tag, operation);
      caseStageError = '';
    } catch (error) {
      caseStageError = error instanceof Error ? error.message : 'Unable to stage the Case Tag change.';
    }
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
      <button class="button" type="button" onclick={() => { collapsedIds = projectedItems.map((item) => item.id); }}>Collapse all</button>
      {#if organizeMode}
        <button
          class="button organize-active"
          type="button"
          disabled={stagedChangeCount > 0}
          title={stagedChangeCount ? 'Discard or apply staged changes before leaving Organize mode.' : 'Return to Browse mode'}
          onclick={exitOrganize}
        >Done organizing</button>
      {:else}
        <button class="button" type="button" onclick={enterOrganize}>Organize taxonomy &amp; Cases</button>
        <button class="button" type="button" onclick={() => openCreate('system')}>+ New System</button>
        <button class="button primary" type="button" onclick={() => openCreate('topic')}>+ New Topic</button>
      {/if}
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

  {#if organizeMode}
    <section class="organize-banner" aria-label="Organize mode">
      <div>
        <p class="eyebrow">Organize mode</p>
        <strong>Taxonomy and Case changes are staged before persistence.</strong>
        <p>Move Topics, or reveal and select Cases to change their Primary Topic or Case Tags. This milestone keeps each mutation domain separate so every apply has explicit write semantics.</p>
      </div>
      <div
        class:drop-allowed={Boolean(draggedTopicId && canMoveTopic(draggedTopicId, null))}
        class:drop-disabled={hasCaseClassificationBatch}
        class="unassigned-drop"
        role="group"
        aria-label="Move Topic to Unassigned"
        ondragover={(event) => allowDrop(event, null)}
        ondrop={(event) => dropTopic(event, null)}
      >
        Drop here → Unassigned Topics
      </div>
    </section>
  {/if}

  {#if caseStageError}
    <div class="inline-error" role="status">{caseStageError}</div>
  {/if}

  {#if moveTopic}
    <section class="move-panel" aria-labelledby="move-topic-heading">
      <div>
        <p class="eyebrow">Stage hierarchy change</p>
        <h2 id="move-topic-heading">Move {moveTopic.name}</h2>
        <p class="muted">Choose a new active System/Topic parent, or leave it Unassigned. This does not save immediately.</p>
      </div>
      <SearchableTaxonomyPicker
        bind:value={moveParentId}
        options={moveSearchOptions}
        label="New parent"
        searchPlaceholder="Search parent or breadcrumb…"
        emptyLabel="Unassigned"
      />
      <div class="move-actions">
        <button class="button" type="button" onclick={() => { moveTopicId = ''; }}>Cancel</button>
        <button class="button primary" type="button" onclick={stageSelectedMove}>Stage move</button>
      </div>
    </section>
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
          <div>
            <SearchableTaxonomyPicker
              bind:value={createParentId}
              options={parentSearchOptions}
              label="Parent"
              searchPlaceholder="Search System or Topic…"
              emptyLabel="Unassigned"
            />
            <input type="hidden" name="parent_id" value={createParentId} />
          </div>
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
          <p class="muted">{organizeMode ? 'Reveal Cases to select one or several for staged Primary Topic or Case Tag changes.' : "Browse safely here. Cases stay hidden until you reveal a Topic's direct Cases."}</p>
        </div>
        <span class="result-count">{rows.length} visible{#if selectedCaseIds.length} · {selectedCaseIds.length} selected Cases{/if}{#if stagedChangeCount} · {stagedChangeCount} staged{/if}</span>
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
                class:staged={row.kind === 'topic' && isMoveStaged(row.id)}
                class:drop-allowed={Boolean(organizeMode && draggedTopicId && row.isActive && canMoveTopic(draggedTopicId, row.id))}
                class="tree-row"
                role="treeitem"
                aria-level={row.depth + 1}
                aria-selected={selectedId === row.id}
                aria-expanded={row.hasChildren ? !collapsedIds.includes(row.id) : undefined}
                ondragover={(event) => organizeMode && row.isActive && allowDrop(event, row.id)}
                ondrop={(event) => organizeMode && row.isActive && dropTopic(event, row.id)}
              >
                <div class="tree-main" style={`padding-left: ${row.depth * 1.05}rem`}>
                  {#if organizeMode && row.kind === 'topic'}
                    <button
                      class="drag-handle"
                      type="button"
                      draggable={!hasCaseClassificationBatch}
                      disabled={hasCaseClassificationBatch}
                      aria-label={`Drag ${row.name} to move Topic`}
                      title={hasCaseClassificationBatch ? 'Apply or discard the Case classification batch before staging Topic moves.' : 'Drag to stage a Topic move'}
                      ondragstart={(event) => beginDrag(event, row.id)}
                      ondragend={endDrag}
                    >⋮⋮</button>
                  {/if}
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
                  <button class="node-button" type="button" onclick={() => selectNode(row.id)}>
                    <span class="node-name">{row.name}</span>
                    <span class="node-meta">
                      {row.kind === 'system' ? 'System' : 'Topic'}
                      {#if row.unassigned} · Unassigned{/if}
                      {#if !row.isActive} · Inactive{/if}
                      {#if row.kind === 'topic' && isMoveStaged(row.id)} · Move staged{/if}
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
                  {#if organizeMode && row.kind === 'topic'}
                    <button
                      class="text-action"
                      type="button"
                      disabled={hasCaseClassificationBatch}
                      title={hasCaseClassificationBatch ? 'Apply or discard the Case classification batch before staging Topic moves.' : undefined}
                      onclick={() => openMove(row)}
                    >Move to…</button>
                  {:else if row.isActive}
                    <button class="text-action" type="button" onclick={() => createChild(row)}>
                      {row.kind === 'system' ? '+ Add Topic' : '+ Add subtopic'}
                    </button>
                  {/if}
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
                    {#if organizeMode && row.directCases.length > 1}
                      <div class="case-list-tools">
                        <span>{row.directCases.length} direct Cases</span>
                        <button class="text-action" type="button" onclick={() => selectDirectCases(row)}>Select direct Cases</button>
                      </div>
                    {/if}
                    {#each row.directCases as caseItem (caseItem.id)}
                      {#if organizeMode}
                        <div
                          class:selected-case={selectedCaseIds.includes(caseItem.id)}
                          class:staged-case={isCasePrimaryChangeStaged(caseItem.id) || isCaseTagChangeStaged(caseItem.id)}
                          class="case-row organize-case-row"
                        >
                          <input
                            class="case-checkbox"
                            type="checkbox"
                            checked={selectedCaseIds.includes(caseItem.id)}
                            aria-label={`Select ${caseItem.title}`}
                            onchange={() => toggleCaseSelection(caseItem.id)}
                          />
                          <button class="case-select" type="button" onclick={() => selectOnlyCase(caseItem.id)}>
                            <span class="case-title">{caseItem.title}</span>
                            <span class="case-meta">
                              {isCasePrimaryChangeStaged(caseItem.id)
                                ? 'Primary Topic change staged'
                                : isCaseTagChangeStaged(caseItem.id)
                                  ? 'Case Tag change staged'
                                  : 'Primary Topic: ' + row.breadcrumbLabel}
                            </span>
                          </button>
                          <a class="case-open" href={'/admin/cases/' + caseItem.id}>Open Case</a>
                        </div>
                      {:else}
                        <a class="case-row" href={'/admin/cases/' + caseItem.id}>
                          <span class="case-title">{caseItem.title}</span>
                          <span class="case-open">Open Case</span>
                        </a>
                      {/if}
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

    {#if organizeMode && selectedCases.length}
      <CaseTaxonomyInspector
        {selectedCases}
        items={projectedItems}
        {availableTags}
        {caseTagAssignments}
        stagedTagChanges={stagedCaseTagChanges}
        primaryStagingBlockedReason={stagedMoves.length
          ? 'Apply or discard the staged hierarchy batch before staging Case Primary Topic changes.'
          : stagedCaseTagChanges.length
            ? 'Apply or discard the staged Case Tag batch before staging Case Primary Topic changes.'
            : ''}
        tagStagingBlockedReason={stagedMoves.length
          ? 'Apply or discard the staged hierarchy batch before staging Case Tag changes.'
          : stagedCaseChanges.length
            ? 'Apply or discard the staged Primary Topic batch before staging Case Tag changes.'
            : ''}
        onStage={stageCasePrimaryTopic}
        onStageTags={stageCaseTags}
        onClear={clearCaseSelection}
      />
    {:else}
      <TaxonomyInspector
        {selected}
        subtopicCount={selectedSubtopicCount}
        casesRevealed={selected ? casesVisible(selected) : false}
        focused={Boolean(selected && selected.kind === 'system' && selected.id === focusSystemId)}
        {organizeMode}
        moveStaged={Boolean(selected && selected.kind === 'topic' && isMoveStaged(selected.id))}
        onCreateChild={createChild}
        onToggleCases={toggleCases}
        onFocus={focusSystem}
        onClearFocus={clearFocus}
        onMoveTopic={openMove}
      />
    {/if}
  </div>

  {#if stagedChangeCount}
    <TaxonomyChangeTray
      moves={stagedMoves}
      caseChanges={stagedCaseChanges}
      tagChanges={stagedCaseTagChanges}
      items={projectedItems}
      onDiscardAll={discardAllChanges}
      onUndoMove={undoMove}
      onUndoCaseChange={undoCaseChange}
      onUndoTagChange={undoTagChange}
    />
  {/if}
</section>

<style>
  .workspace-shell { display: grid; gap: .9rem; margin-top: 1rem; }
  .toolbar { display: grid; grid-template-columns: minmax(260px, 1fr) auto; gap: .75rem; align-items: end; }
  .search-control { display: grid; gap: .32rem; color: #344054; font-weight: 650; }
  input,select,textarea { box-sizing: border-box; width: 100%; padding: .66rem .72rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  textarea { resize: vertical; }
  .toolbar-actions,.create-actions,.move-actions,.row-actions,.filter-row { display: flex; flex-wrap: wrap; gap: .45rem; }
  .button { display: inline-block; width: max-content; max-width: 100%; box-sizing: border-box; padding: .66rem .88rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; font-weight: 650; }
  .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .button.compact { padding: .45rem .65rem; }
  .button.organize-active { border-color: #f79009; background: #fffaeb; color: #93370d; }
  .button:disabled,.text-action:disabled,.drag-handle:disabled { cursor: not-allowed; opacity: .5; }
  .filter-row { align-items: center; }
  .filter-chip { padding: .38rem .68rem; border: 1px solid #d0d5dd; border-radius: 999px; background: #fff; color: #475467; cursor: pointer; font: inherit; font-size: .84rem; font-weight: 650; }
  .filter-chip.active { border-color: #344054; background: #f2f4f7; color: #172033; }
  .focus-banner { display: flex; justify-content: space-between; align-items: center; gap: .75rem; padding: .7rem .85rem; border: 1px solid #c7d7fe; border-radius: 9px; background: #f5f8ff; }
  .organize-banner { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .8rem; align-items: center; padding: .85rem 1rem; border: 1px solid #fdb022; border-radius: 10px; background: #fffaeb; }
  .organize-banner p { margin-bottom: 0; color: #854a0e; }
  .unassigned-drop { padding: .7rem .85rem; border: 1px dashed #f79009; border-radius: 8px; background: #fff; color: #93370d; font-weight: 700; }
  .unassigned-drop.drop-allowed { outline: 3px solid rgb(247 144 9 / .25); background: #fff4e6; }
  .unassigned-drop.drop-disabled { opacity: .5; }
  .inline-error { padding: .65rem .8rem; border: 1px solid #fecdca; border-radius: 8px; background: #fef3f2; color: #b42318; font-weight: 650; }
  .muted { color: #667085; }
  .eyebrow { margin: 0 0 .28rem; color: #667085; font-size: .72rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
  h2,p { margin-top: 0; }
  h2 { margin-bottom: .2rem; font-size: 1.16rem; }
  .create-panel,.move-panel { display: grid; gap: .85rem; padding: 1rem; border: 1px solid #b2ccff; border-radius: 10px; background: #f8faff; }
  .move-panel { grid-template-columns: minmax(0, 1fr) minmax(260px, .8fr) auto; align-items: end; border-color: #fdb022; background: #fffcf5; }
  .move-panel p { margin-bottom: 0; }
  .move-actions { justify-content: flex-end; }
  .create-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  .create-heading p { margin-bottom: 0; }
  .icon-button { display: grid; place-items: center; width: 2rem; height: 2rem; padding: 0; border: 1px solid #d0d5dd; border-radius: 999px; background: #fff; color: #475467; cursor: pointer; font-size: 1.2rem; }
  .create-form { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(130px, .55fr) minmax(0, 1.5fr); gap: .7rem; align-items: end; }
  .create-form label { display: grid; gap: .3rem; color: #344054; font-weight: 650; }
  .create-form .wide { grid-column: 1 / -1; }
  .create-actions { grid-column: 1 / -1; justify-content: flex-end; }
  .workspace-grid { display: grid; grid-template-columns: minmax(0, 1.85fr) minmax(285px, .8fr); gap: 1rem; align-items: start; }
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
  .tree-row.staged { box-shadow: inset 3px 0 0 #f79009; }
  .tree-row.drop-allowed { outline: 2px solid #f79009; outline-offset: -2px; background: #fffaeb; }
  .tree-main { display: flex; align-items: center; min-width: 0; }
  .drag-handle { flex: 0 0 1.75rem; width: 1.75rem; height: 1.75rem; padding: 0; border: 1px solid #d0d5dd; border-radius: 5px; background: #fff; color: #667085; cursor: grab; font: inherit; font-weight: 800; line-height: 1; }
  .drag-handle:active { cursor: grabbing; }
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
  .text-action:hover:not(:disabled) { color: #172033; text-decoration-color: currentColor; }
  .case-list { display: grid; gap: .28rem; padding: .15rem .45rem .65rem 0; }
  .case-list-tools { display: flex; justify-content: space-between; align-items: center; gap: .6rem; color: #667085; font-size: .78rem; }
  .case-row { display: flex; justify-content: space-between; align-items: flex-start; gap: .8rem; padding: .52rem .65rem; border: 1px solid #e4e7ec; border-radius: 7px; background: #fcfcfd; color: #172033; text-decoration: none; }
  a.case-row:hover { border-color: #b8c2d1; background: #fff; }
  .organize-case-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; }
  .organize-case-row.selected-case { border-color: #8098f9; background: #f5f8ff; }
  .organize-case-row.staged-case { box-shadow: inset 3px 0 0 #f79009; }
  .case-checkbox { width: 1rem; height: 1rem; margin: .12rem 0 0; accent-color: #344054; }
  .case-select { display: grid; gap: .12rem; min-width: 0; padding: 0; border: 0; background: transparent; color: #172033; text-align: left; cursor: pointer; font: inherit; }
  .case-title { min-width: 0; font-weight: 650; line-height: 1.35; overflow-wrap: anywhere; }
  .case-meta { color: #667085; font-size: .74rem; overflow-wrap: anywhere; }
  .case-open { flex: 0 0 auto; color: #667085; font-size: .76rem; font-weight: 650; }
  .empty-state { margin-top: .8rem; padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; color: #667085; }
  @media (max-width: 1120px) {
    .tree-row { grid-template-columns: minmax(0, 1fr) auto; }
    .row-actions { grid-column: 1 / -1; padding-left: 1.9rem; justify-content: flex-start; }
    .move-panel { grid-template-columns: 1fr; }
    .move-actions { justify-content: flex-start; }
  }
  @media (max-width: 920px) {
    .toolbar,.workspace-grid,.organize-banner { grid-template-columns: 1fr; }
    .toolbar-actions { justify-content: flex-start; }
    .create-form { grid-template-columns: 1fr; }
    .create-form .wide,.create-actions { grid-column: auto; }
    .unassigned-drop { width: auto; }
  }
  @media (max-width: 620px) {
    .tree-row { grid-template-columns: 1fr; gap: .35rem; }
    .node-counts,.row-actions { justify-content: flex-start; padding-left: 1.9rem; }
    .case-list { margin-left: 2rem !important; }
    .case-list-tools,.focus-banner,.panel-heading { align-items: flex-start; flex-direction: column; }
    .organize-case-row { grid-template-columns: auto minmax(0, 1fr); }
    .organize-case-row .case-open { grid-column: 2; }
    .drag-handle { display: none; }
  }
</style>
