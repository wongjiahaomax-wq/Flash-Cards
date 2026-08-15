<script>
  import { onDestroy } from 'svelte';
  import { findClipboardImageFile, normalizeTeachingImageFile } from '$lib/image-upload.js';

  let { data, form } = $props();
  let fileInput = /** @type {HTMLInputElement | undefined} */ (undefined);
  let selectedFile = $state(/** @type {File | null} */ (null));
  let previewUrl = $state(/** @type {string | null} */ (null));
  let imageError = $state('');

  function clearPreview() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; }
  /** @param {File | null} file */
  function selectImage(file) {
    if (!file) return;
    const result = normalizeTeachingImageFile(file);
    if ('error' in result) { imageError = result.error; selectedFile = null; clearPreview(); return; }
    if (!fileInput || typeof DataTransfer === 'undefined') { imageError = 'Use the file picker to attach this image.'; return; }
    const transfer = new DataTransfer(); transfer.items.add(result.file); fileInput.files = transfer.files;
    selectedFile = result.file; imageError = ''; clearPreview(); previewUrl = URL.createObjectURL(result.file);
  }
  /** @param {ClipboardEvent} event */
  function handlePaste(event) { const file = findClipboardImageFile(event.clipboardData); if (!file) return; event.preventDefault(); selectImage(file); }
  /** @param {DragEvent} event */
  function handleDrop(event) { event.preventDefault(); selectImage(event.dataTransfer?.files?.[0] ?? null); }
  /** @param {DragEvent} event */
  function handleDragOver(event) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
  /** @param {Event} event */
  function handleFileChange(event) { selectImage(/** @type {HTMLInputElement} */ (event.currentTarget).files?.[0] ?? null); }
  onDestroy(clearPreview);
</script>

<svelte:head><title>New Case | Admin | Flash-Cards</title></svelte:head>

<section class="page-heading"><div><p class="eyebrow">Cases</p><h1>New Case</h1><p class="muted">Create the internal Case record before adding questions and images.</p></div><a class="button" href="/admin/cases">Back to Cases</a></section>

{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}

<section class="panel">
  {#if data.concepts.length === 0}
    <p class="empty-state">Create a topic before creating a Case.</p>
    <form method="POST" action="?/createConcept" class="topic-form"><label>Topic name<input name="name" maxlength="200" required placeholder="e.g. Cardiology" /></label><button class="button primary" type="submit">Create topic</button></form>
  {:else}
    <form method="POST" action="?/createCase" class="form-grid">
      <label>Internal Case title<input name="title" maxlength="300" required placeholder="e.g. ECG with anterior changes" /></label>
      <label>Primary topic / Concept<select name="concept_id" required>{#each data.concepts as concept}<option value={concept.id} selected={concept.id === data.selectedConceptId}>{concept.name}</option>{/each}</select></label>
      <label class="wide">Case stem / vignette <span class="muted">(optional)</span><textarea name="vignette_md" rows="8" maxlength="5000" placeholder="Context shown to the learner during review."></textarea></label>
      <div class="wide actions"><button class="button primary" type="submit">Create Case</button><a class="button" href="/admin/cases">Cancel</a></div>
    </form>
  {/if}
</section>

<section class="panel upload-panel">
  <div><p class="eyebrow">Asset library</p><h2>Upload an image first</h2><p class="muted">You can upload teaching images here before attaching them in a Case editor.</p></div>
  <form method="POST" action="?/upload" enctype="multipart/form-data" class="form-grid">
    <label class="wide dropzone" onpaste={handlePaste} ondrop={handleDrop} ondragover={handleDragOver}>Image file<input bind:this={fileInput} name="image" type="file" accept="image/jpeg,image/png" required onchange={handleFileChange} /><span class="muted">Paste, drop, or choose a JPEG/PNG image.</span>{#if selectedFile && previewUrl}<img src={previewUrl} alt="" width="160" height="110" />{/if}</label>
    {#if imageError}<p class="wide form-error" role="alert">{imageError}</p>{/if}
    <label>Alt text<input name="alt_text" maxlength="500" required /></label><label>Source label <span class="muted">(optional)</span><input name="source_label" maxlength="300" /></label><label>Source URL <span class="muted">(optional)</span><input name="source_url" type="url" maxlength="2000" /></label><label>Licence / permission <span class="muted">(optional)</span><input name="licence" maxlength="500" /></label><div class="wide"><button class="button primary" type="submit">Upload image</button></div>
  </form>
</section>

<style>
  .page-heading { display: flex; justify-content: space-between; align-items: end; gap: 1rem; } h1, p { margin-top: 0; } h1 { margin-bottom: 0.3rem; font-size: clamp(1.8rem, 4vw, 2.5rem); } .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; } .muted { color: #667085; }
  .button { display: inline-block; padding: 0.7rem 1rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; text-decoration: none; cursor: pointer; } .button.primary { border-color: #172033; background: #172033; color: #fff; } .form-error { margin: 1rem 0; padding: 0.75rem; border-radius: 8px; background: #fef3f2; color: #b42318; } .panel { margin-top: 1.5rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; } .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; } label { display: grid; gap: 0.4rem; color: #344054; font-weight: 650; } input, textarea, select { width: 100%; box-sizing: border-box; padding: 0.7rem 0.75rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; font: inherit; } textarea { resize: vertical; } .wide { grid-column: 1 / -1; } .actions, .topic-form { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: end; } .topic-form label { flex: 1; min-width: 220px; } .dropzone { gap: 0.5rem; padding: 0.9rem; border: 2px dashed #98a2b3; border-radius: 8px; cursor: pointer; } .dropzone img { width: 160px; height: 110px; object-fit: contain; border-radius: 6px; background: #eef2f6; } .upload-panel { background: #f8fafc; } .empty-state { padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; }
  @media (max-width: 600px) { .page-heading { align-items: start; flex-direction: column; } .form-grid { grid-template-columns: minmax(0, 1fr); } .wide { grid-column: auto; } }
</style>
