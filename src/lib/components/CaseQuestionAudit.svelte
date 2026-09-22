<script>
  import AccessibleInfo from './AccessibleInfo.svelte';
  import MarkdownContent from '$lib/components/MarkdownContent.svelte';

  /** @typedef {{ id?: string, assetId?: string, imageUrl?: string | null, altText?: string | null, originalFilename?: string | null }} PreviewImage */
  /** @typedef {{ key: string, number: number, promptMd: string, answerMd: string, sourceType: string, sourceLabel: string, sourceName: string, editTarget?: string | null, preview?: { type: 'image', image: PreviewImage, subtitle: string } | { type: 'set', images: PreviewImage[], subtitle: string } | null }} AuditRow */
  /** @type {{ rows?: AuditRow[], onimageopen?: (image: PreviewImage, subtitle: string) => void }} */
  let { rows = [], onimageopen = () => {} } = $props();
  /** @type {string | null} */
  let pinnedKey = $state(null);

  /** @param {string} key */
  function togglePreview(key) {
    pinnedKey = pinnedKey === key ? null : key;
  }

  /** @param {KeyboardEvent} event */
  function previewKeydown(event) {
    if (event.key !== 'Escape') return;
    pinnedKey = null;
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.blur();
  }
</script>

<section id="all-questions" class="audit" aria-labelledby="all-questions-heading">
  <div class="audit-heading">
    <div>
      <p class="eyebrow">Final Case audit</p>
      <h2 id="all-questions-heading">All questions in this Case <span class="count">{rows.length}</span></h2>
    </div>
    <AccessibleInfo label="All questions in this Case" text="This Admin-only audit is a deterministic projection of current active Case-wide, set-wide, exact-image, and explicitly-used reusable image questions. It does not create a new learner order or question model." />
  </div>

  {#if rows.length === 0}
    <p class="empty">No active Case-participating questions are currently available.</p>
  {:else}
    <div class="audit-list">
      {#each rows as row (row.key)}
        <article class="audit-card">
          <div class="audit-card-heading">
            <div class="question-identity">
              <span class="number">Q{row.number}</span>
              <div>
                <strong>Question {row.number}</strong>
                <div class="source-cell">
                  <span class="source-label">{row.sourceLabel}</span>
                  <span class="source-name">{row.sourceName}</span>
                  {#if row.preview}
                    {@const preview = row.preview}
                    <span class="source-preview" class:pinned={pinnedKey === row.key}>
                      <button
                        type="button"
                        class="preview-trigger"
                        aria-label={`Preview source for Q${row.number}: ${row.sourceName}`}
                        aria-expanded={pinnedKey === row.key}
                        onclick={() => togglePreview(row.key)}
                        onkeydown={previewKeydown}
                      >▧</button>
                      <span class="preview-popover" role="group" aria-label={`Source preview for ${row.sourceName}`}>
                        {#if preview.type === 'image'}
                          {@const imagePreview = preview}
                          {#if imagePreview.image.imageUrl}
                            <button class="preview-image-button" type="button" onclick={() => onimageopen(imagePreview.image, imagePreview.subtitle)} aria-label={`Open ${row.sourceName} in full image viewer`}>
                              <img src={imagePreview.image.imageUrl} alt={imagePreview.image.altText ?? ''} loading="lazy" />
                            </button>
                          {:else}<span class="missing">Image unavailable</span>{/if}
                        {:else}
                          {@const setPreview = preview}
                          <span class="set-name">SET-WIDE · {row.sourceName}</span>
                          <span class="set-strip">
                            {#each setPreview.images as image (image.id ?? image.assetId)}
                              {#if image.imageUrl}
                                <button type="button" onclick={() => onimageopen(image, setPreview.subtitle)} aria-label={`Open ${image.originalFilename ?? 'set image'} in full image viewer`}><img src={image.imageUrl} alt={image.altText ?? ''} loading="lazy" /></button>
                              {/if}
                            {/each}
                          </span>
                        {/if}
                        <button class="close-preview" type="button" onclick={() => (pinnedKey = null)}>Close</button>
                      </span>
                    </span>
                  {/if}
                </div>
              </div>
            </div>
            {#if row.editTarget}<a class="edit-link" href={`#${row.editTarget}`}>Edit</a>{/if}
          </div>

          <div class="audit-content">
            <section class="audit-field" aria-labelledby={`audit-prompt-${row.key}`}>
              <h3 id={`audit-prompt-${row.key}`}>Prompt</h3>
              <MarkdownContent source={row.promptMd} />
            </section>
            <section class="audit-field answer-field" aria-labelledby={`audit-answer-${row.key}`}>
              <h3 id={`audit-answer-${row.key}`}>Answer</h3>
              <MarkdownContent source={row.answerMd} />
            </section>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .audit { display: grid; gap: 0.85rem; margin-top: 1rem; padding: 1.1rem; border: 1px solid #dfe5ee; border-radius: 10px; background: #fff; scroll-margin-top: 5rem; }
  .audit-heading { display: flex; justify-content: space-between; align-items: start; gap: 0.75rem; }
  h2, p { margin-top: 0; } h2 { margin-bottom: 0; font-size: 1.2rem; }
  .eyebrow { margin-bottom: 0.3rem; color: #667085; font-size: 0.74rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
  .count { color: #667085; font-size: 0.85rem; font-weight: 500; }
  .empty { margin: 0; color: #667085; }
  .audit-list { display: grid; gap: 0.75rem; }
  .audit-card { display: grid; gap: 0.85rem; padding: 0.9rem; border: 1px solid #dfe5ee; border-radius: 9px; background: #fff; }
  .audit-card-heading { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
  .question-identity { display: flex; align-items: start; gap: 0.65rem; min-width: 0; }
  .question-identity > div { min-width: 0; }
  .number { display: inline-grid; flex: 0 0 auto; width: 2rem; height: 2rem; place-items: center; border-radius: 999px; background: #172033; color: #fff; font-size: 0.78rem; font-weight: 750; }
  .source-cell { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem; margin-top: 0.25rem; }
  .source-label { color: #475467; font-size: 0.7rem; font-weight: 750; letter-spacing: 0.035em; }
  .source-name { color: #667085; font-size: 0.78rem; }
  .edit-link { flex: 0 0 auto; color: #344054; font-size: 0.8rem; font-weight: 650; }
  .audit-content { display: grid; grid-template-columns: minmax(13rem, 0.38fr) minmax(0, 1fr); gap: 1rem; padding-top: 0.85rem; border-top: 1px solid #eaecf0; }
  .audit-field { min-width: 0; }
  .audit-field h3 { margin: 0 0 0.45rem; color: #667085; font-size: 0.7rem; font-weight: 750; letter-spacing: 0.06em; text-transform: uppercase; }
  .audit-field :global(.markdown-content) { color: #344054; font-size: 0.86rem; }
  .audit-field :global(.markdown-content p), .audit-field :global(.markdown-content ul), .audit-field :global(.markdown-content ol) { margin-top: 0.35rem; margin-bottom: 0.55rem; }
  .answer-field { padding-left: 1rem; border-left: 1px solid #eaecf0; }
  .source-preview { position: relative; flex: 0 0 auto; }
  .preview-trigger { width: 1.55rem; height: 1.55rem; padding: 0; border: 1px solid #d0d5dd; border-radius: 5px; background: #fff; color: #475467; cursor: pointer; font: inherit; }
  .preview-popover { position: absolute; z-index: 30; top: calc(100% + 0.35rem); left: 0; display: grid; gap: 0.4rem; width: min(260px, calc(100vw - 2rem)); padding: 0.55rem; border: 1px solid #d0d5dd; border-radius: 8px; background: #fff; box-shadow: 0 10px 30px rgb(16 24 40 / 18%); opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(-0.2rem); transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease; }
  .source-preview:hover .preview-popover, .source-preview:focus-within .preview-popover, .source-preview.pinned .preview-popover { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0); }
  .preview-image-button { width: 100%; height: 145px; padding: 0; overflow: hidden; border: 0; border-radius: 6px; background: #eef2f6; cursor: zoom-in; }
  .preview-image-button img { width: 100%; height: 100%; object-fit: contain; }
  .set-name { color: #475467; font-size: 0.7rem; font-weight: 750; }
  .set-strip { display: flex; gap: 0.3rem; overflow-x: auto; }
  .set-strip button { flex: 0 0 82px; width: 82px; height: 64px; padding: 0; overflow: hidden; border: 1px solid #e4e7ec; border-radius: 5px; background: #eef2f6; cursor: zoom-in; }
  .set-strip img { width: 100%; height: 100%; object-fit: contain; }
  .close-preview { justify-self: end; padding: 0.25rem 0.4rem; border: 0; background: transparent; color: #475467; cursor: pointer; font: inherit; font-size: 0.72rem; }
  .missing { display: grid; place-items: center; min-height: 90px; background: #eef2f6; color: #667085; font-size: 0.78rem; }
  button:focus-visible, a:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  @media (max-width: 720px) {
    .audit { padding: 0.85rem; }
    .audit-heading { flex-direction: column; }
    .audit-card-heading { gap: 0.65rem; }
    .audit-content { grid-template-columns: 1fr; gap: 0.8rem; }
    .answer-field { padding-top: 0.8rem; padding-left: 0; border-top: 1px solid #eaecf0; border-left: 0; }
  }
</style>
