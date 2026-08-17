<script>
  // @ts-nocheck
  import { applyAssetSelection, clearAssetSelection, pruneAssetSelection } from '$lib/admin-image-selection.js';
  import AdminImageViewer from '$lib/components/AdminImageViewer.svelte';

  let { data, form, previewMode = false } = $props();
  let selectedIds = $state(new Set());
  let anchorId = $state(null);
  let selectMode = $state(false);
  let viewerImage = $state(null);
  let orderedIds = $derived(data.assets.map((asset) => asset.id));
  let libraryPath = $derived(previewMode ? '/preview-admin/images' : '/admin/images');

  $effect(() => {
    const pruned = pruneAssetSelection({ selectedIds, orderedIds, anchorId });
    const selectionChanged = pruned.selectedIds.size !== selectedIds.size || [...selectedIds].some((id) => !pruned.selectedIds.has(id));
    if (selectionChanged) selectedIds = pruned.selectedIds;
    if (anchorId !== pruned.anchorId) anchorId = pruned.anchorId;
  });

  function formatAddedDate(value) {
    if (!value) return 'Unknown date';
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
  }

  function updateSelection(assetId, options = {}) {
    const result = applyAssetSelection({ selectedIds, orderedIds, assetId, anchorId, shiftKey: options.shiftKey ?? false, toggleKey: options.toggleKey ?? false });
    selectedIds = result.selectedIds;
    anchorId = result.anchorId;
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
  }

  function enlarge(asset) {
    if (!asset.imageUrl) return;
    viewerImage = { src: asset.imageUrl, alt: asset.altText ?? '', title: asset.originalFilename ?? 'Teaching image', subtitle: asset.topicSummary ?? '' };
  }
</script>

<svelte:head><title>{previewMode ? 'Preview Images' : 'Images'} | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div><p class="eyebrow">{previewMode ? 'Read-only production Asset library' : 'Content library'}</p><h1>{previewMode ? 'Preview Images' : 'Images'}</h1><p class="muted">{previewMode ? 'Production Assets are shared read-only resources. Only Preview-owned alternative-set relationships can change.' : 'Find reusable teaching images, inspect their usage, and maintain Asset metadata.'}</p></div>
  <div class="heading-actions"><button class:active={selectMode} class="button" type="button" onclick={() => (selectMode = !selectMode)}>{selectMode ? 'Done selecting' : 'Select images'}</button>{#if !previewMode}<a class="button primary" href="/admin/images/new">Upload image</a>{/if}</div>
</section>

{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}
{#if form?.bulkSuccess}<p class="form-success" role="status">{form.bulkMessage}</p>{/if}

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
  <div class="panel-heading"><div><h2 id="image-list-heading">Assets <span class="count">{data.assets.length}</span></h2><span class="muted">Click normally to {previewMode ? 'inspect' : 'edit'}. Ctrl/Cmd-click toggles; Shift-click selects a displayed range.</span></div>{#if selectedIds.size > 0}<button class="button small" type="button" onclick={resetSelection}>Clear selection</button>{/if}</div>
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
</section>

{#if selectedIds.size > 0}
  <form class="bulk-bar" method="POST" action="?/bulkAddToStimulusGroup" aria-label="Bulk image actions">
    {#each [...selectedIds] as assetId}<input type="hidden" name="asset_id" value={assetId} />{/each}
    <div><strong>{selectedIds.size} image{selectedIds.size === 1 ? '' : 's'} selected</strong><span>Maximum {data.bulkLimit} per bulk update.</span></div>
    <label>Preview alternative set<select name="group_id" required disabled={data.stimulusGroups.length === 0}><option value="">Choose Preview Case — set</option>{#each data.stimulusGroups as group}<option value={group.id}>{group.caseTitle} — {group.name}</option>{/each}</select></label>
    <button class="button primary" type="submit" disabled={selectedIds.size > data.bulkLimit || data.stimulusGroups.length === 0}>Add to set</button>
    <button class="button" type="button" onclick={resetSelection}>Clear</button>
    {#if data.stimulusGroups.length === 0}<span class="bulk-note">Create an active alternative set from a Preview Case editor first.</span>{/if}
  </form>
{/if}

<AdminImageViewer image={viewerImage} onclose={() => (viewerImage = null)} />

<style>
  .page-heading, .panel-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; } .heading-actions, .filter-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; } h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0; font-size: 1.15rem; } .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; font: inherit; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .button.small { padding: 0.5rem 0.65rem; font-size: 0.82rem; } .button.active { border-color: #172033; box-shadow: 0 0 0 2px #dbe7ff; } button:disabled, select:disabled { cursor: not-allowed; opacity: 0.5; } button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  .form-error, .form-success { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; } .form-error { background: #fef3f2; color: #b42318; } .form-success { background: #ecfdf3; color: #027a48; }
  .filter-panel { display: grid; grid-template-columns: minmax(220px, 1.8fr) repeat(5, minmax(110px, 0.7fr)) auto; gap: 0.75rem; align-items: end; margin: 1.5rem 0 1rem; padding: 1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input, select { width: 100%; box-sizing: border-box; padding: 0.68rem 0.72rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } .panel { padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 1rem; margin-top: 1rem; } .asset-card-wrap { position: relative; display: grid; overflow: hidden; border: 2px solid transparent; border-radius: 12px; } .asset-card-wrap.selected { border-style: solid; border-color: #344054; } .selection-box { position: absolute; z-index: 2; top: 0.55rem; left: 0.55rem; padding: 0.35rem; border-radius: 7px; background: rgb(255 255 255 / 92%); cursor: pointer; } .selection-box input { width: 1.1rem; height: 1.1rem; margin: 0; accent-color: #172033; } .asset-card { display: grid; overflow: hidden; border: 1px solid #dfe5ee; border-radius: 10px 10px 0 0; background: #fff; color: #172033; text-decoration: none; transition: border-color 120ms ease, box-shadow 120ms ease; } .asset-card:hover, .asset-card:focus-visible { border-color: #98a2b3; box-shadow: 0 4px 14px rgb(23 32 51 / 10%); } .asset-card img, .inactive-thumb { width: 100%; height: 150px; object-fit: contain; background: #eef2f6; } .inactive-thumb { display: grid; place-items: center; color: #667085; font-size: 0.85rem; } .asset-card-body { display: grid; gap: 0.3rem; padding: 0.8rem; overflow-wrap: anywhere; } .topic-context { color: #344054; font-size: 0.82rem; font-weight: 650; } .status-badge { width: max-content; padding: 0.18rem 0.45rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; } .badge-active { background: #ecfdf3; color: #027a48; } .badge-inactive { background: #f2f4f7; color: #667085; } .enlarge-button { padding: 0.5rem; border: 1px solid #dfe5ee; border-top: 0; border-radius: 0 0 10px 10px; background: #f8fafc; color: #344054; font: inherit; font-size: 0.82rem; font-weight: 650; cursor: zoom-in; } .empty-state { margin-top: 1rem; padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; }
  .bulk-bar { position: sticky; z-index: 10; bottom: 0.75rem; display: grid; grid-template-columns: minmax(170px, auto) minmax(240px, 1fr) auto auto; align-items: end; gap: 0.75rem; margin: 1rem auto 0; padding: 0.85rem; border: 1px solid #98a2b3; border-radius: 10px; background: #fff; box-shadow: 0 10px 35px rgb(16 24 40 / 18%); } .bulk-bar > div { display: grid; gap: 0.15rem; } .bulk-bar > div span, .bulk-note { color: #667085; font-size: 0.78rem; } .bulk-note { grid-column: 1 / -1; }
  @media (max-width: 1200px) { .filter-panel { grid-template-columns: repeat(3, minmax(0, 1fr)); } .search-field { grid-column: 1 / -1; } .bulk-bar { grid-template-columns: 1fr 1fr; } } @media (max-width: 700px) { .page-heading, .panel-heading { align-items: start; flex-direction: column; } .filter-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); } .search-field { grid-column: 1 / -1; } .bulk-bar { grid-template-columns: minmax(0, 1fr); bottom: 0.4rem; } } @media (max-width: 480px) { .filter-panel { grid-template-columns: minmax(0, 1fr); } .search-field { grid-column: auto; } }
</style>
