<script>
  let { data, form } = $props();
  let selectedCase = $derived(data.selectedCase);
</script>

<svelte:head><title>{selectedCase?.case.title ?? 'Case'} | Admin | Flash-Cards</title></svelte:head>

{#if !selectedCase}
  <section class="panel"><h1>Case not found</h1><p class="muted">This Case may be inactive or no longer available.</p><a class="button" href="/admin/cases">Back to Cases</a></section>
{:else}
  <section class="page-heading">
    <div><p class="eyebrow">Case editor</p><h1>{selectedCase.case.title}</h1><p class="muted">{selectedCase.case.conceptName ?? 'No primary topic assigned'}</p></div>
    <div class="actions"><a class="button" href="/admin/cases">All Cases</a><a class="button primary" href="/study">Preview in Study</a></div>
  </section>

  {#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

  <nav class="section-nav" aria-label="Case editor sections">
    <a href="#case">Case</a><a href="#questions">Questions <span>{selectedCase.questions.length}</span></a><a href="#images">Images <span>{selectedCase.attached.length}</span></a><a href="#preview">Preview</a>
  </nav>

  <section id="case" class="panel stack">
    <div><p class="eyebrow">Case details</p><h2>Case</h2><p class="muted">The internal title is for administrators. The stem is shown to learners during review.</p></div>
    <form method="POST" action="?/updateCase" class="form-grid">
      <input type="hidden" name="case_id" value={selectedCase.case.id} />
      <label>Internal Case title<input name="title" value={selectedCase.case.title} maxlength="300" required /></label>
      <label>Primary topic / Concept<select name="concept_id" required>{#each data.concepts as concept}<option value={concept.id} selected={concept.id === selectedCase.case.conceptId}>{concept.name}</option>{/each}</select></label>
      <label class="wide">Case stem / vignette <span class="muted">(optional)</span><textarea name="vignette_md" rows="7" maxlength="5000">{selectedCase.case.vignetteMd ?? ''}</textarea></label>
      <div class="wide"><button class="button primary" type="submit">Save Case</button></div>
    </form>
  </section>

  <section id="questions" class="panel stack">
    <div><p class="eyebrow">Case content</p><h2>Questions <span class="count">{selectedCase.questions.length}</span></h2><p class="muted">Case-specific answers take precedence over reusable topic questions.</p></div>
    <form method="POST" action="?/saveQuestion" class="form-grid">
      <input type="hidden" name="case_id" value={selectedCase.case.id} />
      <label>Question prompt<textarea name="prompt_md" rows="3" maxlength="2000" required placeholder="e.g. What is the key ECG finding?"></textarea></label>
      <label>Answer<textarea name="answer_md" rows="3" maxlength="5000" required placeholder="The answer shown after reveal."></textarea></label>
      <label class="checkbox-label"><input name="reusable_for_topic" type="checkbox" /> Reusable for this topic</label>
      <div><button class="button primary" type="submit">Add question</button></div>
    </form>
    {#if selectedCase.questions.length === 0}<p class="empty-state">No questions yet.</p>{/if}
    <div class="question-list">
      {#each selectedCase.questions as question, index}
        <article class="question-card">
          <div class="card-heading"><strong>Question {index + 1}</strong>{#if question.reusableForTopic}<span class="badge">Reusable for {selectedCase.case.conceptName}</span>{/if}</div>
          <form method="POST" action="?/saveQuestion" class="stack">
            <input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="original_prompt_id" value={question.questionPromptId} />
            <label>Prompt<textarea name="prompt_md" rows="2" maxlength="2000" required>{question.promptMd}</textarea></label>
            <label>Answer<textarea name="answer_md" rows="3" maxlength="5000" required>{question.answerMd}</textarea></label>
            <label class="checkbox-label"><input name="reusable_for_topic" type="checkbox" checked={question.reusableForTopic} /> Reusable for this topic</label>
            <div class="actions"><button class="button" type="submit">Save question</button></div>
          </form>
          <div class="actions"><form method="POST" action="?/reorderQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><input type="hidden" name="direction" value="up" /><button class="button small" type="submit" disabled={index === 0}>Move up</button></form><form method="POST" action="?/reorderQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><input type="hidden" name="direction" value="down" /><button class="button small" type="submit" disabled={index === selectedCase.questions.length - 1}>Move down</button></form><form method="POST" action="?/removeQuestion"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="prompt_id" value={question.questionPromptId} /><button class="button danger small" type="submit">Remove</button></form></div>
        </article>
      {/each}
    </div>
  </section>

  <section id="images" class="panel stack">
    <div><p class="eyebrow">Case stimuli</p><h2>Images <span class="count">{selectedCase.attached.length}</span></h2><p class="muted">Assets are reusable. Captions belong to this Case and can differ elsewhere.</p></div>
    <div class="image-columns">
      <div class="stack">
        <h3>Attached images</h3>
        {#if selectedCase.attached.length === 0}<p class="empty-state">No images attached yet.</p>{/if}
        {#each selectedCase.attached as asset, index}
          <article class="asset-card">
            <div class="asset-topline"><span class="order-badge">{index + 1}</span>{#if asset.imageUrl}<img src={asset.imageUrl} alt={asset.altText ?? ''} width="140" height="100" />{:else}<div class="inactive-image">Inactive image</div>{/if}<div class="asset-details"><strong>{asset.originalFilename ?? asset.assetId}</strong><span class="muted">{asset.altText || 'No alt text'}</span>{#if asset.sourceLabel}<span class="muted">Source: {asset.sourceLabel}</span>{/if}</div></div>
            <form method="POST" action="?/caption" class="stack"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><label>Case-specific caption<textarea name="caption" rows="2" maxlength="1000">{asset.captionMd ?? ''}</textarea></label><button class="button small" type="submit">Save caption</button></form>
            <div class="actions"><form method="POST" action="?/reorder"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><input type="hidden" name="direction" value="up" /><button class="button small" type="submit" disabled={index === 0}>Move up</button></form><form method="POST" action="?/reorder"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><input type="hidden" name="direction" value="down" /><button class="button small" type="submit" disabled={index === selectedCase.attached.length - 1}>Move down</button></form><form method="POST" action="?/detach"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><button class="button danger small" type="submit">Detach</button></form></div>
          </article>
        {/each}
      </div>
      <div class="stack">
        <h3>Available Assets</h3>
        {#if selectedCase.available.length === 0}<p class="empty-state">All active images are attached to this Case.</p>{/if}
        {#each selectedCase.available as asset}
          <article class="asset-card"><div class="asset-topline"><img src={asset.imageUrl} alt={asset.altText ?? ''} width="140" height="100" /><div class="asset-details"><strong>{asset.originalFilename ?? asset.assetId}</strong><span class="muted">{asset.altText || 'No alt text'}</span></div></div><form method="POST" action="?/attach"><input type="hidden" name="case_id" value={selectedCase.case.id} /><input type="hidden" name="asset_id" value={asset.assetId} /><button class="button primary small" type="submit">Attach to Case</button></form></article>
        {/each}
      </div>
    </div>
    <div class="upload-box"><div><h3>Upload a new image</h3><p class="muted">JPEG or PNG, up to 5 MiB. The uploaded Asset can be reused in other Cases.</p></div><form method="POST" action="?/upload" enctype="multipart/form-data" class="form-grid"><label class="wide">Image file<input name="image" type="file" accept="image/jpeg,image/png" required /></label><label>Alt text<input name="alt_text" maxlength="500" required /></label><label>Source label <span class="muted">(optional)</span><input name="source_label" maxlength="300" /></label><label>Source URL <span class="muted">(optional)</span><input name="source_url" type="url" maxlength="2000" /></label><label>Licence / permission <span class="muted">(optional)</span><input name="licence" maxlength="500" /></label><div class="wide"><button class="button primary" type="submit">Upload image</button></div></form></div>
  </section>

  <section id="preview" class="panel preview-panel"><p class="eyebrow">Learner view</p><h2>Preview</h2><p class="muted">Open the Study flow to verify active Cases, image order, vignette, and question reveal behaviour.</p><a class="button primary" href="/study">Open Study preview</a></section>
{/if}

<style>
  .page-heading, .card-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; } h1, h2, h3, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0.2rem; font-size: 1.2rem; } h3 { margin-bottom: 0.5rem; font-size: 1rem; } .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; } .stack { display: grid; gap: 0.85rem; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.55rem; } .actions form { display: contents; } .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .button.small { padding: 0.5rem 0.65rem; font-size: 0.82rem; } .button.danger { border-color: #fecdca; color: #b42318; } button:disabled { cursor: not-allowed; opacity: 0.45; }
  .panel { margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .form-error { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; background: #fef3f2; color: #b42318; } .section-nav { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 1.5rem 0 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid #dfe5ee; } .section-nav a { padding: 0.55rem 0.7rem; border-radius: 6px; color: #344054; font-weight: 650; text-decoration: none; } .section-nav a:hover { background: #e9eef5; } .section-nav span, .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; } label { display: grid; gap: 0.35rem; color: #344054; font-weight: 650; } input, textarea, select { width: 100%; box-sizing: border-box; padding: 0.65rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } textarea { resize: vertical; } .wide { grid-column: 1 / -1; } .checkbox-label { display: flex; align-items: center; gap: 0.45rem; font-weight: 500; } .checkbox-label input { width: auto; }
  .question-list, .image-columns { display: grid; gap: 0.85rem; } .question-card, .asset-card, .upload-box { display: grid; gap: 0.75rem; padding: 0.85rem; border: 1px solid #eaecf0; border-radius: 8px; background: #f8fafc; } .badge { color: #475467; font-size: 0.82rem; font-weight: 500; } .empty-state { padding: 0.85rem; border: 1px dashed #d0d5dd; border-radius: 8px; color: #667085; } .image-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); } .asset-topline { display: flex; align-items: start; gap: 0.7rem; min-width: 0; } .asset-topline img, .inactive-image { flex: 0 0 140px; width: 140px; height: 100px; object-fit: contain; border-radius: 7px; background: #eef2f6; } .inactive-image { display: grid; place-items: center; color: #667085; font-size: 0.8rem; text-align: center; } .asset-details { display: grid; gap: 0.2rem; min-width: 0; overflow-wrap: anywhere; font-size: 0.88rem; } .order-badge { display: grid; place-items: center; flex: 0 0 1.6rem; height: 1.6rem; border-radius: 999px; background: #172033; color: #fff; font-size: 0.8rem; font-weight: 700; } .upload-box { margin-top: 0.25rem; background: #fff; }
  .preview-panel { padding-bottom: 1.4rem; } @media (max-width: 760px) { .page-heading, .card-heading { align-items: start; flex-direction: column; } .image-columns, .form-grid { grid-template-columns: minmax(0, 1fr); } .wide { grid-column: auto; } } @media (max-width: 480px) { .asset-topline { flex-wrap: wrap; } .asset-topline img, .inactive-image { flex-basis: 100%; width: 100%; height: 160px; } }
</style>
