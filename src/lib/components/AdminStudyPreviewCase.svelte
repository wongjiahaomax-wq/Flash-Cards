<script>
  let { preview, backHref, errorMessage = '' } = $props();
  let revealed = $state(false);
  /** @type {any} */
  let inspectedAsset = $state(null);
  /** @type {HTMLButtonElement|undefined} */
  let closeImageButton = $state();

  /** @param {any} asset */
  function openAssetInspection(asset) {
    inspectedAsset = asset;
  }

  function closeAssetInspection() {
    inspectedAsset = null;
  }

  /** @param {MouseEvent} event */
  function handleImageDialogClick(event) {
    if (event.target === event.currentTarget) closeAssetInspection();
  }

  /** @param {KeyboardEvent} event */
  function handleImageDialogKeydown(event) {
    if (event.key === 'Escape' && inspectedAsset) closeAssetInspection();
  }

  $effect(() => {
    if (inspectedAsset) requestAnimationFrame(() => closeImageButton?.focus());
  });
</script>

<svelte:window onkeydown={handleImageDialogKeydown} />

{#if errorMessage}
  <main class="shell preview-shell" data-direct-case-preview>
    <nav class="preview-nav" aria-label="Study preview navigation">
      <a href={backHref}>← Back to Case Editor</a>
      <span class="muted">Read-only Admin Study Preview</span>
    </nav>
    <section class="preview-error" role="alert">
      <p class="eyebrow">Admin Study Preview</p>
      <h1>Case preview unavailable</h1>
      <p>{errorMessage}</p>
      <a class="button primary" href={backHref}>Back to Case Editor</a>
    </section>
  </main>
{:else if preview}
  <main class="shell preview-shell" data-direct-case-preview>
    <nav class="preview-nav" aria-label="Study preview navigation">
      <a href={backHref}>← Back to Case Editor</a>
      <div class="preview-nav-status">
        <span class="muted">Read-only Admin Study Preview</span>
        <span class="preview-nav-divider" aria-hidden="true"></span>
        <span class="badge">Original questions</span>
      </div>
    </nav>

    <header class="case-header">
      <div class="case-meta"><span>Admin Study Preview</span><span class="badge">Original questions · curated for this Case</span></div>
      <h1>{revealed ? preview.snapshot.case.title : 'Case review'}</h1>
      {#if preview.snapshot.case.vignetteMd}<p>{preview.snapshot.case.vignetteMd}</p>{/if}
    </header>

    {#if preview.snapshot.assets.length > 0}
      <section class="review-section" aria-labelledby="assets-heading">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Clinical stimulus</p>
            <h2 id="assets-heading">{preview.snapshot.assets.length === 1 ? 'Image' : 'Images'}</h2>
          </div>
          {#if preview.snapshot.assets.length > 1}<span class="muted">{preview.snapshot.assets.length} images shown together</span>{/if}
        </div>
        <div class:singleAsset={preview.snapshot.assets.length === 1} class="asset-grid">
          {#each preview.snapshot.assets as asset}
            <figure>
              <div class="asset-stage">
                <button class="asset-image-button" type="button" aria-label="Inspect image" onclick={() => openAssetInspection(asset)}>
                  <img src={asset.imageUrl} alt={asset.altTextSnapshot ?? asset.captionSnapshotMd ?? 'Teaching image'} />
                </button>
                <button class="asset-inspect-button" type="button" aria-label="Inspect image" title="Inspect image" onclick={() => openAssetInspection(asset)}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
                </button>
              </div>
              {#if asset.captionSnapshotMd}<figcaption>{asset.captionSnapshotMd}</figcaption>{/if}
            </figure>
          {/each}
        </div>
      </section>
    {/if}

    {#if inspectedAsset}
      <div class="asset-modal-backdrop" role="presentation" onclick={handleImageDialogClick}>
        <div class="asset-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title" onclick={(event) => event.stopPropagation()}>
          <div class="asset-dialog-panel">
            <div class="asset-dialog-header">
              <div>
                <p class="eyebrow">Image inspection</p>
                <h2 id="asset-dialog-title">Enlarged teaching image</h2>
              </div>
              <button bind:this={closeImageButton} class="close-button" type="button" onclick={closeAssetInspection}>Close</button>
            </div>
            <div class="asset-dialog-image-wrap">
              <img class="asset-dialog-image" src={inspectedAsset.imageUrl} alt={inspectedAsset.altTextSnapshot ?? inspectedAsset.captionSnapshotMd ?? 'Teaching image'} />
            </div>
            {#if inspectedAsset.captionSnapshotMd}<p class="asset-dialog-caption">{inspectedAsset.captionSnapshotMd}</p>{/if}
          </div>
        </div>
      </div>
    {/if}

    <section class="review-section" aria-labelledby="questions-heading">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Question set</p>
          <h2 id="questions-heading">Questions</h2>
        </div>
        <span class="muted">Read-only preview</span>
      </div>
      <div class="question-list">
        {#each preview.snapshot.questions as question, index}
          <article class="question-card">
            <div class="question-number">{index + 1}</div>
            <div class="question-content">
              <h3>{question.promptSnapshotMd}</h3>
              {#if revealed}
                <div class="answer-block">
                  <p class="answer-label">Answer</p>
                  <p>{question.answerSnapshotMd}</p>
                </div>
              {:else}
                <p class="muted think-prompt">Think through your answer before revealing.</p>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </section>

    <section class="review-actions" aria-live="polite">
      {#if !revealed}
        <div>
          <strong>Ready to check?</strong>
          <p class="muted">Reveal all answers to inspect the saved learner content.</p>
        </div>
        <button class="button primary action-button" type="button" onclick={() => (revealed = true)}>Reveal answers</button>
      {:else}
        <div>
          <strong>Answers revealed</strong>
          <p class="muted">This Admin preview is read-only and does not create or complete learner Study state.</p>
        </div>
        <a class="button primary action-button" href={backHref}>Back to Case Editor</a>
      {/if}
    </section>
  </main>
{:else}
  <main class="shell preview-shell" data-direct-case-preview>
    <nav class="preview-nav" aria-label="Study preview navigation"><a href={backHref}>← Back to Case Editor</a></nav>
    <p class="preview-error" role="alert">This Case preview could not be loaded.</p>
  </main>
{/if}

<style>
  .preview-shell { display:grid; gap:1.5rem; max-width:920px; }
  .preview-nav { display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; font-size:.9rem; }
  .preview-nav a { text-decoration:none; }
  .preview-nav a:hover,.preview-nav a:focus-visible { text-decoration:underline; }
  .preview-nav-status { display:flex; align-items:center; justify-content:flex-end; gap:.75rem; flex-wrap:wrap; }
  .preview-nav-divider { width:1px; height:1.1rem; background:#d0d5dd; }
  .case-header { display:grid; gap:.75rem; padding-bottom:.5rem; }
  .case-header h1,.case-header p { margin:0; }
  .case-header h1 { font-size:clamp(1.8rem,4vw,2.5rem); line-height:1.12; }
  .case-header > p { max-width:760px; color:#475467; line-height:1.65; }
  .case-meta { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; color:#667085; font-size:.9rem; font-weight:600; }
  .badge { padding:.2rem .5rem; border-radius:999px; background:#eef2f6; color:#344054; font-size:.78rem; }
  .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .muted { color:#667085; }
  .review-section { display:grid; gap:1rem; }
  .section-heading { display:flex; align-items:end; justify-content:space-between; gap:1rem; }
  .section-heading h2 { margin:.15rem 0 0; }
  .asset-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1rem; }
  .asset-grid.singleAsset { grid-template-columns:minmax(0,1fr); }
  figure { margin:0; display:grid; gap:.55rem; }
  .asset-stage { position:relative; min-height:300px; display:grid; place-items:center; border:1px dashed #98a2b3; border-radius:14px; background:#eef2f6; }
  .asset-stage img { display:block; width:100%; max-height:520px; object-fit:contain; border-radius:12px; }
  .asset-image-button { display:grid; width:100%; height:100%; padding:.75rem; border:0; background:transparent; cursor:zoom-in; }
  .asset-image-button:focus-visible,.asset-inspect-button:focus-visible,.close-button:focus-visible { outline:3px solid rgba(52,64,84,.35); outline-offset:2px; }
  .asset-inspect-button { position:absolute; top:.75rem; right:.75rem; display:grid; place-items:center; width:2.25rem; height:2.25rem; padding:0; border:1px solid #cdd6e3; border-radius:999px; background:rgb(255 255 255 / 94%); color:#172033; cursor:zoom-in; box-shadow:0 2px 8px rgb(16 24 40 / 12%); }
  .asset-inspect-button svg { width:1.15rem; height:1.15rem; fill:none; stroke:currentColor; stroke-linecap:round; stroke-linejoin:round; stroke-width:2; }
  .singleAsset .asset-stage { min-height:390px; }
  figcaption { color:#667085; font-size:.88rem; }
  .asset-modal-backdrop { position:fixed; z-index:10; inset:0; display:grid; place-items:center; padding:1.5rem; background:rgb(16 24 40 / 78%); backdrop-filter:blur(3px); }
  .asset-dialog { box-sizing:border-box; width:min(92vw,1300px); max-width:calc(100vw - 2rem); max-height:calc(100vh - 2rem); overflow:hidden; border:1px solid rgb(255 255 255 / 45%); border-bottom:4px solid #172033; border-radius:18px; background:#fff; box-shadow:0 28px 90px rgb(16 24 40 / 38%); }
  .asset-dialog-panel { display:grid; gap:0; max-height:calc(100vh - 2rem - 4px); overflow:hidden; }
  .asset-dialog-header { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem 1.25rem; border-bottom:1px solid #dfe5ee; background:#fff; }
  .asset-dialog-header h2 { margin:.18rem 0 0; color:#172033; font-size:1.08rem; }
  .asset-dialog-image-wrap { display:grid; place-items:center; min-height:0; overflow:auto; padding:1.25rem 1.5rem 1.5rem; background:#f2f4f7; }
  .asset-dialog-image { display:block; width:100%; height:auto; max-width:1200px; max-height:calc(100vh - 10rem); border:1px solid #d0d5dd; border-radius:10px; background:#fff; box-shadow:0 12px 30px rgb(16 24 40 / 16%); object-fit:contain; }
  .asset-dialog-caption { margin:0; padding:.8rem 1.25rem 1rem; border-top:1px solid #dfe5ee; background:#fff; color:#667085; font-size:.9rem; line-height:1.5; }
  .close-button { padding:.6rem .95rem; border:1px solid #cdd6e3; border-radius:9px; background:#172033; color:#fff; font:inherit; font-weight:700; cursor:pointer; }
  .question-list { display:grid; gap:.85rem; }
  .question-card { display:grid; grid-template-columns:auto minmax(0,1fr); gap:1rem; padding:1.1rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .question-number { display:grid; place-items:center; width:2rem; height:2rem; border-radius:999px; background:#172033; color:#fff; font-weight:700; }
  .question-content h3 { margin:.25rem 0 0; font-size:1.05rem; line-height:1.45; }
  .think-prompt { margin:.65rem 0 0; font-size:.9rem; }
  .answer-block { display:grid; gap:.4rem; margin-top:.9rem; padding-top:.9rem; border-top:1px solid #e6eaf0; }
  .answer-block p { margin:0; line-height:1.55; }
  .answer-label { color:#344054; font-size:.78rem; font-weight:700; letter-spacing:.07em; text-transform:uppercase; }
  .review-actions { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:1rem 1.1rem; border:1px solid #cdd6e3; border-radius:14px; background:#fff; box-shadow:0 10px 30px rgba(23,32,51,.1); }
  .review-actions p { margin:.25rem 0 0; font-size:.9rem; }
  .action-button { min-width:150px; text-align:center; }
  .preview-error { margin:0; padding:1.25rem; border:1px solid #f0b7b1; border-radius:12px; background:#fff9f8; color:#7a271a; line-height:1.55; }
  .preview-error h1 { margin:.2rem 0 .5rem; color:#172033; }
  .preview-error .button { margin-top:.5rem; }
  .button { display:inline-block; padding:.7rem 1rem; border:1px solid #cdd6e3; border-radius:8px; background:#fff; color:#172033; text-decoration:none; cursor:pointer; font:inherit; }
  .button.primary { border-color:#172033; background:#172033; color:#fff; }
  button:focus-visible,a:focus-visible { outline:3px solid rgba(52,64,84,.25); outline-offset:2px; }
  @media (max-width:700px) {
    .section-heading,.review-actions { display:grid; align-items:stretch; }
    .asset-grid { grid-template-columns:1fr; }
    .asset-stage,.singleAsset .asset-stage { min-height:260px; }
    .asset-modal-backdrop { padding:.5rem; }
    .asset-dialog { width:calc(100vw - 1rem); max-height:calc(100vh - 1rem); }
    .asset-dialog-panel { max-height:calc(100vh - 1rem - 4px); }
    .asset-dialog-image-wrap { padding:.75rem .75rem 1rem; }
    .asset-dialog-image { max-height:calc(100vh - 9rem); }
    .action-button { width:100%; }
  }
</style>
