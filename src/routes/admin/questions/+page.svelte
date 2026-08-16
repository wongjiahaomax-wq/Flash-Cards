<script>
  let { data } = $props();
  let query = $state('');
  $effect(() => {
    query = data.filters.search;
  });
</script>

<svelte:head><title>Questions | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div><p class="eyebrow">Content library</p><h1>Questions</h1><p class="muted">Find reusable prompt wording and inspect contextual knowledge Tags without attaching clinical meaning to the prompt itself.</p></div>
</section>

<form class="filter-form" method="GET">
  <label class="search-field" for="question-search">Search prompts and answers<input id="question-search" name="q" bind:value={query} placeholder="e.g. describe this ECG or LAD" /></label>
  <label>Topic / Concept<select name="topic"><option value="">All Topics</option>{#each data.topics as topic}<option value={topic.id} selected={topic.id === data.filters.topicId}>{topic.name}</option>{/each}</select></label>
  <label>Usage scope<select name="scope"><option value="all" selected={data.filters.scope === 'all'}>All usages</option><option value="shared" selected={data.filters.scope === 'shared'}>Shared / reusable</option><option value="case" selected={data.filters.scope === 'case'}>Case-specific</option></select></label>
  <label>Case Question Tag<select name="tag"><option value="">All Tags</option>{#each data.tags as tag}<option value={tag.id} selected={tag.id === data.filters.tagId}>{tag.name}</option>{/each}</select></label>
  <div class="filter-actions"><button class="button primary" type="submit">Search</button>{#if query || data.filters.topicId || data.filters.scope !== 'all' || data.filters.tagId}<a class="button" href="/admin/questions">Clear</a>{/if}</div>
</form>

<section class="panel" aria-labelledby="question-list-heading">
  <div class="panel-heading"><h2 id="question-list-heading">Question Prompts <span class="count">{data.questions.length}</span></h2><span class="muted">Displayed Tags come only from active Case Question usages.</span></div>
  {#if data.questions.length === 0}
    <p class="empty-state">No active Question Prompts match these filters.</p>
  {:else}
    <div class="question-table" role="list">
      <div class="table-header" aria-hidden="true"><span>Prompt</span><span>Scope</span><span>Topic</span><span>Tags</span><span>Usage</span></div>
      {#each data.questions as question}
        <a class="table-row" href={'/admin/questions/' + question.id}>
          <strong>{question.promptMd}</strong>
          <span><span class:shared={question.hasSharedUsage} class="scope-badge">{question.scope}</span></span>
          <span>{question.topicNames.length ? question.topicNames.join(', ') : '—'}</span>
          <span class="tag-list">{#if question.tags.length}{#each question.tags as tag}<span class="tag-chip">{tag.name}</span>{/each}{:else}—{/if}</span>
          <span class="usage-count">{question.usageCount}</span>
        </a>
      {/each}
    </div>
  {/if}
</section>

<style>
  .page-heading, .panel-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0; font-size: 1.15rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .filter-form { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(140px, 0.8fr) minmax(140px, 0.8fr) minmax(150px, 0.9fr) auto; gap: 0.75rem; align-items: end; margin: 1.5rem 0 1rem; } label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input, select { width: 100%; min-width: 0; box-sizing: border-box; padding: 0.7rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } .filter-actions { display: flex; gap: 0.5rem; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; white-space: nowrap; } .button.primary { border-color: #172033; background: #172033; color: #fff; }
  .panel { padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .question-table { display: grid; margin-top: 1rem; } .table-header, .table-row { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(130px, 0.8fr) minmax(110px, 0.8fr) minmax(150px, 1fr) 55px; gap: 0.85rem; align-items: center; padding: 0.8rem 0.5rem; } .table-header { color: #667085; border-bottom: 1px solid #dfe5ee; font-size: 0.76rem; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; } .table-row { border-bottom: 1px solid #eaecf0; color: #172033; text-decoration: none; } .table-row:last-child { border-bottom: 0; } .table-row > span { color: #667085; overflow-wrap: anywhere; } .usage-count { color: #344054 !important; font-weight: 700; text-align: right; }
  .scope-badge { display: inline-block; padding: 0.2rem 0.4rem; border-radius: 999px; background: #f2f4f7; color: #475467; font-size: 0.78rem; font-weight: 650; } .scope-badge.shared { background: #ecfdf3; color: #027a48; }
  .tag-list { display: flex; flex-wrap: wrap; gap: 0.3rem; } .tag-chip { display: inline-block; padding: 0.18rem 0.4rem; border-radius: 999px; background: #ecfdf3; color: #027a48; font-size: 0.76rem; font-weight: 650; }
  .empty-state { padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; }
  @media (max-width: 1050px) { .filter-form { grid-template-columns: repeat(2, minmax(0, 1fr)); } .search-field { grid-column: 1 / -1; } .filter-actions { grid-column: 1 / -1; } }
  @media (max-width: 680px) { .page-heading, .panel-heading { align-items: start; flex-direction: column; } .filter-form { grid-template-columns: minmax(0, 1fr); } .search-field, .filter-actions { grid-column: auto; } .table-header { display: none; } .table-row { grid-template-columns: minmax(0, 1fr) auto; gap: 0.35rem 0.75rem; } .table-row strong, .tag-list { grid-column: 1 / -1; } .usage-count { text-align: left; } }
</style>
