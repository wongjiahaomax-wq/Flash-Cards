<script>
  let { data, form } = $props();
</script>

<svelte:head><title>Preview Cases | Flash-Cards</title></svelte:head>

<section class="heading">
  <div>
    <p class="eyebrow">Production-backed Preview workspace</p>
    <h1>Preview Cases</h1>
    <p class="muted">Browse real production Cases read-only, then create disposable copies for Admin UI testing.</p>
  </div>
</section>

{#if form?.error}<p class="error" role="alert">{form.error}</p>{/if}
{#if data.workspaceBlocked}<p class="error" role="alert">This workspace must be reset or recovered before new Preview copies can be created.</p>{/if}

<section class="panel stack">
  <div>
    <p class="eyebrow">Disposable workspace</p>
    <h2>Your Preview copies <span class="count">{data.previewCases.length}</span></h2>
    <p class="muted">Only these copies are writable. Reset removes them and any Preview-only uploads.</p>
  </div>
  {#if data.previewCases.length === 0}
    <p class="empty">No Preview copies yet.</p>
  {:else}
    <div class="case-list">
      {#each data.previewCases as item}
        <a class="case-row" href={'/preview-admin/cases/' + item.id}>
          <span><strong>{item.title}</strong><small>Preview copy</small></span>
          <span aria-hidden="true">Open →</span>
        </a>
      {/each}
    </div>
  {/if}
</section>

<section class="panel stack">
  <div>
    <p class="eyebrow">Read-only production content</p>
    <h2>Create a Preview copy</h2>
    <p class="muted">The source Case is never edited. Its Case-owned authoring graph is cloned into this workspace; existing production images are reused read-only.</p>
  </div>
  <form method="GET" class="search-row">
    <label>Search real Cases<input name="q" value={data.search} placeholder="Case title" /></label>
    <button class="button" type="submit">Search</button>
    {#if data.search}<a class="button" href="/preview-admin">Clear</a>{/if}
  </form>

  {#if data.sourceCases.length === 0}
    <p class="empty">No production Cases match this search.</p>
  {:else}
    <div class="case-list">
      {#each data.sourceCases as item}
        <article class="source-row">
          <div>
            <strong>{item.title}</strong>
            <span class="muted">{item.conceptName ?? 'No primary Topic'}</span>
            {#if item.vignetteMd}<small>{item.vignetteMd.slice(0, 180)}{item.vignetteMd.length > 180 ? '…' : ''}</small>{/if}
          </div>
          <form method="POST" action="?/clone">
            <input type="hidden" name="source_case_id" value={item.id} />
            <button class="button primary" type="submit" disabled={data.workspaceBlocked}>Create Preview Copy</button>
          </form>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .heading, .panel { max-width: 1100px; margin: 0 auto 1rem; }
  .heading h1, h2, p { margin-top: 0; }
  .eyebrow { margin-bottom: 0.3rem; color: #7a2e0e; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
  .muted { color: #667085; }
  .panel { padding: 1rem; border: 1px solid #e4e7ec; border-radius: 10px; background: white; }
  .stack { display: grid; gap: 0.9rem; }
  .count { color: #667085; font-size: 0.9rem; }
  .case-list { display: grid; gap: 0.55rem; }
  .case-row, .source-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.8rem; border: 1px solid #e4e7ec; border-radius: 8px; background: #fcfcfd; }
  .case-row { color: inherit; text-decoration: none; }
  .case-row:hover { border-color: #b54708; }
  .case-row span:first-child, .source-row > div { display: grid; gap: 0.2rem; }
  small { color: #667085; }
  .search-row { display: flex; flex-wrap: wrap; align-items: end; gap: 0.6rem; }
  .search-row label { display: grid; gap: 0.3rem; flex: 1 1 20rem; }
  input { width: 100%; padding: 0.7rem; border: 1px solid #d0d5dd; border-radius: 8px; }
  .empty { margin: 0; padding: 0.8rem; border-radius: 8px; background: #f9fafb; color: #667085; }
  .error { max-width: 1100px; margin: 0 auto 1rem; padding: 0.75rem 1rem; border: 1px solid #f04438; border-radius: 8px; background: #fef3f2; color: #7a271a; }
</style>
