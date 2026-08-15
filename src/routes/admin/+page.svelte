<script>
  import { onDestroy } from 'svelte';

  import SignOutButton from '$lib/components/SignOutButton.svelte';
  import { findClipboardImageFile, normalizeTeachingImageFile } from '$lib/image-upload.js';

  let { data, form } = $props();
  let selectedCase = $derived(data.selectedCase);
  let fileInput = /** @type {HTMLInputElement | undefined} */ (undefined);
  let selectedFile = $state(/** @type {File | null} */ (null));
  let previewUrl = $state(/** @type {string | null} */ (null));
  let imageError = $state('');

  function clearPreviewUrl() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  /** @param {File | null} file */
  function selectImage(file) {
    if (!file) return;

    const result = normalizeTeachingImageFile(file);
    if ('error' in result) {
      imageError = result.error;
      selectedFile = null;
      clearPreviewUrl();
      if (fileInput) fileInput.value = '';
      return;
    }

    if (!fileInput || typeof DataTransfer === 'undefined') {
      imageError = 'This browser cannot attach the selected image. Please use the file picker.';
      return;
    }

    const transfer = new DataTransfer();
    transfer.items.add(result.file);
    fileInput.files = transfer.files;
    selectedFile = result.file;
    imageError = '';
    clearPreviewUrl();
    previewUrl = URL.createObjectURL(result.file);
  }

  /** @param {Event} event */
  function handleFileChange(event) {
    const input = /** @type {HTMLInputElement} */ (event.currentTarget);
    selectImage(input.files?.[0] ?? null);
  }

  /** @param {ClipboardEvent} event */
  function handlePaste(event) {
    const file = findClipboardImageFile(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    selectImage(file);
  }

  /** @param {DragEvent} event */
  function handleDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  /** @param {DragEvent} event */
  function handleDrop(event) {
    event.preventDefault();
    selectImage(event.dataTransfer?.files?.[0] ?? null);
  }

  function removeImage() {
    selectedFile = null;
    imageError = '';
    clearPreviewUrl();
    if (fileInput) fileInput.value = '';
  }

  function replaceImage() {
    removeImage();
    fileInput?.click();
  }

  /** @param {number} bytes */
  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  }

  onDestroy(clearPreviewUrl);
</script>

<svelte:head>
  <title>Admin | Flash-Cards</title>
</svelte:head>

<main class="shell stack">
  <section class="card stack">
    <div>
      <p class="muted">Administrator: {data.user.email}</p>
      <h1>Admin</h1>
      <p>Upload reusable teaching images, then connect them to existing Cases for learner study.</p>
    </div>

    <div class="actions">
      <a class="button" href="/study">Study topics</a>
      <a class="button" href="/">Home</a>
      <SignOutButton />
    </div>
  </section>

  {#if form?.error}
    <p class="form-error" role="alert">{form.error}</p>
  {/if}

  <section class="card stack" aria-labelledby="upload-heading">
    <div>
      <p class="eyebrow">Asset pipeline</p>
      <h2 id="upload-heading">Upload teaching image</h2>
      <p class="muted">JPEG and PNG only, up to 5 MiB per image. Source details are optional.</p>
    </div>

    <form method="POST" action="?/upload" enctype="multipart/form-data" class="stack">
      <label
        class="upload-dropzone"
        for="image-input"
        aria-label="Paste, drop, or choose an image"
        onpaste={handlePaste}
        ondrop={handleDrop}
        ondragover={handleDragOver}
      >
        <input
          id="image-input"
          class="visually-hidden"
          name="image"
          type="file"
          accept="image/jpeg,image/png"
          required
          bind:this={fileInput}
          onchange={handleFileChange}
          aria-describedby="image-help image-error"
        />
        {#if selectedFile && previewUrl}
          <div class="selected-image" aria-live="polite">
            <img src={previewUrl} alt="" />
            <div class="selected-image-details">
              <strong>{selectedFile.name}</strong>
              <span>{selectedFile.type} · {formatBytes(selectedFile.size)}</span>
            </div>
          </div>
        {:else}
          <div class="upload-prompt">
            <strong>Paste, drop, or choose an image</strong>
            <span>Ctrl+V / Cmd+V supported</span>
            <span>JPEG or PNG, maximum 5 MiB</span>
            <span class="button">Choose file</span>
          </div>
        {/if}
      </label>
      {#if selectedFile && previewUrl}
        <div class="selected-image-actions actions">
          <button class="button small" type="button" onclick={removeImage}>Remove image</button>
          <button class="button small" type="button" onclick={replaceImage}>Replace image</button>
        </div>
      {/if}
      <p id="image-help" class="muted upload-help">Click the area first if you want to paste from your clipboard.</p>
      {#if imageError}<p id="image-error" class="form-error" role="alert">{imageError}</p>{/if}
      <label>
        Alt text
        <input name="alt_text" type="text" maxlength="500" required />
      </label>
      <label>
        Source label <span class="muted">(optional)</span>
        <input name="source_label" type="text" maxlength="300" />
      </label>
      <label>
        Source URL <span class="muted">(optional reference only)</span>
        <input name="source_url" type="url" maxlength="2000" />
      </label>
      <label>
        Licence / permission <span class="muted">(optional)</span>
        <input name="licence" type="text" maxlength="500" />
      </label>
      <button class="button primary" type="submit">Upload image</button>
    </form>
  </section>

  <section class="card stack" aria-labelledby="cases-heading">
    <div id="topic-create" class="topic-create">
      <div>
        <p class="eyebrow">Primary topic</p>
        <h2>Create a topic</h2>
        <p class="muted">Create the active topic that will organize a Case. Only the name is needed for now.</p>
      </div>
      <form method="POST" action="?/createConcept" class="topic-form">
        <label for="topic-name">Topic name</label>
        <div class="picker-row">
          <input id="topic-name" name="name" type="text" maxlength="200" required placeholder="e.g. Chest pain" />
          <button class="button" type="submit">Create topic</button>
        </div>
      </form>
    </div>

    <div id="case-create" class="case-create">
      <div>
        <p class="eyebrow">New Case</p>
        <h2>Create Case</h2>
        <p class="muted">The internal title is for administrators and is not shown to learners before reveal.</p>
      </div>
      {#if data.concepts.length === 0}
        <p class="empty-state">Create a topic above before creating a Case.</p>
      {:else}
        <form method="POST" action="?/createCase" class="stack">
          <label>
            Internal Case title
            <input name="title" type="text" maxlength="300" required placeholder="e.g. ECG with anterior changes" />
          </label>
          <label>
            Case stem / vignette <span class="muted">(optional)</span>
            <textarea name="vignette_md" rows="5" maxlength="5000" placeholder="Optional context for the learner's case review."></textarea>
          </label>
          <label>
            Primary topic / Concept
            <select name="concept_id" required>
              {#each data.concepts as concept}
                <option value={concept.id} selected={concept.id === data.selectedConceptId}>{concept.name}</option>
              {/each}
            </select>
          </label>
          <button class="button primary" type="submit">Create Case</button>
        </form>
      {/if}
    </div>

    <div>
      <p class="eyebrow">Case content</p>
      <h2 id="cases-heading">Connect images to a Case</h2>
      <p class="muted">Choose an existing active Case to manage its ordered teaching images and captions.</p>
    </div>

    {#if data.cases.length === 0}
      <p class="muted">No active Cases are available.</p>
    {:else}
      <form method="GET" class="case-picker">
        <label for="case-select">Case</label>
        <div class="picker-row">
          <select id="case-select" name="case">
            {#each data.cases as item}
              <option value={item.id} selected={selectedCase?.case.id === item.id}>
                {item.title}{item.conceptName ? ` · ${item.conceptName}` : ''}
              </option>
            {/each}
          </select>
          <button class="button" type="submit">Open Case</button>
        </div>
      </form>

      {#if selectedCase}
        <div class="case-header">
          <div>
            <h3>{selectedCase.case.title}</h3>
            {#if selectedCase.case.conceptName}<p class="muted">Topic: {selectedCase.case.conceptName}</p>{/if}
            <form method="POST" action="?/vignette" class="vignette-form">
              <input type="hidden" name="case_id" value={selectedCase.case.id} />
              <label>
                Case stem / vignette <span class="muted">(editable)</span>
                <textarea name="vignette_md" rows="4" maxlength="5000" placeholder="Optional context for the learner's case review.">{selectedCase.case.vignetteMd ?? ''}</textarea>
              </label>
              <button class="button small" type="submit">Save Case stem</button>
            </form>
          </div>
          <a class="button" href="/study">Preview in Study</a>
        </div>

        <section class="question-panel" aria-labelledby="questions-heading">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Case questions</p>
              <h3 id="questions-heading">Questions <span class="count">{selectedCase.questions.length}</span></h3>
            </div>
            <span class="muted">Case-specific answers take precedence over topic answers.</span>
          </div>

          <form method="POST" action="?/saveQuestion" class="question-form">
            <input type="hidden" name="case_id" value={selectedCase.case.id} />
            <label>
              Add question prompt
              <textarea name="prompt_md" rows="2" maxlength="2000" required placeholder="e.g. ECG finding"></textarea>
            </label>
            <label>
              Answer
              <textarea name="answer_md" rows="3" maxlength="5000" required placeholder="e.g. Prolonged QTc"></textarea>
            </label>
            <label class="checkbox-label">
              <input name="reusable_for_topic" type="checkbox" />
              <span>Reusable for this topic</span>
            </label>
            <p class="muted form-note">When selected, the answer is also saved for this Case's primary topic.</p>
            <button class="button primary" type="submit">Add question</button>
          </form>

          {#if selectedCase.questions.length === 0}
            <p class="muted empty-state">No questions yet. Add the prompts and answers learners should review.</p>
          {:else}
            <div class="question-list">
              {#each selectedCase.questions as question, index}
                <article class="question-card">
                  <div class="question-heading">
                    <span class="order-badge">{index + 1}</span>
                    <div>
                      <strong>Question {index + 1}</strong>
                      {#if question.reusableForTopic}<span class="topic-badge">Reusable for {selectedCase.case.conceptName}</span>{/if}
                    </div>
                  </div>
                  <form method="POST" action="?/saveQuestion" class="question-form">
                    <input type="hidden" name="case_id" value={selectedCase.case.id} />
                    <input type="hidden" name="original_prompt_id" value={question.questionPromptId} />
                    <label>
                      Prompt
                      <textarea name="prompt_md" rows="2" maxlength="2000" required>{question.promptMd}</textarea>
                    </label>
                    <label>
                      Answer
                      <textarea name="answer_md" rows="3" maxlength="5000" required>{question.answerMd}</textarea>
                    </label>
                    <label class="checkbox-label">
                      <input name="reusable_for_topic" type="checkbox" checked={question.reusableForTopic} />
                      <span>Reusable for this topic</span>
                    </label>
                    <div class="question-actions">
                      <button class="button small" type="submit">Save question</button>
                    </div>
                  </form>
                  <div class="question-actions">
                    <div class="move-actions">
                      <form method="POST" action="?/reorderQuestion">
                        <input type="hidden" name="case_id" value={selectedCase.case.id} />
                        <input type="hidden" name="prompt_id" value={question.questionPromptId} />
                        <input type="hidden" name="direction" value="up" />
                        <button class="button small" type="submit" disabled={index === 0}>Move up</button>
                      </form>
                      <form method="POST" action="?/reorderQuestion">
                        <input type="hidden" name="case_id" value={selectedCase.case.id} />
                        <input type="hidden" name="prompt_id" value={question.questionPromptId} />
                        <input type="hidden" name="direction" value="down" />
                        <button class="button small" type="submit" disabled={index === selectedCase.questions.length - 1}>Move down</button>
                      </form>
                    </div>
                    <form method="POST" action="?/removeQuestion">
                      <input type="hidden" name="case_id" value={selectedCase.case.id} />
                      <input type="hidden" name="prompt_id" value={question.questionPromptId} />
                      <button class="button danger" type="submit">Remove</button>
                    </form>
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </section>

        <div class="manager-grid">
          <section class="manager-panel" aria-labelledby="attached-heading">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Learner order</p>
                <h3 id="attached-heading">Attached images <span class="count">{selectedCase.attached.length}</span></h3>
              </div>
              <span class="muted">Move up/down to change display order.</span>
            </div>

            {#if selectedCase.attached.length === 0}
              <p class="muted empty-state">No images attached yet. Choose one from Available assets.</p>
            {:else}
              <div class="asset-list">
                {#each selectedCase.attached as asset, index}
                  <article class="asset-card attached-card">
                    <div class="asset-topline">
                      <span class="order-badge">{index + 1}</span>
                      {#if asset.imageUrl}
                        <img src={asset.imageUrl} alt={asset.altText ?? ''} width="140" height="100" />
                      {:else}
                        <div class="inactive-image">Inactive image</div>
                      {/if}
                      <div class="asset-details">
                        <strong>{asset.originalFilename ?? asset.assetId}</strong>
                        <span class="metadata">{asset.altText || 'No alt text'}</span>
                        {#if asset.sourceLabel}<span class="metadata">Source: {asset.sourceLabel}</span>{/if}
                        {#if asset.sourceUrl}<a class="metadata" href={asset.sourceUrl} target="_blank" rel="noreferrer">Reference source ↗</a>{/if}
                        {#if asset.licence}<span class="metadata">Licence: {asset.licence}</span>{/if}
                        {#if !asset.isActive}<span class="warning">Asset inactive; it cannot be shown to learners.</span>{/if}
                      </div>
                    </div>

                    <form method="POST" action="?/caption" class="caption-form">
                      <input type="hidden" name="case_id" value={selectedCase.case.id} />
                      <input type="hidden" name="asset_id" value={asset.assetId} />
                      <label>
                        Case-specific caption <span class="muted">(optional)</span>
                        <textarea name="caption" rows="2" maxlength="1000" placeholder="What should the learner notice?">{asset.captionMd ?? ''}</textarea>
                      </label>
                      <button class="button" type="submit">Save caption</button>
                    </form>
                    <div class="asset-actions">
                      <div class="move-actions">
                          <form method="POST" action="?/reorder">
                            <input type="hidden" name="case_id" value={selectedCase.case.id} />
                            <input type="hidden" name="asset_id" value={asset.assetId} />
                            <input type="hidden" name="direction" value="up" />
                            <button class="button small" type="submit" disabled={index === 0}>Move up</button>
                          </form>
                          <form method="POST" action="?/reorder">
                            <input type="hidden" name="case_id" value={selectedCase.case.id} />
                            <input type="hidden" name="asset_id" value={asset.assetId} />
                            <input type="hidden" name="direction" value="down" />
                            <button class="button small" type="submit" disabled={index === selectedCase.attached.length - 1}>Move down</button>
                          </form>
                      </div>
                      <form method="POST" action="?/detach">
                        <input type="hidden" name="case_id" value={selectedCase.case.id} />
                        <input type="hidden" name="asset_id" value={asset.assetId} />
                        <button class="button danger" type="submit">Remove</button>
                      </form>
                    </div>
                  </article>
                {/each}
              </div>
            {/if}
          </section>

          <section class="manager-panel" aria-labelledby="available-heading">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">Uploaded library</p>
                <h3 id="available-heading">Available assets <span class="count">{selectedCase.available.length}</span></h3>
              </div>
              <span class="muted">Attach without re-uploading.</span>
            </div>

            {#if selectedCase.available.length === 0}
              <p class="muted empty-state">All active uploaded images are attached to this Case.</p>
            {:else}
              <div class="asset-list">
                {#each selectedCase.available as asset}
                  <article class="asset-card">
                    <div class="asset-topline">
                      <img src={asset.imageUrl} alt={asset.altText ?? ''} width="140" height="100" />
                      <div class="asset-details">
                        <strong>{asset.originalFilename ?? asset.assetId}</strong>
                        <span class="metadata">{asset.altText || 'No alt text'}</span>
                        {#if asset.sourceLabel}<span class="metadata">Source: {asset.sourceLabel}</span>{/if}
                        {#if asset.sourceUrl}<a class="metadata" href={asset.sourceUrl} target="_blank" rel="noreferrer">Reference source ↗</a>{/if}
                        {#if asset.licence}<span class="metadata">Licence: {asset.licence}</span>{/if}
                      </div>
                    </div>
                    <form method="POST" action="?/attach">
                      <input type="hidden" name="case_id" value={selectedCase.case.id} />
                      <input type="hidden" name="asset_id" value={asset.assetId} />
                      <button class="button primary" type="submit">Attach to Case</button>
                    </form>
                  </article>
                {/each}
              </div>
            {/if}
          </section>
        </div>
      {/if}
    {/if}
  </section>

  <section class="card stack" aria-labelledby="assets-heading">
    <div>
      <p class="eyebrow">Stored assets</p>
      <h2 id="assets-heading">Teaching images</h2>
    </div>
    {#if data.assets.length === 0}
      <p class="muted">No teaching images have been uploaded yet.</p>
    {:else}
      <div class="asset-list compact-list">
        {#each data.assets as asset}
          <article class="asset-card">
            <div class="asset-topline">
              <img src={asset.imageUrl} alt={asset.altText ?? ''} width="120" height="86" />
              <div class="asset-details">
                <strong>{asset.originalFilename ?? asset.id}</strong>
                <span class="metadata">{asset.altText || 'No alt text'}</span>
                {#if asset.sourceLabel}<span class="metadata">Source: {asset.sourceLabel}</span>{/if}
                {#if asset.sourceUrl}<a class="metadata" href={asset.sourceUrl} target="_blank" rel="noreferrer">Reference source ↗</a>{/if}
                {#if asset.licence}<span class="metadata">Licence: {asset.licence}</span>{/if}
              </div>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  h2, h3, p { margin-top: 0; }
  h2 { margin-bottom: 0.15rem; }
  h3 { margin-bottom: 0.2rem; }
  .eyebrow { margin: 0; color: #667085; font-size: 0.76rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  label { display: grid; gap: 0.35rem; color: #344054; font-weight: 600; }
  input, textarea, select { width: 100%; box-sizing: border-box; border: 1px solid #d0d5dd; border-radius: 8px; padding: 0.65rem 0.75rem; font: inherit; background: #fff; }
  textarea { resize: vertical; }
  .form-error { margin: 0; padding: 0.75rem; color: #b42318; background: #fef3f2; border-radius: 8px; }
  .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .upload-dropzone { display: grid; gap: 0.75rem; padding: 1.5rem; border: 2px dashed #98a2b3; border-radius: 12px; background: #f8fafc; cursor: pointer; }
  .upload-dropzone:focus-visible { outline: 3px solid #84adff; outline-offset: 3px; }
  .upload-prompt { display: grid; justify-items: center; gap: 0.35rem; color: #475467; text-align: center; }
  .upload-prompt strong { color: #172033; font-size: 1.05rem; }
  .upload-prompt .button { display: inline-block; margin-top: 0.45rem; }
  .upload-help { margin: -0.45rem 0 0; font-size: 0.85rem; }
  .selected-image { display: grid; grid-template-columns: minmax(0, 180px) minmax(0, 1fr); align-items: center; gap: 1rem; }
  .selected-image img { display: block; width: 100%; max-height: 180px; object-fit: contain; border-radius: 8px; background: #eef2f6; }
  .selected-image-details { display: grid; gap: 0.35rem; min-width: 0; color: #475467; }
  .selected-image-details strong { overflow-wrap: anywhere; color: #172033; }
  .case-picker { display: grid; gap: 0.4rem; }
  .picker-row { display: flex; gap: 0.75rem; }
  .picker-row select { min-width: 0; }
  .topic-create, .case-create { display: grid; gap: 0.85rem; padding: 1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #f8fafc; }
  .topic-create { grid-template-columns: minmax(0, 1fr) minmax(280px, 0.9fr); align-items: end; }
  .topic-form { display: grid; gap: 0.4rem; }
  .topic-form label { font-size: 0.9rem; }
  .vignette-form { display: grid; gap: 0.65rem; max-width: 680px; margin-top: 1rem; }
  .question-panel { display: grid; gap: 0.85rem; padding: 1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #f8fafc; }
  .question-form { display: grid; gap: 0.65rem; }
  .question-list { display: grid; gap: 0.8rem; }
  .question-card { display: grid; gap: 0.75rem; padding: 0.8rem; border: 1px solid #eaecf0; border-radius: 10px; background: #fff; }
  .question-heading { display: flex; align-items: center; gap: 0.65rem; }
  .question-heading > div { display: grid; gap: 0.2rem; }
  .topic-badge { color: #475467; font-size: 0.8rem; }
  .checkbox-label { display: flex; grid-template-columns: auto 1fr; align-items: center; gap: 0.5rem; font-weight: 500; }
  .checkbox-label input { width: auto; }
  .form-note { margin: -0.35rem 0 0; font-size: 0.82rem; }
  .question-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .case-header { display: flex; justify-content: space-between; align-items: start; gap: 1rem; padding: 1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #f8fafc; }
  .case-header p { margin-bottom: 0; }
  .manager-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  .manager-panel { display: grid; align-content: start; gap: 0.85rem; min-width: 0; }
  .panel-heading { display: flex; justify-content: space-between; align-items: end; gap: 0.75rem; }
  .panel-heading > .muted { font-size: 0.8rem; text-align: right; }
  .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .asset-list { display: grid; gap: 0.8rem; }
  .asset-card { display: grid; gap: 0.75rem; padding: 0.8rem; border: 1px solid #eaecf0; border-radius: 10px; background: #fff; }
  .asset-topline { display: flex; align-items: start; gap: 0.75rem; min-width: 0; }
  .asset-card img, .inactive-image { flex: 0 0 140px; width: 140px; height: 100px; object-fit: contain; border-radius: 7px; background: #f2f4f7; }
  .inactive-image { display: grid; place-items: center; color: #667085; font-size: 0.8rem; text-align: center; }
  .asset-details { display: grid; gap: 0.2rem; min-width: 0; font-size: 0.86rem; }
  .metadata { color: #667085; overflow-wrap: anywhere; }
  .metadata[href] { color: #344054; }
  .warning { color: #b54708; font-size: 0.8rem; }
  .order-badge { display: grid; place-items: center; flex: 0 0 1.6rem; height: 1.6rem; border-radius: 999px; background: #172033; color: #fff; font-size: 0.8rem; font-weight: 700; }
  .caption-form { display: grid; gap: 0.65rem; }
  .asset-actions, .move-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .asset-actions > form { display: contents; }
  .move-actions { margin-left: auto; }
  .button.small { padding: 0.5rem 0.65rem; font-size: 0.82rem; }
  .button.danger { color: #b42318; border-color: #fecdca; }
  button:disabled { cursor: not-allowed; opacity: 0.45; }
  .empty-state { padding: 1rem; border: 1px dashed #d0d5dd; border-radius: 8px; }
  .compact-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }

  @media (max-width: 760px) {
    .manager-grid, .compact-list { grid-template-columns: minmax(0, 1fr); }
    .topic-create { grid-template-columns: minmax(0, 1fr); }
    .case-header, .panel-heading { align-items: start; flex-direction: column; }
    .panel-heading > .muted { text-align: left; }
    .picker-row { align-items: stretch; flex-direction: column; }
    .move-actions { margin-left: 0; }
  }

  @media (max-width: 480px) {
    .selected-image { grid-template-columns: minmax(0, 1fr); }
    .asset-topline { flex-wrap: wrap; }
    .asset-card img, .inactive-image { flex-basis: 100%; width: 100%; height: 160px; }
    .order-badge { order: -1; }
    .asset-actions { align-items: stretch; flex-direction: column; }
    .move-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .move-actions form, .move-actions button, .asset-actions > form button { width: 100%; }
  }
</style>
