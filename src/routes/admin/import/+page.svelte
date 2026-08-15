<script>
  let { form } = /** @type {any} */ ($props());
  let confirmImport = $state(false);

  function fileChanged() {
    confirmImport = false;
  }
</script>

<svelte:head><title>Import package | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading">
  <div><p class="eyebrow">Reviewed content workflow</p><h1>Import package</h1><p class="muted">Upload a versioned Flash-Cards Import Package for validation and an administrator-confirmed import.</p></div>
</section>

{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}
{#if form?.issues?.length}<ul class="form-error">{#each (form.issues ?? []) as issue}<li>{issue}</li>{/each}</ul>{/if}
{#if form?.warnings?.length}<ul class="warning">{#each form.warnings as warning}<li>{warning}</li>{/each}</ul>{/if}

{#if form?.preview}
  <section class="panel preview" aria-live="polite">
    <p class="eyebrow">Dry run preview{form.packageId ? ` · ${form.packageId}` : ''}</p>
    <h2>No database writes occurred</h2>
    <p class="muted">This successful preview authorizes only this exact ZIP, for a short period. The confirm step rejects a different file.</p>
    <div class="count-grid">
      <span>Topics <strong>{form.preview.topics.create} create · {form.preview.topics.use} use · {form.preview.topics.skip} skip</strong></span>
      <span>Cases <strong>{form.preview.cases.create} create · {form.preview.cases.use} use · {form.preview.cases.skip} skip</strong></span>
      <span>Images to upload <strong>{form.preview.imagesToUpload}</strong></span>
      <span>Question Prompts <strong>{form.preview.questionPrompts}</strong></span>
      <span>Case Questions <strong>{form.preview.caseQuestions}</strong></span>
      <span>Topic Questions <strong>{form.preview.topicQuestions}</strong></span>
      <span>Primary Topic links <strong>{form.preview.primaryTopicLinks}</strong></span>
      <span>Secondary Topic links <strong>{form.preview.secondaryTopicLinks}</strong></span>
    </div>
  </section>
{/if}

{#if form?.result}
  <section class="panel success" aria-live="polite"><h2>Import complete</h2><p>Package <strong>{form.result.packageId}</strong> uploaded {form.result.uploadedImages} image(s) and applied {form.result.created} database operation(s).</p><p class="muted">If a retry is needed, run a fresh dry-run preview first. Stable package IDs and conflict checks prevent accidental duplication.</p></section>
{/if}

<section class="panel">
  <h2>1. Validate and preview</h2>
  <p class="muted">The ZIP must contain <code>manifest.json</code> and only declared files under <code>media/</code>. Preview validates the package without writing to D1 or R2.</p>
  <form method="POST" action="?/preview" enctype="multipart/form-data" class="form-grid">
    <label>Flash-Cards Import Package ZIP<input name="package" type="file" accept=".zip,application/zip" required onchange={fileChanged} /></label>
    <div class="actions"><button class="button primary" type="submit">Validate and preview</button></div>
  </form>
</section>

<section class="panel">
  <h2>2. Confirm and import</h2>
  <p class="muted">Select the exact ZIP that most recently passed preview. Its SHA-256 digest must match; validation then runs again immediately before any writes. Existing objects are never silently overwritten.</p>
  <form method="POST" action="?/import" enctype="multipart/form-data" class="form-grid">
    <label>Package ZIP<input name="package" type="file" accept=".zip,application/zip" required onchange={fileChanged} /></label>
    <label class="confirmation"><input name="confirm" type="checkbox" value="on" required bind:checked={confirmImport} /> I have reviewed the dry-run preview and explicitly confirm this import.</label>
    <div class="actions"><button class="button danger" type="submit">Import reviewed package</button></div>
  </form>
</section>

<style>
  .page-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  h1, h2, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } h2 { margin-bottom: 0.6rem; font-size: 1.15rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .panel { margin-top: 1.25rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .preview { border-color: #98a2b3; }
  .success { border-color: #75c58b; background: #f1fcf4; } .form-error, .warning { margin: 1rem 0; padding: 0.75rem 1rem; border-radius: 8px; } .form-error { background: #fef3f2; color: #b42318; } .warning { background: #fffaeb; color: #93370d; }
  .form-grid { display: grid; gap: 1rem; } label { display: grid; gap: 0.4rem; color: #344054; font-weight: 650; } input[type='file'] { padding: 0.65rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } .confirmation { display: flex; grid-template-columns: auto 1fr; align-items: center; gap: 0.6rem; } .confirmation input { width: 1rem; height: 1rem; }
  .count-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem; } .count-grid span { display: grid; gap: 0.2rem; padding: 0.7rem; border: 1px solid #eaecf0; border-radius: 8px; color: #667085; } .count-grid strong { color: #172033; }
  .actions { display: flex; gap: 0.6rem; align-items: center; } .button { padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; font: inherit; cursor: pointer; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .button.danger { border-color: #b42318; background: #b42318; color: #fff; }
  @media (max-width: 600px) { .count-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
