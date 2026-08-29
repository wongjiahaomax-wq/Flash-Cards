<script>
  import { onMount } from 'svelte';
  import BulkCaseTagEditor from '$lib/components/case-library/BulkCaseTagEditor.svelte';
  import CaseClassificationEditor from '$lib/components/case-library/CaseClassificationEditor.svelte';
  import CaseLibraryTopicCreator from '$lib/components/case-library/CaseLibraryTopicCreator.svelte';
  import CaseTagInlineEditor from '$lib/components/case-library/CaseTagInlineEditor.svelte';
  import { applyCaseSelection, reconcileVisibleCaseSelection } from '$lib/admin-case-selection.js';
  import {
    CASE_LIBRARY_STATE_VERSION,
    caseLibraryNamedActionHref,
    caseLibraryStateHref,
    clearCaseLibraryStoredState,
    readCaseLibraryStoredState,
    shouldRestoreCaseLibraryState,
    writeCaseLibraryStoredState
  } from '$lib/admin-case-library-state.ts';

  let { data, form } = $props();

  /** @param {unknown} value */
  function failedTopicSelection(value) {
    const visibleIds = data.cases.map((item) => item.id);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return reconcileVisibleCaseSelection({ selectedIds: [], visibleIds });
    }
    const candidate = /** @type {Record<string, unknown>} */ (value);
    return reconcileVisibleCaseSelection({
      selectedIds: Array.isArray(candidate.topicSelectedCaseIds) ? candidate.topicSelectedCaseIds : [],
      visibleIds
    });
  }

  let query = $state('');
  let topicQuery = $state('');
  let systemQuery = $state('');
  let searchForm = $state();
  let persistenceReady = $state(false);
  const failedSelection = failedTopicSelection(form);
  /** @type {string[]} */
  let selectedCaseIds = $state(failedSelection.selectedIds);
  const removedFailedTopicSelectionCount = failedSelection.removedCount;
  /** @type {string | null} */
  let selectionAnchorId = $state(null);
  let inactiveView = $derived(data.caseFilters.lifecycle === 'inactive');
  let firstShown = $derived(data.pagination.totalCount === 0 ? 0 : (data.pagination.page - 1) * data.pagination.pageSize + 1);
  let lastShown = $derived(Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalCount));
  let allVisibleSelected = $derived(data.cases.length > 0 && data.cases.every((item) => selectedCaseIds.includes(item.id)));
  let topicGroups = $derived.by(() => {
    /** @type {Map<string, { label: string, topics: { id: string, name: string, breadcrumb: { id: string, name: string, kind: string }[] }[] }>} */
    const groups = new Map();
    for (const topic of data.topics) {
      const systemIndex = topic.breadcrumb.findIndex((item) => item.kind === 'system');
      const groupLabel = systemIndex >= 0 ? topic.breadcrumb[systemIndex].name : 'Unassigned Topics';
      const current = groups.get(groupLabel) ?? { label: groupLabel, topics: [] };
      current.topics.push(topic);
      groups.set(groupLabel, current);
    }
    return [...groups.values()]
      .sort((left, right) => left.label.localeCompare(right.label))
      .map((group) => ({ ...group, topics: group.topics.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)) }));
  });
  let topicCreationFailure = $derived(Boolean(form && 'topicCreation' in form && form.topicCreation));
  let topicCreationRetryRequiresSelection = $derived(topicCreationFailure && failedSelection.submittedCount > 0);
  let topicCreationError = $derived(topicCreationFailure && form && 'error' in form ? form.error : '');
  let topicCreationName = $derived(form && 'topicName' in form ? String(form.topicName ?? '') : '');
  let topicCreationParentId = $derived(form && 'topicParentId' in form ? String(form.topicParentId ?? '') : '');

  function currentStoredState() {
    return {
      version: CASE_LIBRARY_STATE_VERSION,
      q: data.caseFilters.search,
      topic: data.caseFilters.topicSearch,
      system: data.caseFilters.systemSearch,
      tag: data.caseFilters.tagId,
      sort: data.caseFilters.sort,
      lifecycle: data.caseFilters.lifecycle,
      page: data.pagination.page
    };
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    if (shouldRestoreCaseLibraryState(params, Boolean(form))) {
      const stored = readCaseLibraryStoredState();
      if (stored) {
        const href = caseLibraryStateHref(stored);
        if (href !== '/admin/cases') {
          window.location.replace(href);
          return;
        }
      }
    }
    writeCaseLibraryStoredState(currentStoredState());
    persistenceReady = true;
  });

  $effect(() => {
    query = data.caseFilters.search;
    topicQuery = data.caseFilters.topicSearch;
    systemQuery = data.caseFilters.systemSearch;
  });

  $effect(() => {
    const visibleIds = data.cases.map((item) => item.id);
    const reconciled = reconcileVisibleCaseSelection({ selectedIds: selectedCaseIds, visibleIds });
    if (reconciled.removedCount) selectedCaseIds = reconciled.selectedIds;
    if (selectionAnchorId && !visibleIds.includes(selectionAnchorId)) selectionAnchorId = null;
  });

  $effect(() => {
    if (!persistenceReady) return;
    writeCaseLibraryStoredState(currentStoredState());
  });

  function applyFilters() {
    searchForm?.requestSubmit();
  }

  /** @param {URLSearchParams} params */
  function preserveLifecycle(params) {
    if (inactiveView) params.set('lifecycle', 'inactive');
  }

  /** @param {number} page */
  function pageHref(page) {
    return caseLibraryStateHref({ ...currentStoredState(), page }, ['page']);
  }

  /** @param {'case' | 'topic' | 'system' | 'tag'} column */
  function sortHref(column) {
    const currentColumn = data.caseFilters.sort?.split('-')[0];
    const currentDirection = data.caseFilters.sort?.split('-')[1];
    const direction = currentColumn === column && currentDirection === 'asc' ? 'desc' : 'asc';
    return caseLibraryStateHref({ ...currentStoredState(), sort: `${column}-${direction}`, page: 1 }, ['sort']);
  }

  /** @param {'case' | 'topic' | 'system' | 'tag'} column */
  function sortIndicator(column) {
    if (data.caseFilters.sort?.startsWith(`${column}-asc`)) return '↑';
    if (data.caseFilters.sort?.startsWith(`${column}-desc`)) return '↓';
    return '↕';
  }

  function toggleAllVisible() {
    selectedCaseIds = allVisibleSelected ? [] : data.cases.map((item) => item.id);
    selectionAnchorId = null;
  }

  /** @param {string} caseId @param {MouseEvent} event */
  function selectCase(caseId, event) {
    const next = applyCaseSelection({ selectedIds: selectedCaseIds, orderedIds: data.cases.map((item) => item.id), anchorId: selectionAnchorId, caseId, shiftKey: event.shiftKey });
    selectedCaseIds = [...next.selectedIds];
    selectionAnchorId = next.anchorId;
  }

  function currentQuery() {
    const params = new URLSearchParams();
    if (data.caseFilters.search) params.set('q', data.caseFilters.search);
    if (data.caseFilters.topicSearch) params.set('topic', data.caseFilters.topicSearch);
    if (data.caseFilters.systemSearch) params.set('system', data.caseFilters.systemSearch);
    if (data.caseFilters.tagId) params.set('tag', data.caseFilters.tagId);
    if (data.caseFilters.sort && data.caseFilters.sort !== 'case-asc') params.set('sort', data.caseFilters.sort);
    preserveLifecycle(params);
    if (data.pagination.page > 1) params.set('page', String(data.pagination.page));
    return params.toString();
  }

  /** @param {string} actionName */
  function actionHref(actionName) {
    return caseLibraryNamedActionHref(actionName, currentQuery());
  }

  /** @param {'active'|'inactive'} lifecycle */
  function lifecycleHref(lifecycle) {
    return caseLibraryStateHref({ ...currentStoredState(), lifecycle, page: 1 }, ['lifecycle']);
  }

  function clearHref() {
    return inactiveView ? '/admin/cases?lifecycle=inactive' : '/admin/cases';
  }

  function clearRememberedState() {
    clearCaseLibraryStoredState();
  }

  /** @param {MouseEvent} event */
  function confirmBulkDeactivate(event) {
    const count = selectedCaseIds.length;
    if (!count || !window.confirm(`Deactivate ${count} Case${count === 1 ? '' : 's'}? They will be removed from learner study, but their content and history will be retained.`)) event.preventDefault();
  }

  /** @param {SubmitEvent} event */
  function confirmBulkTopicSystemMove(event) {
    const count = selectedCaseIds.length;
    if (!count || !window.confirm(`Move the Primary Topics for ${count} selected Case${count === 1 ? '' : 's'} globally? This affects every Case using those shared Topics and moves any descendant Topic subtrees and their Cases too.`)) event.preventDefault();
  }

  /** @param {{ id: string }} item */
  function caseHref(item) {
    return inactiveView ? `/admin/cases/${item.id}/recovery` : `/admin/cases/${item.id}`;
  }
</script>

<svelte:head><title>Cases | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div><p class="eyebrow">Content library</p><h1>Cases</h1><p class="muted">Find an existing Case by title or cross-cutting clinical Tag.</p></div>
  <a class="button primary" href="/admin/cases/new">New Case</a>
</section>

<nav class="lifecycle-tabs" aria-label="Case lifecycle">
  <a class:current={!inactiveView} href={lifecycleHref('active')} aria-current={!inactiveView ? 'page' : undefined}>Active</a>
  <a class:current={inactiveView} href={lifecycleHref('inactive')} aria-current={inactiveView ? 'page' : undefined}>Inactive</a>
</nav>

<form class="search-form" method="GET" bind:this={searchForm}>
  <label class="search-field" for="case-search">Case contains<input id="case-search" name="q" bind:value={query} placeholder="e.g. pericarditis" /></label>
  <label class="search-field" for="topic-search">Topic contains<input id="topic-search" name="topic" bind:value={topicQuery} placeholder="e.g. AMI" /></label>
  <label class="search-field" for="system-search">System contains<input id="system-search" name="system" bind:value={systemQuery} placeholder="e.g. Cardiology or Unassigned" /></label>
  <label for="case-tag">Tag<select id="case-tag" name="tag" onchange={applyFilters}><option value="">All Tags</option>{#each data.tags as tag}<option value={tag.id} selected={tag.id === data.caseFilters.tagId}>{tag.name}</option>{/each}</select></label>
  {#if inactiveView}<input type="hidden" name="lifecycle" value="inactive" />{/if}
  {#if data.caseFilters.sort && data.caseFilters.sort !== 'case-asc'}<input type="hidden" name="sort" value={data.caseFilters.sort} />{/if}
  <div class="search-actions"><button class="button primary" type="submit">Search</button>{#if query || topicQuery || systemQuery || data.caseFilters.tagId}<a class="button" href={clearHref()} onclick={clearRememberedState}>Clear</a>{/if}</div>
</form>

<section class="panel" aria-labelledby="case-list-heading">
  <div class="panel-heading"><div><h2 id="case-list-heading">{inactiveView ? 'Inactive Cases' : 'Active Cases'} <span class="count">{data.pagination.totalCount}</span></h2><span class="muted">Showing {firstShown}–{lastShown} of {data.pagination.totalCount} Cases · Page {data.pagination.page} of {data.pagination.totalPages}.</span></div><span class="muted">{inactiveView ? 'Inactive Cases are preserved for recovery and are unavailable to learners.' : 'Tags are curation metadata; Topic remains the learner study route.'}</span></div>
  {#if form?.error && !topicCreationFailure}<p class="form-error" role="alert">{form.error}</p>{/if}
  {#if removedFailedTopicSelectionCount}<p class="selection-warning" role="status">{removedFailedTopicSelectionCount} previously selected Case{removedFailedTopicSelectionCount === 1 ? '' : 's'} {removedFailedTopicSelectionCount === 1 ? 'is' : 'are'} no longer visible in this Case Library view and {removedFailedTopicSelectionCount === 1 ? 'was' : 'were'} removed from the retry selection. Select {removedFailedTopicSelectionCount === 1 ? 'it' : 'them'} again from {removedFailedTopicSelectionCount === 1 ? 'its' : 'their'} current location if you still intend to change {removedFailedTopicSelectionCount === 1 ? 'it' : 'them'}.</p>{/if}
  {#if data.status === 'bulk-topic-updated'}<p class="success-message" role="status">Primary Topic updated for the selected Cases.</p>{/if}
  {#if data.status === 'topic-created'}<p class="success-message" role="status">Created Topic {data.statusTopicName}.</p>{/if}
  {#if data.status === 'topic-created-and-assigned'}<p class="success-message" role="status">Created Topic {data.statusTopicName} and assigned it to {data.statusCaseCount} selected Case{data.statusCaseCount === 1 ? '' : 's'}.</p>{/if}
  {#if data.status === 'topic-systems-moved'}<p class="success-message" role="status">Moved {data.statusTopicCount} shared Topic{data.statusTopicCount === 1 ? '' : 's'} globally under {data.statusSystemName}.</p>{/if}
  {#if data.status === 'case-tags-added'}<p class="success-message" role="status">{data.statusTagName} is now attached to {data.statusCaseCount} selected Case{data.statusCaseCount === 1 ? '' : 's'}.</p>{/if}
  {#if data.status === 'case-tags-removed'}<p class="success-message" role="status">{data.statusTagName} was removed from {data.statusCaseCount} selected Case{data.statusCaseCount === 1 ? '' : 's'} where present.</p>{/if}
  {#if data.status === 'case-tag-created-bulk'}<p class="success-message" role="status">Created {data.statusTagName} and attached it to {data.statusCaseCount} selected Case{data.statusCaseCount === 1 ? '' : 's'}.</p>{/if}
  {#if data.status === 'cases-deactivated'}<p class="success-message" role="status">Selected Cases deactivated. Their content and history were retained.</p>{/if}
  {#if data.status === 'cases-restored'}<p class="success-message" role="status">Selected Cases restored to active use.</p>{/if}

  {#if !inactiveView}
    <form id="bulk-topic-assignment-form" method="POST" action={actionHref('bulkPromoteTopic')}>
      <input type="hidden" name="return_query" value={currentQuery()} />
      {#each selectedCaseIds as caseId}<input type="hidden" name="case_ids" value={caseId} />{/each}
    </form>
    <form id="bulk-topic-system-move-form" method="POST" action={actionHref('bulkMoveCaseTopicsToSystem')} onsubmit={confirmBulkTopicSystemMove}>
      <input type="hidden" name="return_query" value={currentQuery()} />
      {#each selectedCaseIds as caseId}<input type="hidden" name="case_ids" value={caseId} />{/each}
    </form>
  {/if}

  <form method="POST" action={actionHref(inactiveView ? 'bulkRestoreCases' : 'bulkDeactivateCases')}>
    <input type="hidden" name="return_query" value={currentQuery()} />
    {#if inactiveView}
      {#if data.cases.length}
        <div class="bulk-toolbar"><div><strong>Bulk restore Cases</strong><span class="muted">{selectedCaseIds.length} Case{selectedCaseIds.length === 1 ? '' : 's'} selected</span><span class="selection-hint">Shift-click a row to select a range</span></div><button class="button primary" type="submit" disabled={!selectedCaseIds.length}>Restore selected</button></div>
      {/if}
    {:else}
      <div class="bulk-toolbar">
        <div><strong>Bulk Case actions</strong><span class="muted">{selectedCaseIds.length} Case{selectedCaseIds.length === 1 ? '' : 's'} selected</span><span class="selection-hint">Shift-click a row to select a range</span></div>
        <label class="bulk-topic">Topic<select name="concept_id" form="bulk-topic-assignment-form" required disabled={!selectedCaseIds.length}><option value="">Choose a Topic</option>{#each topicGroups as group}<optgroup label={group.label}>{#each group.topics as topic}{@const systemIndex = topic.breadcrumb.findIndex((item) => item.kind === 'system')}<option value={topic.id}>{topic.breadcrumb.slice(systemIndex >= 0 ? systemIndex + 1 : 0).map((/** @param {{ name: string }} item */ item) => item.name).join(' → ')}</option>{/each}</optgroup>{/each}</select></label>
        <button class="button primary" type="submit" form="bulk-topic-assignment-form" disabled={!selectedCaseIds.length}>Assign Topic</button>
        <label class="bulk-system">System<select name="system_id" form="bulk-topic-system-move-form" required disabled={!selectedCaseIds.length}><option value="">Choose a System</option>{#each data.topicParents.filter((option) => option.kind === 'system') as system}<option value={system.id}>{system.name}</option>{/each}</select></label>
        <button class="button warning" type="submit" form="bulk-topic-system-move-form" disabled={!selectedCaseIds.length}>Move Topics globally</button>
        <CaseLibraryTopicCreator selectedCaseIds={selectedCaseIds} parentOptions={data.topicParents} error={topicCreationError} initialName={topicCreationName} initialParentId={topicCreationParentId} actionQuery={currentQuery()} retryRequiresSelection={topicCreationRetryRequiresSelection} />
        <BulkCaseTagEditor selectedCaseIds={selectedCaseIds} cases={data.cases} availableTags={data.tags} actionQuery={currentQuery()} />
        <button class="button danger" type="submit" disabled={!selectedCaseIds.length} onclick={confirmBulkDeactivate}>Deactivate selected</button>
      </div>
    {/if}

    {#if data.cases.length === 0}
      <p class="empty-state">No {inactiveView ? 'inactive' : 'active'} Cases match these filters.</p>
    {:else}
      <div class="case-table" role="list">
        <div class="table-header"><span class="case-heading"><input type="checkbox" checked={allVisibleSelected} onchange={toggleAllVisible} aria-label="Select all visible Cases" /><a class="sort-header" href={sortHref('case')} aria-label={`Sort by Case ${data.caseFilters.sort === 'case-asc' ? 'descending' : 'ascending'}`}>Case <span aria-hidden="true">{sortIndicator('case')}</span></a></span><a class="sort-header" href={sortHref('topic')} aria-label={`Sort by Topic ${data.caseFilters.sort === 'topic-asc' ? 'descending' : 'ascending'}`}>Topic <span aria-hidden="true">{sortIndicator('topic')}</span></a><a class="sort-header" href={sortHref('system')} aria-label={`Sort by System ${data.caseFilters.sort === 'system-asc' ? 'descending' : 'ascending'}`}>System <span aria-hidden="true">{sortIndicator('system')}</span></a><a class="sort-header" href={sortHref('tag')} aria-label={`Sort by Tags ${data.caseFilters.sort === 'tag-asc' ? 'descending' : 'ascending'}`}>Tags <span aria-hidden="true">{sortIndicator('tag')}</span></a><span>Open</span></div>
        {#each data.cases as item}
          <div class="table-row" class:inactive-row={inactiveView} class:selected-row={selectedCaseIds.includes(item.id)}>
            <span class="case-cell"><input class="case-select" type="checkbox" name="case_ids" value={item.id} checked={selectedCaseIds.includes(item.id)} onclick={(event) => selectCase(item.id, event)} aria-label={`Select ${item.title}`} /><a href={caseHref(item)}><strong>{item.title}</strong></a>{#if inactiveView}<span class="status-badge">Inactive</span>{/if}</span>
            {#if inactiveView}<span>{item.conceptName ?? 'Unassigned'}</span>{:else}<div class="classification-cell"><span>{item.conceptName ?? 'Unassigned'}</span><CaseClassificationEditor caseId={item.id} caseTitle={item.title} currentTopicId={item.conceptId ?? ''} currentTopicName={item.conceptName ?? 'Unassigned'} currentSystemName={item.systemName ?? 'Unassigned'} topics={data.topics} parentOptions={data.topicParents} /></div>{/if}
            <span>{item.systemName ?? 'Unassigned'}</span>
            <div class="tag-cell">{#if inactiveView}<span class="tag-list">{#if item.tags.length}{#each item.tags as tag}<span class="tag-chip">{tag.name}</span>{/each}{:else}<span class="muted">—</span>{/if}</span>{:else}<CaseTagInlineEditor caseId={item.id} caseTitle={item.title} tags={item.tags} availableTags={data.tags} selectedCaseIds={selectedCaseIds} cases={data.cases} />{/if}</div>
            <a class="open-link" href={caseHref(item)}>{inactiveView ? 'Recover' : 'Open'} →</a>
          </div>
        {/each}
      </div>
    {/if}
  </form>

  <nav class="pagination" aria-label="Case Library pages">
    {#if data.pagination.page > 1}<a class="button" href={pageHref(data.pagination.page - 1)}>Previous</a>{:else}<span></span>{/if}
    <span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
    {#if data.pagination.page < data.pagination.totalPages}<a class="button" href={pageHref(data.pagination.page + 1)}>Next</a>{/if}
  </nav>
</section>

<style>
  .page-heading, .panel-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  .panel-heading > div { display: grid; gap: 0.3rem; }
  h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0; font-size: 1.15rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .button.warning { border-color: #f79009; color: #b54708; background: #fff; } .button.danger { border-color: #d92d20; color: #b42318; background: #fff; }
  .lifecycle-tabs { display: inline-flex; gap: 0.25rem; margin-top: 1.25rem; padding: 0.25rem; border: 1px solid #dfe5ee; border-radius: 9px; background: #f8fafc; } .lifecycle-tabs a { padding: 0.48rem 0.78rem; border-radius: 7px; color: #475467; font-weight: 700; text-decoration: none; } .lifecycle-tabs a.current { background: #fff; color: #172033; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08); }
  .search-form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) auto; gap: 0.75rem; align-items: end; margin: 1rem 0; } label { display: grid; gap: 0.4rem; color: #344054; font-weight: 650; } input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: 0.7rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } .search-actions { display: flex; gap: 0.5rem; }
  .panel { padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .bulk-toolbar { position: sticky; top: 0.75rem; z-index: 12; display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; max-width: 100%; min-width: 0; box-sizing: border-box; margin-top: 1rem; padding: 0.85rem; border: 1px solid #dfe5ee; border-radius: 8px; background: #fff; box-shadow: 0 6px 18px rgb(16 24 40 / 10%); } .bulk-toolbar > div { display: grid; gap: 0.2rem; margin-right: auto; } .selection-hint { color: #667085; font-size: 0.82rem; } .bulk-topic, .bulk-system { display: flex; align-items: center; gap: 0.55rem; min-width: 360px; } .bulk-topic select, .bulk-system select { flex: 1; min-width: 0; } button:disabled, select:disabled { cursor: not-allowed; opacity: 0.55; } .form-error, .success-message, .selection-warning { margin: 1rem 0 0; padding: 0.75rem; border-radius: 8px; } .form-error { background: #fef3f2; color: #b42318; } .success-message { background: #ecfdf3; color: #027a48; } .selection-warning { background: #fffaeb; color: #93370d; }
  .case-table { display: grid; margin-top: 1rem; } .table-header, .table-row { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(110px, 0.8fr) minmax(110px, 0.8fr) minmax(160px, 1fr) 80px; gap: 1rem; align-items: center; padding: 0.8rem 0.5rem; } .table-header { color: #667085; border-bottom: 1px solid #dfe5ee; font-size: 0.76rem; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; } .sort-header { color: inherit; text-decoration: none; } .sort-header span { margin-left: 0.2rem; font-size: 0.9rem; } .table-row { scroll-margin-top: 9rem; border-bottom: 1px solid #eaecf0; color: #172033; } .table-row.inactive-row { background: #fcfcfd; } .table-row.selected-row { background: #f5f8ff; } .table-row:last-child { border-bottom: 0; } .table-row > span { color: #667085; } .case-heading, .case-cell { display: flex; align-items: center; gap: 0.55rem; min-width: 0; } .case-cell a { min-width: 0; color: #172033; text-decoration: none; } .case-cell a strong { overflow-wrap: anywhere; } .case-heading input, .case-select { width: 1rem; height: 1rem; flex: 0 0 auto; } .open-link { color: #344054 !important; font-size: 0.9rem; font-weight: 650; text-align: right; text-decoration: none; }
  .classification-cell { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem; min-width: 0; color: #667085; }
  .status-badge { flex: 0 0 auto; padding: 0.16rem 0.42rem; border-radius: 999px; background: #fef3f2; color: #b42318 !important; font-size: 0.72rem; font-weight: 750; } .tag-list { display: flex; flex-wrap: wrap; gap: 0.3rem; } .tag-chip { display: inline-block; padding: 0.18rem 0.4rem; border-radius: 999px; background: #ecfdf3; color: #027a48; font-size: 0.76rem; font-weight: 650; }
  .tag-cell { min-width: 0; }
  .empty-state { margin-top: 1rem; padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; }
  .pagination { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 0.75rem; margin-top: 1rem; } .pagination > :last-child { justify-self: end; }
  @media (max-width: 1100px) { .search-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .search-actions { grid-column: 1 / -1; } }
  @media (max-width: 600px) { .page-heading, .panel-heading { align-items: start; flex-direction: column; } .search-form { grid-template-columns: minmax(0, 1fr); } .search-actions { grid-column: auto; } .bulk-toolbar { top: 0.5rem; gap: 0.55rem; padding: 0.7rem; } .bulk-toolbar > div { width: 100%; margin-right: 0; } .selection-hint { display: none; } .bulk-topic, .bulk-system { min-width: 100%; } .table-header { display: none; } .table-row { grid-template-columns: minmax(0, 1fr) auto; gap: 0.35rem 0.75rem; } .case-cell, .classification-cell, .tag-list, .tag-cell { grid-column: 1 / -1; } .classification-cell { align-items: stretch; flex-direction: column; } .open-link { text-align: left; } .pagination { grid-template-columns: 1fr 1fr; } .pagination > span { grid-column: 1 / -1; grid-row: 1; text-align: center; } .pagination > a:first-of-type { grid-column: 1; } .pagination > a:last-of-type { grid-column: 2; } }
</style>