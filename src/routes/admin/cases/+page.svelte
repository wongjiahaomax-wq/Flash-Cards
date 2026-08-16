<script>
  let { data } = $props();
  let query = $state('');

  $effect(() => {
    query = data.caseFilters.search;
  });
</script>

<svelte:head><title>Cases | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div><p class="eyebrow">Content library</p><h1>Cases</h1><p class="muted">Find an existing Case by title or cross-cutting clinical Tag.</p></div>
  <a class="button primary" href="/admin/cases/new">New Case</a>
</section>

<form class="search-form" method="GET">
  <label class="search-field" for="case-search">Search by Case title<input id="case-search" name="q" bind:value={query} placeholder="e.g. anterior STEMI" /></label>
  <label for="case-tag">Tag<select id="case-tag" name="tag"><option value="">All Tags</option>{#each data.tags as tag}<option value={tag.id} selected={tag.id === data.caseFilters.tagId}>{tag.name}</option>{/each}</select></label>
  <div class="search-actions"><button class="button" type="submit">Search</button>{#if query || data.caseFilters.tagId}<a class="button" href="/admin/cases">Clear</a>{/if}</div>
</form>

<section class="panel" aria-labelledby="case-list-heading">
  <div class="panel-heading"><h2 id="case-list-heading">Active Cases <span class="count">{data.cases.length}</span></h2><span class="muted">Tags are curation metadata; Topic remains the learner study route.</span></div>
  {#if data.cases.length === 0}
    <p class="empty-state">No active Cases match these filters.</p>
  {:else}
    <div class="case-table" role="list">
      <div class="table-header" aria-hidden="true"><span>Case</span><span>Topic</span><span>Tags</span><span>Open</span></div>
      {#each data.cases as item}
        <a class="table-row" href={`/admin/cases/${item.id}`}>
          <strong>{item.title}</strong>
          <span>{item.conceptName ?? 'Unassigned'}</span>
          <span class="tag-list">{#if item.tags.length}{#each item.tags as tag}<span class="tag-chip">{tag.name}</span>{/each}{:else}<span class="muted">—</span>{/if}</span>
          <span class="open-link">Open →</span>
        </a>
      {/each}
    </div>
  {/if}
</section>

<style>
  .page-heading, .panel-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0; font-size: 1.15rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; } .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .search-form { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(180px, 0.8fr) auto; gap: 0.75rem; align-items: end; margin: 1.5rem 0 1rem; } label { display: grid; gap: 0.4rem; color: #344054; font-weight: 650; } input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: 0.7rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } .search-actions { display: flex; gap: 0.5rem; }
  .panel { padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .case-table { display: grid; margin-top: 1rem; } .table-header, .table-row { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(120px, 0.8fr) minmax(160px, 1fr) 80px; gap: 1rem; align-items: center; padding: 0.8rem 0.5rem; } .table-header { color: #667085; border-bottom: 1px solid #dfe5ee; font-size: 0.76rem; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; } .table-row { border-bottom: 1px solid #eaecf0; color: #172033; text-decoration: none; } .table-row:last-child { border-bottom: 0; } .table-row > span { color: #667085; } .open-link { color: #344054 !important; font-size: 0.9rem; font-weight: 650; text-align: right; }
  .tag-list { display: flex; flex-wrap: wrap; gap: 0.3rem; } .tag-chip { display: inline-block; padding: 0.18rem 0.4rem; border-radius: 999px; background: #ecfdf3; color: #027a48; font-size: 0.76rem; font-weight: 650; }
  .empty-state { padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; }
  @media (max-width: 800px) { .search-form { grid-template-columns: minmax(0, 1fr) minmax(170px, 0.7fr); } .search-actions { grid-column: 1 / -1; } }
  @media (max-width: 600px) { .page-heading, .panel-heading { align-items: start; flex-direction: column; } .search-form { grid-template-columns: minmax(0, 1fr); } .search-actions { grid-column: auto; } .table-header { display: none; } .table-row { grid-template-columns: minmax(0, 1fr) auto; gap: 0.35rem 0.75rem; } .table-row strong, .tag-list { grid-column: 1 / -1; } .open-link { text-align: left; } }
</style>
