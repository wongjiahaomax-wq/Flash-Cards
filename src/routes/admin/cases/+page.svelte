<script>
  let { data } = $props();
  let query = $state('');
  let firstShown = $derived(data.pagination.totalCount === 0 ? 0 : (data.pagination.page - 1) * data.pagination.pageSize + 1);
  let lastShown = $derived(Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalCount));

  $effect(() => {
    query = data.caseFilters.search;
  });

  /** @param {number} page */
  function pageHref(page) {
    const params = new URLSearchParams();
    if (data.caseFilters.search) params.set('q', data.caseFilters.search);
    if (data.caseFilters.tagId) params.set('tag', data.caseFilters.tagId);
    if (data.caseFilters.sort && data.caseFilters.sort !== 'case-asc') params.set('sort', data.caseFilters.sort);
    if (page > 1) params.set('page', String(page));
    const search = params.toString();
    return search ? `/admin/cases?${search}` : '/admin/cases';
  }

  /** @param {'case' | 'topic' | 'tag'} column */
  function sortHref(column) {
    const currentColumn = data.caseFilters.sort?.split('-')[0];
    const currentDirection = data.caseFilters.sort?.split('-')[1];
    const direction = currentColumn === column && currentDirection === 'asc' ? 'desc' : 'asc';
    const params = new URLSearchParams();
    if (data.caseFilters.search) params.set('q', data.caseFilters.search);
    if (data.caseFilters.tagId) params.set('tag', data.caseFilters.tagId);
    if (!(column === 'case' && direction === 'asc')) params.set('sort', `${column}-${direction}`);
    const search = params.toString();
    return search ? `/admin/cases?${search}` : '/admin/cases';
  }

  /** @param {'case' | 'topic' | 'tag'} column */
  function sortIndicator(column) {
    if (data.caseFilters.sort?.startsWith(`${column}-asc`)) return '↑';
    if (data.caseFilters.sort?.startsWith(`${column}-desc`)) return '↓';
    return '↕';
  }
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
  <div class="panel-heading"><div><h2 id="case-list-heading">Active Cases <span class="count">{data.pagination.totalCount}</span></h2><span class="muted">Showing {firstShown}–{lastShown} of {data.pagination.totalCount} Cases · Page {data.pagination.page} of {data.pagination.totalPages}.</span></div><span class="muted">Tags are curation metadata; Topic remains the learner study route.</span></div>
  {#if data.cases.length === 0}
    <p class="empty-state">No active Cases match these filters.</p>
  {:else}
    <div class="case-table" role="list">
      <div class="table-header"><a class="sort-header" href={sortHref('case')} aria-label={`Sort by Case ${data.caseFilters.sort === 'case-asc' ? 'descending' : 'ascending'}`}>Case <span aria-hidden="true">{sortIndicator('case')}</span></a><a class="sort-header" href={sortHref('topic')} aria-label={`Sort by Topic ${data.caseFilters.sort === 'topic-asc' ? 'descending' : 'ascending'}`}>Topic <span aria-hidden="true">{sortIndicator('topic')}</span></a><a class="sort-header" href={sortHref('tag')} aria-label={`Sort by Tags ${data.caseFilters.sort === 'tag-asc' ? 'descending' : 'ascending'}`}>Tags <span aria-hidden="true">{sortIndicator('tag')}</span></a><span>Open</span></div>
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
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; } .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .search-form { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(180px, 0.8fr) auto; gap: 0.75rem; align-items: end; margin: 1.5rem 0 1rem; } label { display: grid; gap: 0.4rem; color: #344054; font-weight: 650; } input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: 0.7rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } .search-actions { display: flex; gap: 0.5rem; }
  .panel { padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .case-table { display: grid; margin-top: 1rem; } .table-header, .table-row { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(120px, 0.8fr) minmax(160px, 1fr) 80px; gap: 1rem; align-items: center; padding: 0.8rem 0.5rem; } .table-header { color: #667085; border-bottom: 1px solid #dfe5ee; font-size: 0.76rem; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; } .sort-header { color: inherit; text-decoration: none; } .sort-header span { margin-left: 0.2rem; font-size: 0.9rem; } .table-row { border-bottom: 1px solid #eaecf0; color: #172033; text-decoration: none; } .table-row:last-child { border-bottom: 0; } .table-row > span { color: #667085; } .open-link { color: #344054 !important; font-size: 0.9rem; font-weight: 650; text-align: right; }
  .tag-list { display: flex; flex-wrap: wrap; gap: 0.3rem; } .tag-chip { display: inline-block; padding: 0.18rem 0.4rem; border-radius: 999px; background: #ecfdf3; color: #027a48; font-size: 0.76rem; font-weight: 650; }
  .empty-state { padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; }
  .pagination { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 0.75rem; margin-top: 1rem; } .pagination > :last-child { justify-self: end; }
  @media (max-width: 800px) { .search-form { grid-template-columns: minmax(0, 1fr) minmax(170px, 0.7fr); } .search-actions { grid-column: 1 / -1; } }
  @media (max-width: 600px) { .page-heading, .panel-heading { align-items: start; flex-direction: column; } .search-form { grid-template-columns: minmax(0, 1fr); } .search-actions { grid-column: auto; } .table-header { display: none; } .table-row { grid-template-columns: minmax(0, 1fr) auto; gap: 0.35rem 0.75rem; } .table-row strong, .tag-list { grid-column: 1 / -1; } .open-link { text-align: left; } .pagination { grid-template-columns: 1fr 1fr; } .pagination > span { grid-column: 1 / -1; grid-row: 1; text-align: center; } .pagination > a:first-of-type { grid-column: 1; } .pagination > a:last-of-type { grid-column: 2; } }
</style>
