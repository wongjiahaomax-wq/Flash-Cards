<script>
  /** @typedef {{ id: string, imageUrl: string | null, altText: string | null, originalFilename: string | null, topicSummary: string, topicNames: string[], currentTopicNames: string[], historicalTopicNames: string[], currentTopicSummary: string, historicalTopicSummary: string, collectionName: string | null, createdAt: string | number | Date | null, usageCount: number, usageState: 'current' | 'historical' | 'unused', activeReviewCount: number, isActive: boolean }} LibraryAsset */
  /** @typedef {{ id: string, name: string, assetCount?: number }} NamedOption */
  /** @typedef {{ assets: LibraryAsset[], topics: NamedOption[], collections: NamedOption[], stimulusGroups: { id: string, name: string, caseTitle?: string }[], filters: { search: string, topic: string, collection: string, usage: string, status: string, source: string, sort: string }, pagination: { totalCount: number, totalPages: number, page: number, pageSize: number }, queryContext: string, allMatchingIds: string[] | null, selectAllLimit: number, bulkLimit: number, collectionBulkLimit?: number }} LibraryData */
  import { browser } from '$app/environment';
  import { deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { applyAssetSelection, clearAssetSelection, reconcileLibrarySelection, runSequentialAssetChunks } from '$lib/admin-image-selection.js';
  import AdminImageViewer from '$lib/components/AdminImageViewer.svelte';

  /** @type {{ data: LibraryData, form?: Record<string, any> | null, previewMode?: boolean }} */
  let { data, form, previewMode = false } = $props();
  let selectedIds = $state(/** @type {Set<string>} */ (new Set()));
  let anchorId = $state(/** @type {string | null} */ (null));
  let selectMode = $state(false);
  let viewerImage = $state(/** @type {{ src: string, alt: string, title: string, subtitle: string } | null} */ (null));
  let selectionContext = $state(/** @type {string | null} */ (null));
  let selectionHydrated = $state(false);
  let bulkGroupId = $state('');
  let bulkRunning = $state(false);
  let bulkProcessed = $state(0);
  let bulkTotal = $state(0);
  let bulkError = $state('');
  let bulkMessage = $state('');
  let bulkCollectionId = $state('');
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

  /** @param {string | number | Date | null} value */
  function formatAddedDate(value) {
    if (!value) return 'Unknown date';
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
  }

  /** @param {string} assetId @param {{ shiftKey?: boolean, toggleKey?: boolean }} [options] */
  function updateSelection(assetId, options = {}) {
    const result = applyAssetSelection({ selectedIds, orderedIds, assetId, anchorId, shiftKey: options.shiftKey ?? false, toggleKey: options.toggleKey ?? false });
    selectedIds = result.selectedIds;
    anchorId = result.anchorId;
    bulkError = '';
    bulkMessage = '';
  }

  /** @param {MouseEvent} event @param {string} assetId */
  function handleCardClick(event, assetId) {
    const modifier = event.ctrlKey || event.metaKey;
    if (!selectMode && !event.shiftKey && !modifier) return;
    event.preventDefault();
    updateSelection(assetId, { shiftKey: event.shiftKey, toggleKey: modifier || selectMode });
  }

  /** @param {MouseEvent} event @param {string} assetId */
  function handleCheckboxClick(event, assetId) {
    updateSelection(assetId, { shiftKey: event.shiftKey, toggleKey: !event.shiftKey });
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

  /** @param {LibraryAsset} asset */
  function enlarge(asset) {
    if (!asset.imageUrl) return;
    viewerImage = { src: asset.imageUrl, alt: asset.altText ?? '', title: asset.originalFilename ?? 'Teaching image', subtitle: asset.topicSummary ?? '' };
  }

  /** @param {number} page */
  function pageHref(page) {
    const params = new URLSearchParams();
    if (data.filters.search) params.set('q', data.filters.search);
    if (data.filters.topic) params.set('topic', data.filters.topic);
    if (data.filters.collection) params.set('collection', data.filters.collection);
    if (data.filters.usage !== 'all') params.set('usage', data.filters.usage);
    if (data.filters.status !== 'all') params.set('status', data.filters.status);
    if (data.filters.source !== 'all') params.set('source', data.filters.source);
    if (data.filters.sort !== 'newest') params.set('sort', data.filters.sort);
    if (page > 1) params.set('page', String(page));
    const query = params.toString();
    return query ? `${libraryPath}?${query}` : libraryPath;
  }

  /** @param {string[]} chunk */
  async function submitChunk(chunk) {
    const body = new FormData();
    body.set('group_id', bulkGroupId);
    for (const id of chunk) body.append('asset_id', id);
    const response = await fetch(`${libraryPath}?/bulkAddToStimulusGroup`, { method: 'POST', body });
    const result = deserialize(await response.text());
    if (result.type === 'failure') throw new Error(String(result.data?.error ?? 'The next batch failed.'));
    if (result.type === 'error') throw new Error(String(result.error?.message ?? 'The next batch failed.'));
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

  function collectionTargetValue() {
    return bulkCollectionId === '__unsorted__' ? '' : bulkCollectionId;
  }

  /** @param {SubmitEvent} event @param {NamedOption} collection */
  function confirmDelete(event, collection) {
    const count = Number(collection.assetCount ?? 0);
    const message = `Delete “${collection.name}”?\n\nThis Collection contains ${count} image${count === 1 ? '' : 's'}. The images will not be deleted. They will be moved to Unsorted.`;
    if (!window.confirm(message)) event.preventDefault();
  }

  /** @param {string[]} chunk */
  async function submitCollectionChunk(chunk) {
    const body = new FormData();
    body.set('collection_id', collectionTargetValue());
    for (const id of chunk) body.append('asset_id', id);
    const response = await fetch(`${libraryPath}?/setCollection`, { method: 'POST', body });
    const result = deserialize(await response.text());
    if (result.type === 'failure') throw new Error(String(result.data?.error ?? 'The next Collection batch failed.'));
    if (result.type === 'error') throw new Error(String(result.error?.message ?? 'The next Collection batch failed.'));
  }

  async function runBulkCollection() {
    if (previewMode || bulkCollectionId === '' || selectedIds.size === 0 || bulkRunning) return;
    bulkRunning = true;
    bulkProcessed = 0;
    bulkTotal = selectedIds.size;
    bulkError = '';
    bulkMessage = '';
    const originalIds = [...selectedIds];
    const result = await runSequentialAssetChunks(originalIds, data.collectionBulkLimit ?? data.bulkLimit, async (chunk, state) => {
      await submitCollectionChunk(chunk);
      bulkProcessed = state.processed + chunk.length;
    });
    if (result.ok) {
      resetSelection();
      bulkMessage = `${result.processed} image${result.processed === 1 ? '' : 's'} updated successfully.`;
    } else {
      selectedIds = new Set(result.remainingIds);
      anchorId = null;
      bulkError = `${result.processed} of ${result.total} images were processed. ${result.remainingIds.length} image${result.remainingIds.length === 1 ? '' : 's'} remain selected. ${result.error instanceof Error ? result.error.message : 'The next Collection batch failed.'}`;
    }
    if (result.processed > 0) await invalidateAll();
    bulkRunning = false;
  }
</script>

<svelte:head><title>{previewMode ? 'Preview Images' : 'Images'} | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div><p class="eyebrow">{previewMode ? 'Read-only production Asset library' : 'Content library'}</p><h1>{previewMode ? 'Preview Images' : 'Images'}</h1><p class="muted">{previewMode ? 'Production Assets are shared read-only resources. You can preview Collection choices, but Collection assignments can only be changed from production Admin after this PR is merged.' : 'Find reusable teaching images, inspect their usage, and maintain Asset metadata.'}</p></div>
  <div class="heading-actions"><button class:active={selectMode} class="button" type="button" onclick={() => (selectMode = !selectMode)}>{selectMode ? 'Done selecting' : 'Select images'}</button>{#if !previewMode}<a class="button primary" href="/admin/images/new">Upload image</a>{/if}</div>
</section>

{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}
{#if form?.bulkSuccess}<p class="form-success" role="status">{form.bulkMessage}</p>{/if}
{#if form?.collectionCreated}<p class="form-success" role="status">{form.collectionMessage}</p>{/if}
{#if form?.collectionRenamed}<p class="form-success" role="status">{form.collectionMessage}</p>{/if}
{#if form?.collectionDeleted}<p class="form-success" role="status">{form.collectionMessage}</p>{/if}
{#if form?.collectionSuccess}<p class="form-success" role="status">{form.collectionMessage}</p>{/if}
{#if bulkError}<p class="form-error" role="alert">{bulkError}</p>{/if}
{#if bulkMessage}<p class="form-success" role="status">{bulkMessage}</p>{/if}

<form class="filter-panel" method="GET" action={libraryPath}>
  <label class="search-field" for="image-search">Search name, alt text, or source label<input id="image-search" name="q" value={data.filters.search} placeholder="e.g. anterior STEMI" /></label>
  <label>Used in Topic<select name="topic"><option value="" selected={!data.filters.topic}>All Case Topics</option>{#each data.topics as topic}<option value={topic.id} selected={data.filters.topic === topic.id}>{topic.name}</option>{/each}</select></label>
  <label>Collection<select name="collection"><option value="" selected={!data.filters.collection}>All collections</option><option value="unsorted" selected={data.filters.collection === 'unsorted'}>Unsorted</option>{#each data.collections as collection}<option value={collection.id} selected={data.filters.collection === collection.id}>{collection.name}</option>{/each}</select></label>
  <label>Usage<select name="usage"><option value="all" selected={data.filters.usage === 'all'}>All</option><option value="current" selected={data.filters.usage === 'current'}>In current use</option><option value="historical" selected={data.filters.usage === 'historical'}>Retained only</option><option value="unused" selected={data.filters.usage === 'unused'}>Unused</option></select></label>
  <label>Status<select name="status"><option value="all" selected={data.filters.status === 'all'}>All statuses</option><option value="active" selected={data.filters.status === 'active'}>Active</option><option value="inactive" selected={data.filters.status === 'inactive'}>Inactive</option></select></label>
  <label>Source<select name="source"><option value="all" selected={data.filters.source === 'all'}>All sources</option><option value="known" selected={data.filters.source === 'known'}>Source known</option><option value="unknown" selected={data.filters.source === 'unknown'}>Source unknown</option></select></label>
  <label>Sort by<select name="sort"><option value="newest" selected={data.filters.sort === 'newest'}>Newest added</option><option value="oldest" selected={data.filters.sort === 'oldest'}>Oldest added</option><option value="name-asc" selected={data.filters.sort === 'name-asc'}>Name A–Z</option><option value="name-desc" selected={data.filters.sort === 'name-desc'}>Name Z–A</option><option value="most-used" selected={data.filters.sort === 'most-used'}>Most used</option><option value="least-used" selected={data.filters.sort === 'least-used'}>Least used</option><option value="collection-asc" selected={data.filters.sort === 'collection-asc'}>Collection A–Z</option><option value="collection-desc" selected={data.filters.sort === 'collection-desc'}>Collection Z–A</option><option value="unsorted-first" selected={data.filters.sort === 'unsorted-first'}>Unsorted first</option></select></label>
  <div class="filter-actions"><button class="button" type="submit">Apply filters</button>{#if data.filters.search || data.filters.topic || data.filters.collection || data.filters.usage !== 'all' || data.filters.status !== 'all' || data.filters.source !== 'all' || data.filters.sort !== 'newest'}<a class="button" href={libraryPath}>Clear</a>{/if}</div>
</form>

<nav class="cleanup-shortcuts" aria-label="Image cleanup views"><strong>Cleanup:</strong><a href={`${libraryPath}?usage=historical&sort=oldest`}>Retained only</a><a href={`${libraryPath}?usage=unused&sort=oldest`}>Unused</a><span class="muted">Review retained images or start with the oldest cleanup candidates.</span></nav>

{#if previewMode}<section class="preview-collection-note panel"><strong>Collection assignments are read-only in Preview.</strong><span class="muted"> Select images below to preview the bulk Collection workflow and available Collection targets. The actual assignment is intentionally available only on production <code>/admin/images</code>.</span></section>{/if}

{#if !previewMode}<section class="collection-create panel"><div><strong>Collections</strong><span class="muted"> Create a named Image Library bucket. Assets can belong to one Collection or Unsorted.</span></div><form method="POST" action="?/createCollection"><label class="sr-only" for="new-collection-name">Collection name</label><input id="new-collection-name" name="collection_name" maxlength="200" placeholder="e.g. ECG" required /><button class="button" type="submit">Create Collection</button></form></section>{/if}

{#if !previewMode && data.collections.length > 0}<section class="collection-management panel" aria-labelledby="collection-management-heading"><div class="panel-heading"><div><p class="eyebrow">Image Library organisation</p><h2 id="collection-management-heading">Manage Collections</h2></div><span class="muted">Renaming preserves assignments. Deleting moves images to Unsorted.</span></div><div class="collection-list">{#each data.collections as collection}<div class="collection-row"><div><strong>{collection.name}</strong><span class="muted">{collection.assetCount ?? 0} image{(collection.assetCount ?? 0) === 1 ? '' : 's'}</span></div><form method="POST" action="?/renameCollection" class="collection-rename-form"><input type="hidden" name="collection_id" value={collection.id} /><label class="sr-only" for={`rename-${collection.id}`}>Rename {collection.name}</label><input id={`rename-${collection.id}`} name="collection_name" value={collection.name} maxlength="200" required /><button class="button small" type="submit">Rename</button></form><form method="POST" action="?/deleteCollection" onsubmit={(event) => confirmDelete(event, collection)}><input type="hidden" name="collection_id" value={collection.id} /><button class="button small danger" type="submit">Delete</button></form></div>{/each}</div></section>{/if}

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
          <label class="selection-box" aria-label={`Select ${asset.originalFilename ?? 'image'}`}><input type="checkbox" checked={selectedIds.has(asset.id)} onclick={(event) => handleCheckboxClick(event, asset.id)} /></label>
          <a class="asset-card" href={previewMode ? libraryPath : `/admin/images/${asset.id}`} onclick={(event) => handleCardClick(event, asset.id)} aria-label={`${asset.originalFilename ?? 'Unnamed image'}; ${selectedIds.has(asset.id) ? 'selected' : 'not selected'}`}>
            {#if asset.imageUrl}<img src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" />{:else}<div class="inactive-thumb">Inactive image</div>{/if}
            <div class="asset-card-body"><strong>{asset.originalFilename ?? 'Unnamed image'}</strong><span class="collection-context">Collection: {asset.collectionName ?? 'Unsorted'}</span>{#if asset.currentTopicSummary}<span class="topic-context" title={asset.currentTopicNames.join(', ')}>Current Topics: {asset.currentTopicSummary}</span>{/if}{#if asset.historicalTopicSummary}<span class="topic-context topic-context-historical" title={asset.historicalTopicNames.join(', ')}>Historical Topics: {asset.historicalTopicSummary}</span>{/if}<span class="muted">Added {formatAddedDate(asset.createdAt)}</span><span class:usage-current={asset.usageState === 'current'} class:usage-historical={asset.usageState === 'historical'} class:usage-unused={asset.usageState === 'unused'} class="usage-badge">{#if asset.usageState === 'current'}Current · {asset.usageCount} {asset.usageCount === 1 ? 'Case' : 'Cases'}{:else if asset.usageState === 'historical'}Retained only{#if asset.activeReviewCount > 0} · {asset.activeReviewCount} active {asset.activeReviewCount === 1 ? 'Review' : 'Reviews'}{/if}{:else}Unused{/if}</span><span class:badge-active={asset.isActive} class:badge-inactive={!asset.isActive} class="status-badge">{asset.isActive ? 'Active' : 'Inactive'}</span></div>
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
    <label>{previewMode ? 'Collection (read-only in Preview)' : 'Collection'}<select bind:value={bulkCollectionId} required disabled={bulkRunning}><option value="">Choose Collection action</option><option value="__unsorted__">Unsorted (remove Collection)</option>{#each data.collections as collection}<option value={collection.id}>{collection.name}</option>{/each}</select></label>
    <button class="button primary" type="button" onclick={runBulkCollection} disabled={previewMode || !bulkCollectionId || bulkRunning}>{previewMode ? 'Production only' : bulkRunning ? 'Updating…' : 'Set Collection'}</button>
    <button class="button" type="button" onclick={resetSelection} disabled={bulkRunning}>Clear</button>
    {#if bulkRunning}<progress max={bulkTotal} value={bulkProcessed}></progress><span class="bulk-note">Adding images… {bulkProcessed} / {bulkTotal} processed</span>{/if}
    {#if previewMode}<span class="bulk-note">Preview cannot change production Asset Collection metadata. After this PR is merged, use the same selected-images workflow on production Admin to assign or remove Collections.</span>{/if}
    {#if data.stimulusGroups.length === 0}<span class="bulk-note">Create an active alternative set from a Case editor first.</span>{/if}
  </div>
{/if}

<AdminImageViewer image={viewerImage} onclose={() => (viewerImage = null)} />

<style>
  .page-heading, .panel-heading { display:flex; justify-content:space-between; align-items:end; gap:1rem; } .heading-actions,.filter-actions{display:flex;gap:.5rem;flex-wrap:wrap} h1,h2,p{margin-top:0} h1{margin-bottom:.3rem;font-size:clamp(1.8rem,4vw,2.5rem)} h2{margin-bottom:0;font-size:1.15rem}.eyebrow{margin-bottom:.3rem;color:#667085;font-size:.74rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.muted{color:#667085}
  .button{display:inline-block;padding:.7rem 1rem;border:1px solid #cdd6e3;border-radius:8px;background:#fff;color:#172033;text-decoration:none;cursor:pointer;font:inherit}.button.primary{border-color:#172033;background:#172033;color:#fff}.button.small{padding:.5rem .65rem;font-size:.82rem}.button.active{border-color:#172033;box-shadow:0 0 0 2px #dbe7ff}button:disabled,select:disabled{cursor:not-allowed;opacity:.5}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #84adff;outline-offset:2px}
  .form-error,.form-success{margin:1rem 0;padding:.75rem;border-radius:8px}.form-error{background:#fef3f2;color:#b42318}.form-success{background:#ecfdf3;color:#027a48}.filter-panel{display:grid;grid-template-columns:minmax(240px,2fr) repeat(5,minmax(105px,.75fr)) auto;gap:.75rem;align-items:end;margin:1.5rem 0 1rem;padding:1rem;border:1px solid #dfe5ee;border-radius:10px;background:#fff}label{display:grid;gap:.35rem;color:#344054;font-weight:650}input,select{width:100%;box-sizing:border-box;padding:.68rem .72rem;border:1px solid #cdd6e3;border-radius:8px;background:#fff;font:inherit}.panel{padding:1.1rem;border:1px solid #dfe5ee;border-radius:10px;background:#fff}.count{color:#667085;font-size:.85rem;font-weight:500}
  .cleanup-shortcuts{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin:0 0 1rem}.cleanup-shortcuts a{color:#344054;font-weight:700}.usage-badge{align-self:start;padding:.25rem .5rem;border-radius:999px;font-size:.78rem;font-weight:750}.usage-current{background:#ecfdf3;color:#027a48}.usage-historical{background:#fff7e6;color:#9a6700}.usage-unused{background:#f2f4f7;color:#475467}
  .preview-collection-note,.collection-create,.collection-management{margin:1rem 0}.preview-collection-note{display:flex;align-items:baseline;gap:.4rem;flex-wrap:wrap}.collection-create{display:flex;justify-content:space-between;align-items:center;gap:1rem}.collection-create form{display:flex;gap:.5rem;align-items:end}.collection-create input{min-width:180px}.collection-list{display:grid;gap:.5rem;margin-top:1rem}.collection-row{display:grid;grid-template-columns:minmax(160px,1fr) minmax(260px,1.4fr) auto;align-items:center;gap:.75rem;padding:.65rem 0;border-top:1px solid #eaecf0}.collection-row>div{display:grid;gap:.2rem}.collection-rename-form{display:flex;gap:.5rem}.button.danger{border-color:#fecdca;color:#b42318}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.selection-summary{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin-top:1rem;padding:.75rem;border-radius:8px;background:#f8fafc}.asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:1rem;margin-top:1rem}.asset-card-wrap{position:relative;display:grid;overflow:hidden;border:2px solid transparent;border-radius:12px}.asset-card-wrap.selected{border-color:#344054}.selection-box{position:absolute;z-index:2;top:.55rem;left:.55rem;padding:.35rem;border-radius:7px;background:rgb(255 255 255 / 92%);cursor:pointer}.selection-box input{width:1.1rem;height:1.1rem;margin:0;accent-color:#172033}.asset-card{display:grid;overflow:hidden;border:1px solid #dfe5ee;border-radius:10px 10px 0 0;background:#fff;color:#172033;text-decoration:none}.asset-card img,.inactive-thumb{width:100%;height:150px;object-fit:contain;background:#eef2f6}.inactive-thumb{display:grid;place-items:center;color:#667085;font-size:.85rem}.asset-card-body{display:grid;gap:.3rem;padding:.8rem;overflow-wrap:anywhere}.collection-context{color:#175cd3;font-size:.82rem;font-weight:700}.topic-context{color:#344054;font-size:.82rem;font-weight:650}.topic-context-historical{color:#667085;font-weight:600}.status-badge{width:max-content;padding:.18rem .45rem;border-radius:999px;font-size:.72rem;font-weight:700}.badge-active{background:#ecfdf3;color:#027a48}.badge-inactive{background:#f2f4f7;color:#667085}.enlarge-button{padding:.5rem;border:1px solid #dfe5ee;border-top:0;border-radius:0 0 10px 10px;background:#f8fafc;color:#344054;font:inherit;font-size:.82rem;font-weight:650;cursor:zoom-in}.empty-state{margin-top:1rem;padding:1rem;border:1px dashed #d0d5dd;border-radius:8px}
  .pagination{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:1rem;margin-top:1rem}.pagination>a:last-child{justify-self:end}.bulk-bar{position:sticky;z-index:10;bottom:.75rem;display:grid;grid-template-columns:minmax(190px,auto) minmax(0,1fr) auto minmax(0,1fr) auto auto;align-items:end;gap:.75rem;width:100%;box-sizing:border-box;margin:1rem auto 0;padding:.85rem;border:1px solid #98a2b3;border-radius:10px;background:#fff;box-shadow:0 10px 35px rgb(16 24 40 / 18%)}.bulk-bar>div{display:grid;gap:.15rem;min-width:0}.bulk-bar>div span,.bulk-note{color:#667085;font-size:.78rem}.bulk-note,progress{grid-column:1/-1}progress{width:100%}
  @media(max-width:1200px){.filter-panel{grid-template-columns:repeat(3,minmax(0,1fr))}.search-field{grid-column:1/-1}.bulk-bar{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}}@media(max-width:700px){.page-heading,.panel-heading{align-items:start;flex-direction:column}.filter-panel{grid-template-columns:repeat(2,minmax(0,1fr))}.search-field,.filter-actions{grid-column:1/-1}.collection-create{align-items:stretch;flex-direction:column}.collection-create form,.collection-rename-form{align-items:stretch;flex-direction:column}.collection-create input{min-width:0}.collection-row{grid-template-columns:1fr}.asset-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.bulk-bar{grid-template-columns:minmax(0,1fr)}.pagination{grid-template-columns:auto 1fr auto;font-size:.85rem}}@media(max-width:430px){.asset-grid{grid-template-columns:1fr}}
</style>
