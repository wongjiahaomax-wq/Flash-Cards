<script>
  let { data } = $props();
  let detail = $derived(data.detail);
</script>

<svelte:head><title>{detail?.asset.originalFilename ?? 'Image'} | Admin | Flash-Cards</title></svelte:head>

{#if !detail}
  <section class="panel"><h1>Image not found</h1><p class="muted">This Asset may not exist.</p><a class="button" href="/admin/images">Back to Images</a></section>
{:else}
  <section class="page-heading"><div><p class="eyebrow">Asset detail</p><h1>{detail.asset.originalFilename ?? 'Unnamed image'}</h1><p class="muted">Stable Asset ID: {detail.asset.id}</p></div><div class="actions"><a class="button" href="/admin/images">All Images</a><a class="button" href="/admin/cases">Cases</a></div></section>

  {#if data.status === 'saved'}<p class="success" role="status">Asset metadata saved. The R2 object and its storage key were unchanged.</p>{/if}
  {#if data.status === 'uploaded'}<p class="success" role="status">Image uploaded. You can now maintain its Asset metadata.</p>{/if}

  <div class="detail-grid">
    <section class="panel preview-panel">
      <p class="eyebrow">Protected preview</p>
      {#if detail.asset.imageUrl}<img class="large-preview" src={detail.asset.imageUrl} alt={detail.asset.altText ?? ''} />{:else}<div class="inactive-preview">Inactive image is not served.</div>{/if}
      <p class="muted">Runtime image delivery uses the protected R2-backed Asset route. The source URL below is attribution/reference metadata only.</p>
    </section>

    <section class="panel">
      <p class="eyebrow">Global metadata</p>
      <h2>Edit Asset</h2>
      <p class="muted">Renaming changes <code>assets.original_filename</code> in D1 only. Case-specific captions stay in each Case editor. Collection is Image Library organisation, separate from educational Topics and Tags.</p>
      <form method="POST" action="?/saveMetadata" class="form-grid">
        <label class="wide">Image name<input name="original_filename" value={detail.asset.originalFilename ?? ''} maxlength="300" /></label>
        <label class="wide">Alt text<textarea name="alt_text" rows="4" maxlength="500">{detail.asset.altText ?? ''}</textarea></label>
        <label class="wide">Collection<select name="image_collection_id"><option value="" selected={!detail.asset.imageCollectionId}>Unsorted</option>{#each data.collections as collection}<option value={collection.id} selected={detail.asset.imageCollectionId === collection.id}>{collection.name}</option>{/each}</select><span class="muted">Image Library organisation only. This does not change Case Topics, Tags, captions or learner behaviour.</span></label>
        <label>Source label <span class="muted">(optional)</span><input name="source_label" value={detail.asset.sourceLabel ?? ''} maxlength="300" /></label>
        <label>Source URL <span class="muted">(optional)</span><input name="source_url" type="url" value={detail.asset.sourceUrl ?? ''} maxlength="2000" /></label>
        <label class="wide">Licence / permission <span class="muted">(optional)</span><input name="licence" value={detail.asset.licence ?? ''} maxlength="500" /></label>
        <label class="checkbox-label wide"><input name="is_active" type="checkbox" checked={detail.asset.isActive} /> Active and available for learner image delivery</label>
        <div class="wide"><button class="button primary" type="submit">Save metadata</button></div>
      </form>
    </section>
  </div>

  <section class="panel usage-panel"><div class="panel-heading"><div><p class="eyebrow">Relationship usage</p><h2>Cases using this Asset <span class="count">{detail.asset.usageCount}</span></h2></div><span class="muted">Captions are shown for context but remain Case-specific.</span></div>
    {#if detail.usages.length === 0}<p class="empty-state">This image is not attached to any Case yet.</p>{:else}<div class="usage-list">{#each detail.usages as usage}<a class="usage-row" href={`/admin/cases/${usage.caseId}`}><span><strong>{usage.caseTitle}</strong>{#if usage.stimulusGroupName}<small>Alternative stimulus: {usage.stimulusGroupName}</small>{/if}{#if usage.captionMd}<small>Case caption: {usage.captionMd}</small>{/if}</span><span class="usage-status">{usage.caseIsActive ? 'Active Case' : 'Inactive Case'} →</span></a>{/each}</div>{/if}
  </section>
{/if}

<style>
  .page-heading, .panel-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; } h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0.25rem; font-size: 1.15rem; } .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; } code { font-size: 0.9em; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.6rem; } .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .detail-grid { display: grid; grid-template-columns: minmax(240px, 0.85fr) minmax(0, 1.15fr); gap: 1rem; } .preview-panel { align-self: start; } .large-preview, .inactive-preview { display: grid; place-items: center; width: 100%; min-height: 300px; max-height: 560px; object-fit: contain; border-radius: 8px; background: #eef2f6; } .inactive-preview { color: #667085; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; } label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input, textarea { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } textarea { resize: vertical; } .wide { grid-column: 1 / -1; } .checkbox-label { display: flex; align-items: center; gap: 0.45rem; font-weight: 500; } .checkbox-label input { width: auto; } .success { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; background: #ecfdf3; color: #027a48; } .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .usage-list { display: grid; margin-top: 1rem; } .usage-row { display: flex; justify-content: space-between; gap: 1rem; padding: 0.8rem 0.4rem; border-bottom: 1px solid #eaecf0; color: #172033; text-decoration: none; } .usage-row:last-child { border-bottom: 0; } .usage-row span:first-child { display: grid; gap: 0.2rem; } .usage-row small { color: #667085; } .usage-status { color: #667085; font-size: 0.86rem; white-space: nowrap; } .empty-state { margin-top: 1rem; padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; }
  @media (max-width: 760px) { .page-heading, .panel-heading { align-items: start; flex-direction: column; } .detail-grid, .form-grid { grid-template-columns: minmax(0, 1fr); } .wide { grid-column: auto; } .usage-row { align-items: start; flex-direction: column; gap: 0.3rem; } }
</style>
