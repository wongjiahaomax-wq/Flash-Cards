<script>
  let { data } = $props();
</script>

<svelte:head><title>Images | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div><p class="eyebrow">Content library</p><h1>Images</h1><p class="muted">Find reusable teaching images, inspect their usage, and maintain Asset metadata.</p></div>
  <a class="button primary" href="/admin/images/new">Upload image</a>
</section>

<form class="filter-panel" method="GET">
  <label class="search-field" for="image-search">Search name, alt text, or source label<input id="image-search" name="q" value={data.filters.search} placeholder="e.g. anterior STEMI" /></label>
  <label>Usage<select name="usage"><option value="all" selected={data.filters.usage === 'all'}>All</option><option value="used" selected={data.filters.usage === 'used'}>Used</option><option value="unused" selected={data.filters.usage === 'unused'}>Unused</option></select></label>
  <label>Status<select name="status"><option value="all" selected={data.filters.status === 'all'}>All statuses</option><option value="active" selected={data.filters.status === 'active'}>Active</option><option value="inactive" selected={data.filters.status === 'inactive'}>Inactive</option></select></label>
  <label>Source<select name="source"><option value="all" selected={data.filters.source === 'all'}>All sources</option><option value="known" selected={data.filters.source === 'known'}>Source known</option><option value="unknown" selected={data.filters.source === 'unknown'}>Source unknown</option></select></label>
  <div class="filter-actions"><button class="button" type="submit">Apply filters</button>{#if data.filters.search || data.filters.usage !== 'all' || data.filters.status !== 'all' || data.filters.source !== 'all'}<a class="button" href="/admin/images">Clear</a>{/if}</div>
</form>

<section class="panel" aria-labelledby="image-list-heading">
  <div class="panel-heading"><h2 id="image-list-heading">Assets <span class="count">{data.assets.length}</span></h2><span class="muted">Select an image to edit global metadata.</span></div>
  {#if data.assets.length === 0}
    <p class="empty-state">No images match these filters.</p>
  {:else}
    <div class="asset-grid">
      {#each data.assets as asset}
        <a class="asset-card" href={`/admin/images/${asset.id}`}>
          {#if asset.imageUrl}<img src={asset.imageUrl} alt={asset.altText ?? ''} loading="lazy" />{:else}<div class="inactive-thumb">Inactive image</div>{/if}
          <div class="asset-card-body"><strong>{asset.originalFilename ?? 'Unnamed image'}</strong><span class="muted">{asset.usageCount} {asset.usageCount === 1 ? 'Case' : 'Cases'}</span><span class:badge-active={asset.isActive} class:badge-inactive={!asset.isActive} class="status-badge">{asset.isActive ? 'Active' : 'Inactive'}</span></div>
        </a>
      {/each}
    </div>
  {/if}
</section>

<style>
  .page-heading, .panel-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; } h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0; font-size: 1.15rem; } .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .filter-panel { display: grid; grid-template-columns: minmax(220px, 1.8fr) repeat(3, minmax(120px, 0.7fr)) auto; gap: 0.75rem; align-items: end; margin: 1.5rem 0 1rem; padding: 1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input, select { width: 100%; box-sizing: border-box; padding: 0.68rem 0.72rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } .filter-actions { display: flex; gap: 0.5rem; } .panel { padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 1rem; margin-top: 1rem; } .asset-card { display: grid; overflow: hidden; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; color: #172033; text-decoration: none; transition: border-color 120ms ease, box-shadow 120ms ease; } .asset-card:hover, .asset-card:focus-visible { border-color: #98a2b3; box-shadow: 0 4px 14px rgb(23 32 51 / 10%); } .asset-card img, .inactive-thumb { width: 100%; height: 150px; object-fit: contain; background: #eef2f6; } .inactive-thumb { display: grid; place-items: center; color: #667085; font-size: 0.85rem; } .asset-card-body { display: grid; gap: 0.3rem; padding: 0.8rem; overflow-wrap: anywhere; } .status-badge { width: max-content; padding: 0.18rem 0.45rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; } .badge-active { background: #ecfdf3; color: #027a48; } .badge-inactive { background: #f2f4f7; color: #667085; } .empty-state { margin-top: 1rem; padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; }
  @media (max-width: 900px) { .filter-panel { grid-template-columns: repeat(2, minmax(0, 1fr)); } .search-field { grid-column: 1 / -1; } } @media (max-width: 600px) { .page-heading, .panel-heading { align-items: start; flex-direction: column; } .filter-panel { grid-template-columns: minmax(0, 1fr); } .search-field { grid-column: auto; } .filter-actions { align-items: center; } }
</style>
