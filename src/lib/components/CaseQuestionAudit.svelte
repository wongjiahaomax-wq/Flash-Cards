<script>
  import AccessibleInfo from './AccessibleInfo.svelte';

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
    <div class="audit-table-wrap">
      <table>
        <thead><tr><th>#</th><th>Prompt</th><th>Source / scope</th><th>Answer</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {#each rows as row (row.key)}
            <tr>
              <td class="number" data-label="#">Q{row.number}</td>
              <td data-label="Prompt">{row.promptMd}</td>
              <td data-label="Source / scope">
                <div class="source-cell">
                  <span><strong>{row.sourceLabel}</strong><small>{row.sourceName}</small></span>
                  {#if row.preview}
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
                        {#if row.preview.type === 'image'}
                          {#if row.preview.image.imageUrl}
                            <button class="preview-image-button" type="button" onclick={() => onimageopen(row.preview.image, row.preview.subtitle)} aria-label={`Open ${row.sourceName} in full image viewer`}>
                              <img src={row.preview.image.imageUrl} alt={row.preview.image.altText ?? ''} loading="lazy" />
                            </button>
                          {:else}<span class="missing">Image unavailable</span>{/if}
                        {:else}
                          <span class="set-name">SET-WIDE · {row.sourceName}</span>
                          <span class="set-strip">
                            {#each row.preview.images as image (image.id ?? image.assetId)}
                              {#if image.imageUrl}
                                <button type="button" onclick={() => onimageopen(image, row.preview.subtitle)} aria-label={`Open ${image.originalFilename ?? 'set image'} in full image viewer`}><img src={image.imageUrl} alt={image.altText ?? ''} loading="lazy" /></button>
                              {/if}
                            {/each}
                          </span>
                        {/if}
                        <button class="close-preview" type="button" onclick={() => (pinnedKey = null)}>Close</button>
                      </span>
                    </span>
                  {/if}
                </div>
              </td>
              <td data-label="Answer">{row.answerMd}</td>
              <td class="actions-cell">{#if row.editTarget}<a href={`#${row.editTarget}`}>Edit</a>{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
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
  .audit-table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; color: #344054; font-size: 0.84rem; line-height: 1.45; }
  th { padding: 0.55rem 0.6rem; border-bottom: 1px solid #d0d5dd; color: #667085; font-size: 0.72rem; letter-spacing: 0.035em; text-align: left; text-transform: uppercase; }
  td { min-width: 120px; padding: 0.7rem 0.6rem; border-bottom: 1px solid #eaecf0; vertical-align: top; overflow-wrap: anywhere; }
  tbody tr:last-child td { border-bottom: 0; }
  .number { min-width: 2.5rem; width: 2.5rem; color: #667085; font-weight: 700; }
  .source-cell { display: flex; align-items: start; gap: 0.4rem; min-width: 150px; }
  .source-cell > span:first-child { display: grid; gap: 0.1rem; }
  .source-cell strong { color: #475467; font-size: 0.7rem; letter-spacing: 0.035em; }
  .source-cell small { color: #667085; font-size: 0.76rem; }
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
  .actions-cell { min-width: 3rem; width: 3rem; }
  .actions-cell a { color: #344054; font-size: 0.78rem; font-weight: 650; }
  button:focus-visible, a:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  @media (max-width: 720px) {
    .audit { padding: 0.85rem; }
    .audit-heading { flex-direction: column; }
    .audit-table-wrap { overflow: visible; }
    table, thead, tbody, tr, th, td { display: block; }
    thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
    tr { display: grid; gap: 0.5rem; padding: 0.8rem 0; border-bottom: 1px solid #d0d5dd; }
    tbody tr:last-child { border-bottom: 0; }
    td { display: grid; grid-template-columns: 5.25rem minmax(0, 1fr); gap: 0.5rem; min-width: 0; padding: 0; border: 0; }
    td::before { content: attr(data-label); color: #667085; font-size: 0.7rem; font-weight: 750; letter-spacing: 0.025em; text-transform: uppercase; }
    .number, .actions-cell { width: auto; min-width: 0; }
    .actions-cell::before { content: 'Action'; }
    .source-cell { min-width: 0; }
  }
</style>
