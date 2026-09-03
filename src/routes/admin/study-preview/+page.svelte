<script>
  let { data } = $props();
</script>

<svelte:head>
  <title>Study Preview | Admin | Flash-Cards</title>
</svelte:head>

<main class="shell preview-shell">
  <nav class="preview-nav"><a href="/admin">← Admin</a><span class="muted">Read-only learner rendering reference</span></nav>

  <header>
    <p class="eyebrow">Admin Study Preview</p>
    <h1>Preview current learner content</h1>
    <p class="muted intro">This surface resolves the same current Case, image and question content used to freeze an active Review, but it does not create or mutate learner FSRS/Free state.</p>
  </header>

  <section class="controls">
    <form method="GET" class="control-grid">
      <label>
        <span>System</span>
        <select name="systemId" onchange={(event) => event.currentTarget.form?.requestSubmit()}>
          <option value="">Choose a System</option>
          {#each data.systems as system}
            <option value={system.id} selected={system.id === data.selectedSystemId}>{system.name}</option>
          {/each}
        </select>
      </label>

      <label>
        <span>Content</span>
        <select name="contentMode">
          <option value="original" selected={data.contentMode === 'original'}>Original questions</option>
          <option value="expanded" selected={data.contentMode === 'expanded'}>Expanded Learning</option>
        </select>
      </label>

      <label class="case-control">
        <span>Case</span>
        <select name="caseId" disabled={!data.selectedSystemId}>
          <option value="">Choose a Case</option>
          {#each data.candidates as candidate}
            <option value={candidate.id} selected={candidate.id === data.selectedCaseId}>{candidate.title}</option>
          {/each}
        </select>
      </label>

      <button class="button primary" type="submit" disabled={!data.selectedSystemId}>Preview Case</button>
    </form>
  </section>

  {#if data.preview}
    <section class="case-preview">
      <div class="case-meta"><span>{data.contentMode === 'expanded' ? 'Expanded Learning' : 'Original questions'}</span><span>{data.preview.snapshot.bytes.toLocaleString('en-US')} frozen-preview bytes</span></div>
      <h2>{data.preview.snapshot.case.title}</h2>
      {#if data.preview.snapshot.case.vignetteMd}<p class="vignette">{data.preview.snapshot.case.vignetteMd}</p>{/if}

      {#if data.preview.snapshot.assets.length}
        <section class="preview-section">
          <h3>Clinical stimulus</h3>
          <div class:single={data.preview.snapshot.assets.length === 1} class="asset-grid">
            {#each data.preview.snapshot.assets as asset}
              <figure>
                <div class="asset-stage"><img src={asset.imageUrl} alt={asset.altTextSnapshot ?? asset.captionSnapshotMd ?? 'Teaching image'} /></div>
                {#if asset.captionSnapshotMd}<figcaption>{asset.captionSnapshotMd}</figcaption>{/if}
              </figure>
            {/each}
          </div>
        </section>
      {/if}

      <section class="preview-section">
        <h3>Questions and answers</h3>
        <div class="question-list">
          {#each data.preview.snapshot.questions as question, index}
            <article class="question-card">
              <span class="question-number">{index + 1}</span>
              <div><h4>{question.promptSnapshotMd}</h4><p class="answer-label">Answer</p><p>{question.answerSnapshotMd}</p></div>
            </article>
          {/each}
        </div>
      </section>
    </section>
  {:else if data.selectedSystemId}
    <p class="empty-state">Choose a Case to preview. The candidate list is resolved from the current accepted System/Topic/Tag architecture.</p>
  {/if}
</main>

<style>
  .preview-shell { max-width:960px; display:grid; gap:1.5rem; }
  .preview-nav { display:flex; justify-content:space-between; gap:1rem; font-size:.9rem; }
  .preview-nav a { text-decoration:none; }
  header h1 { margin:.2rem 0 .5rem; }
  .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .intro { max-width:760px; line-height:1.6; }
  .controls,.case-preview { border:1px solid #dfe5ee; border-radius:14px; background:#fff; padding:1.15rem; }
  .control-grid { display:grid; grid-template-columns:1fr 1fr; gap:.9rem; align-items:end; }
  .control-grid label { display:grid; gap:.4rem; color:#344054; font-weight:700; font-size:.88rem; }
  .control-grid select { width:100%; min-height:42px; padding:.55rem .65rem; border:1px solid #cdd6e3; border-radius:9px; background:#fff; }
  .case-control { grid-column:1 / -1; }
  .case-preview { display:grid; gap:1.25rem; }
  .case-preview h2,.preview-section h3 { margin:0; }
  .case-meta { display:flex; flex-wrap:wrap; gap:.5rem; color:#667085; font-size:.85rem; font-weight:600; }
  .case-meta span { padding:.25rem .5rem; border-radius:999px; background:#eef2f6; }
  .vignette { margin:0; max-width:760px; line-height:1.65; color:#475467; }
  .preview-section { display:grid; gap:.85rem; }
  .asset-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
  .asset-grid.single { grid-template-columns:1fr; }
  figure { margin:0; display:grid; gap:.5rem; }
  .asset-stage { min-height:280px; display:grid; place-items:center; border:1px dashed #98a2b3; border-radius:12px; background:#eef2f6; }
  .asset-stage img { display:block; width:100%; max-height:500px; object-fit:contain; border-radius:10px; }
  figcaption { color:#667085; font-size:.88rem; }
  .question-list { display:grid; gap:.75rem; }
  .question-card { display:grid; grid-template-columns:auto 1fr; gap:.85rem; padding:1rem; border:1px solid #e3e8ef; border-radius:12px; }
  .question-number { display:grid; place-items:center; width:2rem; height:2rem; border-radius:999px; background:#172033; color:#fff; font-weight:700; }
  .question-card h4 { margin:.25rem 0 .8rem; }
  .question-card p { margin:.25rem 0; line-height:1.55; }
  .answer-label { color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
  .empty-state { margin:0; padding:1rem; border-radius:12px; background:#f8fafc; color:#475467; }
  @media (max-width:700px) { .control-grid,.asset-grid { grid-template-columns:1fr; } .case-control { grid-column:auto; } }
</style>
