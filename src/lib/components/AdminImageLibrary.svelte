<script>
  // @ts-nocheck
  import { browser } from '$app/environment';
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { applyAssetSelection, clearAssetSelection, reconcileLibrarySelection, runSequentialAssetChunks } from '$lib/admin-image-selection.js';
  import AdminImageViewer from '$lib/components/AdminImageViewer.svelte';

  let { data, form, previewMode = false } = $props();
  let selectedIds = $state(new Set());
  let anchorId = $state(null);
  let selectMode = $state(false);
  let viewerImage = $state(null);
  let selectionContext = $state(null);
  let selectionHydrated = $state(false);
  let bulkGroupId = $state('');
  let bulkRunning = $state(false);
  let bulkProcessed = $state(0);
  let bulkTotal = $state(0);
  let bulkError = $state('');
  let bulkMessage = $state('');
  let orderedIds = $derived(data.assets.map((asset) => asset.id));
  let libraryPath = $derived(previewMode ? '/preview-admin/images' : '/admin/images');
  let firstShown = $derived(data.pagination.totalCount === 0 ? 0 : (data.pagination.page - 1) * data.pagination.pageSize + 1);
  let lastShown = $derived(Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalCount));

  $effect(() => {
    const nextContext = data.queryContext;
    const pageIds = orderedIds;
    if (!browser) return;
    if (selectionHydrated && selectionContext === nextContext) {
      if (anchorId && !pageIds.includes(anchorId)) anchorId = null;
      return;
    }
    const storageKey = previewMode ? 'preview-admin-image-selection-v2' : 'admin-image-selection-v2';
    let stored = null;
    try { stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'); } catch { stored = null; }
    const result = reconcileLibrarySelection({
      selectedIds: new Set(stored?.ids ?? []),
      anchorId: null,
      previousContextKey: stored?.context ?? null,
      nextContextKey: nextContext,
      orderedIds: pageIds
    });
    selectedIds = result.selectedIds;
    anchorId = result.anchorId;
    selectionContext = nextContext;
    selectionHydrated = true;
  });

  $effect(() => {
    if (!browser || !selectionHydrated) return;
    const storageKey = previewMode ? 'preview-admin-image-selection-v2' : 'admin-image-selection-v2';
    sessionStorage.setItem(storageKey, JSON.stringify({ context: selectionContext, ids: [...selectedIds] }));
  });

  function formatAddedDate(value) {
    if (!value) return 'Unknown date';
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
  }

  function updateSelection(assetId, options = {}) {
    const result = applyAssetSelection({ selectedIds, orderedIds, assetId, anchorId, shiftKey: options.shiftKey ?? false, toggleKey: options.toggleKey ?? false });
    selectedIds = result.selectedIds;
    anchorId = result.anchorId;
    bulkError = '';
    bulkMessage = '';
  }

  function handleCardClick(event, assetId) {
    const modifier = event.ctrlKey || event.metaKey;
    if (!selectMode && !event.shiftKey && !modifier) return;
    event.preventDefault();
    updateSelection(assetId, { shiftKey: event.shiftKey, toggleKey: modifier || selectMode });
  }

  function resetSelection() {
    const result = clearAssetSelection();
    selectedIds = result.selectedIds;
    anchorId = result.anchorId;
    bulkError = '';
    bulkMessage = '';
  }

  function selectAllMatching() {
    if (!Array.isArray(data.allMatchingIds)) return;
    selectedIds = new Set(data.allMatchingIds);
    anchorId = null;
    selectMode = true;
  }

  function enlarge(asset) {
    if (!asset.imageUrl) return;
    viewerImage = { src: asset.imageUrl, alt: asset.altText ?? '', title: asset.originalFilename ?? 'Teaching image', subtitle: asset.topicSummary ?? '' };
  }

  function pageHref(page) {
    const params = new URLSearchParams();
    if (data.filters.search) params.set('q', data.filters.search);
    if (data.filters.topic) params.set('topic', data.filters.topic);
    if (data.filters.usage !== 'all') params.set('usage', data.filters.usage);
    if (data.filters.status !== 'all') params.set('status', data.filters.status);
    if (data.filters.source !== 'all') params.set('source', data.filters.source);
    if (data.filters.sort !== 'newest') params.set('sort', data.filters.sort);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return query ? `${libraryPath}?${query}` : libraryPath;
  }

  async function submitChunk(chunk) {
    const body = new FormData();
    body.set('group_id', bulkGroupId);
    for (const id of chunk) body.append('asset_id', id);
    const response = await fetch(`${libraryPath}?/bulkAddToStimulusGroup`, { method: 'POST', body });
    const result = deserialize(await response.text());
    if (result.type === 'failure' || result.type === 'error') throw new Error(result.data?.error ?? result.error?.message ?? 'The next batch failed.');
  }

  async function runBulkAdd() {
    if (!bulkGroupId || selectedIds.size === 0 || bulkRunning) return;
    bulkRunning = true;
    bulkProcessed = 0;
    bulkTotal = selectedIds.size;
    bulkError = '';
    bulkMessage = '';
    const originalIds = [...selectedIds];
    const result = await runSequentialAssetChunks(originalIds, data.bulkLimit, async (chunk, state) => {
      await submitChunk(chunk);
      bulkProcessed = state.processed + chunk.length;
    });
    if (result.ok) {
      resetSelection();
      bulkMessage = `${result.processed} image${result.processed === 1 ? '' : 's'} processed successfully.`;
    } else {
      selectedIds = new Set(result.remainingIds);
      anchorId = null;
      bulkError = `${result.processed} of ${result.total} images were processed. ${result.remainingIds.length} image${result.remainingIds.length === 1 ? '' : 's'} remain selected. ${result.error instanceof Error ? result.error.message : 'The next batch failed.'}`;
    }
    if (result.processed > 0) await invalidateAll();
    bulkRunning = false;
  }
</script>

<svelte:head><title>{previewMode ? 'Preview Images' : 'Images'} | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div><p class="eyebrow">{previewMode ? 'Read-only production Asset library' : 'Content library'}</p><h1>{previewMode ? 'Preview Images' : 'Images'}</h1><p class="muted">{previewMode ? 'Production Assets are shared read-only resources. Only Preview-owned alternative-set relationships can change.' : 'Find reusable teaching images, inspect their usage, and maintain Asset metadata.'}</p></div>
  <div class="heading-actions"><button class:active={selectMode} class="button" type="button" onclick={() => (selectMode = !selectMode)}>{selectMode ? 'Done selecting' : 'Select images'}</button>{#if !previewMode}<a class="button primary" href="/admin/images/new">Upload image</a>{/if}</div>
</section>

{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}
{#if form?.bulkSuccess}<p class="form-success" role="status">{form.bulkMessage}</p>{/if}
{#if bulkError}<p class="form-error" role="alert">{bulkError}</p>{/if}
{#if bulkMessage}<p class="form-success" role="status">{bulkMessage}</p>{/if}

<form class="filter-panel" method="GET" action={libraryPath}>
  <label class="search-field" for="image-search">Search name, alt text, or source label<input id="image-search" name="q" value={data.filters.search} placeholder="e.g. anterior STEMI" /></label>
  <label>Topic<select name="topic"><option value="" selected={!data.filters.topic}>All topics</option>{#each data.topics as topic}<option value={topic.id} selected={data.filters.topic === topic.id}>{topic.name}</option>{/each}</select></label>
  <label>Usage<select name="usage"><option value="all" selected={data.filters.usage === 'all'}>All</option><option value="used" selected={data.filters.usage === 'used'}>Used</option><option value="unused" selected={data.filters.usage === 'unused'}>Unused</option></select></label>
  <label>Status<select name="status"><option value="all" selected={data.filters.status === 'all'}>All statuses</option><option value="active" selected={data.filters.status === 'active'}>Active</option><option value="inactive" selected={data.filters.status === 'inactive'}>Inactive</option></select></label>
  <label>Source<select name="source"><option value="all" selected={data.filters.source === 'all'}>All sources</option><option value="known" selected={data.filters.source === 'known'}>Source known</option><option value="unknown" selected={data.filters.source === 'unknown'}>Source unknown</option></select></label>
  <label>Sort by<select name="sort"><option value="newest" selected={data.filters.sort === 'newest'}>Newest added</option><option value="oldest" selected={data.filters.sort === 'oldest'}>Oldest added</option><option value="name-asc" selected={data.filters.sort === 'name-asc'}>Name A–Z</option><option value="name-desc" selected={data.filters.sort === 'name-desc'}>Name Z–A</option><option value="most-used" selected={data.filters.sort === 'most-used'}>Most used</option><option value="least-used" selected={data.filters.sort === 'least-used'}>Least used</option></select></label>
  <div class="filter-actions"><button class="button" type="submit">Apply filters</button>{#if data.filters.search || data.filters.topic || data.filters.usage !== 'all' || data.filters.status !== 'all' || data.filters.source !== 'all' || data.filters.sort !== 'newest'}<a class="button" href={libraryPath}>Clear</a>{/if}</div>
</form>

<section class="panel" aria-labelledby="image-list-heading">
  <div class="panel-heading"><div><h2 id="image-list-heading">Assets <span class="count">{data.pagination.totalCount}</span></h2><span class="muted">Showing {firstShown}–{lastShown} of {data.pagination.totalCount} images · Page {data.pagination.page} of {data.pagination.totalPages}. Shift ranges stay on the current page.</span></div>{#if selectedIds.size > 0}<button class="button small" type="button" onclick={resetSelection}>Clear selection</button>{/if}</div>

  {#if selectedIds.size > 0 || data.pagination.totalCount > data.assets.length}
    <div class="selection-summary">
      <span>{selectedIds.size} image{selectedIds.size === 1 ? '' : 's'} selected across this filter context.</span>
      {#if data.pagination.totalCount <= data.selectAllLimit}
        {#if selectedIds.size !== data.pagination.totalCount}<button class="button small" type="button" onclick={selectAllMatching}>Select all {data.pagination.totalCount} matching images</button>{/if}
      {:else}
        <span class="muted">Select all is limited to {data.selectAllLimit} images. Refine the search or filters; no partial selection will be labelled as all matching.</span>
      {/if}
    </div>
  {/if}

  {#if data.assets.length === 0}<p class="empty-state">No images match these filters.</p>{:else}
    <div class="asset-grid">
      {#each data.assets as asset}
        <div class:selected={selectedIds.has(asset.id)} class="asset-card-wrap">
          <label class="selection-box" aria-label={`Select ${asset.originalFilename ?? 'image'}`}><input type="checkbox" checked={selectedIds.has(asset.id)} onchange={() => updateSelection(asset.id, { toggleKey: true })} /></label>
          <a class="asset-card" href={previewMode ? libraryPath : `/admin/images/${asset.id}`} onclick={(event) => handleCardClick(event, asset.id)} aria-label={`${asset.originalFilename ?? 'Unnamed image'}; ${selectedIds.has(asset.id) ? 'selected' : 'not selected'}`}>
            {#if asset.imageUrl}<img src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" />{:else}<div class="inactive-thumb">Inactive image</div>{/if}
            <div class="asset-card-body"><strong>{asset.originalFilename ?? 'Unnamed image'}</strong>{#if asset.topicSummary}<span class="topic-context" title={asset.topicNames.join(', ')}>{asset.topicSummary}</span>{/if}<span class="muted">Added {formatAddedDate(asset.createdAt)}</span><span class="muted">{asset.usageCount} {asset.usageCount === 1 ? 'Case' : 'Cases'}</span><span class:badge-active={asset.isActive} class:badge-inactive={!asset.isActive} class="status-badge">{asset.isActive ? 'Active' : 'Inactive'}</span></div>
          </a>
          {#if asset.imageUrl}<button class="enlarge-button" type="button" onclick={() => enlarge(asset)}>Enlarge</button>{/if}
        </div>
      {/each}
    </div>
  {/if}

  <nav class="pagination" aria-label="Image Library pages">
    {#if data.pagination.page > 1}<a class="button" href={pageHref(data.pagination.page - 1)}>Previous</a>{:else}<span></span>{/if}
    <span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
    {#if data.pagination.page < data.pagination.totalPages}<a class="button" href={pageHref(data.pagination.page + 1)}>Next</a>{/if}
  </nav>
</section>

{#if selectedIds.size > 0}
  <div class="bulk-bar" aria-label="Bulk image actions">
    <div><strong>{selectedIds.size} image{selectedIds.size === 1 ? '' : 's'} selected</strong><span>Server writes remain limited to {data.bulkLimit} Assets per request; larger selections run sequentially.</span></div>
    <label>{previewMode ? 'Preview alternative set' : 'Alternative set'}<select bind:value={bulkGroupId} required disabled={data.stimulusGroups.length === 0 || bulkRunning}><option value="">Choose Case — set</option>{#each data.stimulusGroups as group}<option value={group.id}>{group.caseTitle} — {group.name}</option>{/each}</select></label>
    <button class="button primary" type="button" onclick={runBulkAdd} disabled={!bulkGroupId || data.stimulusGroups.length === 0 || bulkRunning}>{bulkRunning ? 'Adding images…' : 'Add to set'}</button>
    <button class="button" type="button" onclick={resetSelection} disabled={bulkRunning}>Clear</button>
    {#if bulkRunning}<progress max={bulkTotal} value={bulkProcessed}></progress><span class="bulk-note">Adding images… {bulkProcessed} / {bulkTotal} processed</span>{/if}
    {#if data.stimulusGroups.length === 0}<span class="bulk-note">Create an active alternative set from a Case editor first.</span>{/if}
  </div>
{/if}

<AdminImageViewer image={viewerImage} onclose={() => (viewerImage = null)} />

<style>
  .page-heading, .panel-heading { display:flex; justify-content:space-between; align-items:end; gap:1rem; } .heading-actions,.filter-actions{display:flex;gap:.5rem;flex-wrap:wrap} h1,h2,p{margin-top:0} h1{margin-bottom:.3rem;font-size:clamp(1.8rem,4vw,2.5rem)} h2{margin-bottom:0;font-size:1.15rem}.eyebrow{margin-bottom:.3rem;color:#667085;font-size:.74rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.muted{color:#667085}
  .button{display:inline-block;padding:.7rem 1rem;border:1px solid #cdd6e3;border-radius:8px;background:#fff;color:#172033;text-decoration:none;cursor:pointer;font:inherit}.button.primary{border-color:#172033;background:#172033;color:#fff}.button.small{padding:.5rem .65rem;font-size:.82rem}.button.active{border-color:#172033;box-shadow:0 0 0 2px #dbe7ff}button:disabled,select:disabled{cursor:not-allowed;opacity:.5}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #84adff;outline-offset:2px}
  .form-error,.form-success{margin:1rem 0;padding:.75rem;border-radius:8px}.form-error{background:#fef3f2;color:#b42318}.form-success{background:#ecfdf3;color:#027a48}.filter-panel{display:grid;grid-template-columns:minmax(220px,1.8fr) repeat(5,minmax(110px,.7fr)) auto;gap:.75rem;align-items:end;margin:1.5rem 0 1rem;padding:1rem;border:1px solid #dfe5ee;border-radius:10px;background:#fff}label{display:grid;gap:.35rem;color:#344054;font-weight:650}input,select{width:100%;box-sizing:border-box;padding:.68rem .72rem;border:1px solid #cdd6e3;border-radius:8px;background:#fff;font:inherit}.panel{padding:1.1rem;border:1px solid #dfe5ee;border-radius:10px;background:#fff}.count{color:#667085;font-size:.85rem;font-weight:500}
  .selection-summary{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin-top:1rem;padding:.75rem;border-radius:8px;background:#f8fafc}.asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:1rem;margin-top:1rem}.asset-card-wrap{position:relative;display:grid;overflow:hidden;border:2px solid transparent;border-radius:12px}.asset-card-wrap.selected{border-color:#344054}.selection-box{position:absolute;z-index:2;top:.55rem;left:.55rem;padding:.35rem;border-radius:7px;background:rgb(255 255 255 / 92%);cursor:pointer}.selection-box input{width:1.1rem;height:1.1rem;margin:0;accent-color:#172033}.asset-card{display:grid;overflow:hidden;border:1px solid #dfe5ee;border-radius:10px 10px 0 0;background:#fff;color:#172033;text-decoration:none}.asset-card img,.inactive-thumb{width:100%;height:150px;object-fit:contain;background:#eef2f6}.inactive-thumb{display:grid;place-items:center;color:#667085;font-size:.85rem}.asset-card-body{display:grid;gap:.3rem;padding:.8rem;overflow-wrap:anywhere}.topic-context{color:#344054;font-size:.82rem;font-weight:650}.status-badge{width:max-content;padding:.18rem .45rem;border-radius:999px;font-size:.72rem;font-weight:700}.badge-active{background:#ecfdf3;color:#027a48}.badge-inactive{background:#f2f4f7;color:#667085}.enlarge-button{padding:.5rem;border:1px solid #dfe5ee;border-top:0;border-radius:0 0 10px 10px;background:#f8fafc;color:#344054;font:inherit;font-size:.82rem;font-weight:650;cursor:zoom-in}.empty-state{margin-top:1rem;padding:1rem;border:1px dashed #d0d5dd;border-radius:8px}
  .pagination{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem;margin-top:1rem}.pagination>a:last-child{justify-self:end}.bulk-bar{position:sticky;z-index:10;bottom:.75rem;display:grid;grid-template-columns:minmax(190px,auto) minmax(240px,1fr) auto auto;align-items:end;gap:.75rem;margin:1rem auto 0;padding:.85rem;border:1px solid #98a2b3;border-radius:10px;background:#fff;box-shadow:0 10px 35px rgb(16 24 40 / 18%)}.bulk-bar>div{display:grid;gap:.15rem}.bulk-bar>div span,.bulk-note{color:#667085;font-size:.78rem}.bulk-note,progress{grid-column:1/-1}progress{width:100%}
  @media(max-width:1200px){.filter-panel{grid-template-columns:repeat(3,minmax(0,1fr))}.search-field{grid-column:1/-1}.bulk-bar{grid-template-columns:1fr 1fr}}@media(max-width:700px){.page-heading,.panel-heading{align-items:start;flex-direction:column}.filter-panel{grid-template-columns:repeat(2,minmax(0,1fr))}.search-field,.filter-actions{grid-column:1/-1}.asset-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bulk-bar{grid-template-columns:1fr}.pagination{grid-template-columns:auto 1fr auto;font-size:.85rem}}@media(max-width:430px){.asset-grid{grid-template-columns:1fr}}
</style>
