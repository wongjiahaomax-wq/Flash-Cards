<script>
  /** @typedef {{ src: string, alt?: string | null, title?: string | null, subtitle?: string | null }} ViewerImage */
  /** @type {{ image?: ViewerImage | null, onclose?: () => void }} */
  let { image = null, onclose = () => {} } = $props();
  /** @type {HTMLDialogElement | undefined} */
  let dialog = $state();
  /** @type {HTMLButtonElement | undefined} */
  let closeButton = $state();

  $effect(() => {
    if (image && dialog && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => closeButton?.focus());
    } else if (!image && dialog?.open) {
      dialog.close();
    }
  });

  function closeViewer() {
    if (dialog?.open) dialog.close();
    onclose();
  }

  /** @param {Event} event */
  function handleCancel(event) {
    event.preventDefault();
    closeViewer();
  }

  /** @param {MouseEvent} event */
  function handleBackdrop(event) {
    if (event.target === dialog) closeViewer();
  }
</script>

<dialog bind:this={dialog} class="image-viewer" aria-label={image?.title ? `Enlarged image: ${image.title}` : 'Enlarged image'} oncancel={handleCancel} onclick={handleBackdrop}>
  {#if image}
    <div class="viewer-shell">
      <div class="viewer-heading">
        <div>
          {#if image.title}<strong>{image.title}</strong>{/if}
          {#if image.subtitle}<span>{image.subtitle}</span>{/if}
        </div>
        <button bind:this={closeButton} class="close-button" type="button" onclick={closeViewer}>Close</button>
      </div>
      <img src={image.src} alt={image.alt ?? ''} />
    </div>
  {/if}
</dialog>

<style>
  .image-viewer { width: min(96vw, 1600px); max-width: none; max-height: 94vh; padding: 0; border: 0; border-radius: 12px; background: #fff; box-shadow: 0 24px 80px rgb(16 24 40 / 28%); }
  .image-viewer::backdrop { background: rgb(16 24 40 / 72%); }
  .viewer-shell { display: grid; max-height: 94vh; grid-template-rows: auto minmax(0, 1fr); }
  .viewer-heading { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: 0.8rem 1rem; border-bottom: 1px solid #e4e7ec; }
  .viewer-heading > div { display: grid; gap: 0.15rem; min-width: 0; overflow-wrap: anywhere; }
  .viewer-heading span { color: #667085; font-size: 0.86rem; }
  .viewer-shell img { display: block; width: 100%; height: auto; max-height: calc(94vh - 64px); object-fit: contain; background: #f2f4f7; }
  .close-button { padding: 0.6rem 0.85rem; border: 1px solid #cdd6e3; border-radius: 8px; background: #fff; color: #172033; font: inherit; font-weight: 700; cursor: pointer; }
  .close-button:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
</style>
