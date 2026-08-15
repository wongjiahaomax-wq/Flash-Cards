<script>
  let { data } = $props();
  let query = $state('');
</script>

<svelte:head><title>Cases | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div><p class="eyebrow">Content library</p><h1>Cases</h1><p class="muted">Find an existing Case or start a new one.</p></div>
  <a class="button primary" href="/admin/cases/new">New Case</a>
</section>

<form class="search-form" method="GET">
  <label for="case-search">Search by Case title</label>
  <div class="search-row"><input id="case-search" name="q" bind:value={query} placeholder="e.g. anterior STEMI" /><button class="button" type="submit">Search</button>{#if query}<a class="button" href="/admin/cases">Clear</a>{/if}</div>
</form>

<section class="panel" aria-labelledby="case-list-heading">
  <div class="panel-heading"><h2 id="case-list-heading">Active Cases <span class="count">{data.cases.length}</span></h2><span class="muted">Open a Case to edit its content.</span></div>
  {#if data.cases.length === 0}
    <p class="empty-state">No active Cases yet.</p>
  {:else}
    <div class="case-table" role="list">
      <div class="table-header" aria-hidden="true"><span>Case</span><span>Topic</span><span>Open</span></div>
      {#each data.cases as item}
        <a class="table-row" href={`/admin/cases/${item.id}`}><strong>{item.title}</strong><span>{item.conceptName ?? 'Unassigned'}</span><span>Open →</span></a>
      {/each}
    </div>
  {/if}
</section>

<style>
  .page-heading, .panel-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0; font-size: 1.15rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; } .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .search-form { display: grid; gap: 0.4rem; margin: 1.5rem 0 1rem; color: #344054; font-weight: 650; } .search-row { display: flex; gap: 0.6rem; } input { min-width: 0; flex: 1; padding: 0.7rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; }
  .panel { padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .case-table { display: grid; margin-top: 1rem; } .table-header, .table-row { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(120px, 0.8fr) 80px; gap: 1rem; align-items: center; padding: 0.8rem 0.5rem; } .table-header { color: #667085; border-bottom: 1px solid #dfe5ee; font-size: 0.76rem; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; } .table-row { border-bottom: 1px solid #eaecf0; color: #172033; text-decoration: none; } .table-row:last-child { border-bottom: 0; } .table-row span { color: #667085; } .table-row span:last-child { color: #344054; font-size: 0.9rem; font-weight: 650; text-align: right; } .empty-state { padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; }
  @media (max-width: 600px) { .page-heading, .panel-heading { align-items: start; flex-direction: column; } .table-header { display: none; } .table-row { grid-template-columns: minmax(0, 1fr) auto; gap: 0.25rem 0.75rem; } .table-row strong { grid-column: 1 / -1; } .table-row span:last-child { text-align: left; } }
</style>
