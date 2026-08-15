<script>
  let { data } = $props();
  let query = $state('');
  $effect(() => { query = data.filters.search; });
</script>

<svelte:head><title>Topics | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div>
    <p class="eyebrow">Content library</p>
    <h1>Topics</h1>
    <p class="muted">Browse Concepts, their active primary Cases, reusable questions, and hierarchy.</p>
  </div>
</section>

<form class="filter-form" method="GET">
  <label for="topic-search">Search Topic / Concept name
    <input id="topic-search" name="q" bind:value={query} placeholder="e.g. Cardiology" />
  </label>
  <div class="filter-actions">
    <button class="button primary" type="submit">Search</button>
    {#if query}<a class="button" href="/admin/topics">Clear</a>{/if}
  </div>
</form>

<section class="panel" aria-labelledby="topic-list-heading">
  <div class="panel-heading">
    <h2 id="topic-list-heading">Topics <span class="count">{data.topics.length}</span></h2>
    <span class="muted">Counts show current active content only.</span>
  </div>
  {#if data.topics.length === 0}
    <p class="empty-state">No Topics match this search.</p>
  {:else}
    <div class="topic-table" role="list">
      <div class="table-header" aria-hidden="true"><span>Topic</span><span>Parent</span><span>Cases</span><span>Shared questions</span><span>Status</span></div>
      {#each data.topics as topic}
        <a class="table-row" href={'/admin/topics/' + topic.id}>
          <strong>{topic.name}</strong>
          <span>{topic.parentName ?? '—'}</span>
          <span>{topic.activeCaseCount}</span>
          <span>{topic.activeSharedQuestionCount}</span>
          <span><span class:inactive={!topic.isActive} class="status-badge">{topic.isActive ? 'Active' : 'Inactive'}</span></span>
        </a>
      {/each}
    </div>
  {/if}
</section>

<style>
  .page-heading, .panel-heading { display:flex; justify-content:space-between; align-items:end; gap:1rem; }
  h1,h2,p { margin-top:0; } h1 { margin-bottom:.3rem; font-size:clamp(1.8rem,4vw,2.5rem); } h2 { margin-bottom:0; font-size:1.15rem; }
  .eyebrow { margin-bottom:.3rem; color:#667085; font-size:.74rem; font-weight:750; letter-spacing:.08em; text-transform:uppercase; } .muted { color:#667085; }
  .filter-form { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.75rem; align-items:end; margin:1.5rem 0 1rem; } label { display:grid; gap:.35rem; color:#344054; font-weight:650; } input { width:100%; min-width:0; padding:.7rem .75rem; border:1px solid #cdd6e3; border-radius:8px; background:#fff; font:inherit; } .filter-actions { display:flex; gap:.5rem; }
  .button { display:inline-block; padding:.7rem 1rem; border:1px solid #cdd6e3; border-radius:8px; background:#fff; color:#172033; text-decoration:none; cursor:pointer; white-space:nowrap; } .button.primary { border-color:#172033; background:#172033; color:#fff; }
  .panel { padding:1.1rem; border:1px solid #dfe5ee; border-radius:10px; background:#fff; } .count { color:#667085; font-size:.85rem; font-weight:500; }
  .topic-table { display:grid; margin-top:1rem; } .table-header,.table-row { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(100px,1fr) 70px 120px 90px; gap:1rem; align-items:center; padding:.8rem .5rem; } .table-header { color:#667085; border-bottom:1px solid #dfe5ee; font-size:.76rem; font-weight:750; letter-spacing:.06em; text-transform:uppercase; } .table-row { border-bottom:1px solid #eaecf0; color:#172033; text-decoration:none; } .table-row:last-child { border-bottom:0; } .table-row > span { color:#667085; overflow-wrap:anywhere; }
  .status-badge { display:inline-block; padding:.2rem .45rem; border-radius:999px; background:#ecfdf3; color:#027a48; font-size:.78rem; font-weight:650; } .status-badge.inactive { background:#f2f4f7; color:#667085; }
  .empty-state { padding:1rem; border:1px dashed #d0d5dd; border-radius:8px; }
  @media (max-width:760px) { .table-header { display:none; } .table-row { grid-template-columns:minmax(0,1fr) auto; gap:.35rem .75rem; } .table-row strong { grid-column:1/-1; } }
  @media (max-width:520px) { .filter-form { grid-template-columns:1fr; } }
</style>
