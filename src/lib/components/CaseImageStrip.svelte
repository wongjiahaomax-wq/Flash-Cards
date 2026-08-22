<script>
  /** @typedef {{ id: string, assetId?: string, imageUrl?: string | null, altText?: string | null, originalFilename?: string | null, captionMd?: string | null, status?: string | null }} StripItem */
  /** @type {{ label: string, items?: StripItem[], onselect?: (item: StripItem) => void }} */
  let { label, items = [], onselect = () => {} } = $props();
  /** @type {HTMLDivElement | undefined} */
  let strip = $state();

  /** @param {-1 | 1} direction */
  function scroll(direction) {
    if (!strip) return;
    strip.scrollBy({ left: direction * Math.max(220, strip.clientWidth * 0.72), behavior: 'smooth' });
  }
</script>

<div class="image-strip-shell" aria-label={label}>
  <button class="scroll-button" type="button" aria-label={`Scroll ${label} left`} onclick={() => scroll(-1)}>←</button>
  <div class="image-strip" bind:this={strip} role="list" aria-label={`${label}, ${items.length} images`}>
    {#each items as item, index (item.id)}
      <span class="strip-list-item" role="listitem">
        <button
          class="strip-item"
          type="button"
          aria-label={`Go to ${item.originalFilename ?? item.assetId ?? `image ${index + 1}`}`}
          onclick={() => onselect(item)}
        >
          <span class="strip-order">{index + 1}</span>
          {#if item.imageUrl}
            <img src={item.imageUrl} alt={item.altText ?? ''} loading="lazy" />
          {:else}
            <span class="missing-image">Inactive image</span>
          {/if}
          <span class="strip-copy">
            <strong>{item.originalFilename ?? item.assetId ?? `Image ${index + 1}`}</strong>
            {#if item.captionMd}<small>{item.captionMd}</small>{/if}
            {#if item.status}<small>{item.status}</small>{/if}
          </span>
        </button>
      </span>
    {/each}
  </div>
  <button class="scroll-button" type="button" aria-label={`Scroll ${label} right`} onclick={() => scroll(1)}>→</button>
</div>

<style>
  .image-strip-shell { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 0.45rem; align-items: center; }
  .image-strip { display: flex; gap: 0.55rem; min-width: 0; overflow-x: auto; overscroll-behavior-inline: contain; scroll-snap-type: inline proximity; scrollbar-width: thin; padding: 0.2rem 0.1rem 0.45rem; }
  .strip-list-item { flex: 0 0 clamp(155px, 21vw, 220px); min-width: 0; scroll-snap-align: start; }
  .strip-item { position: relative; display: grid; grid-template-rows: 105px auto; width: 100%; min-width: 0; padding: 0; overflow: hidden; border: 1px solid #dfe5ee; border-radius: 8px; background: #fff; color: #172033; text-align: left; cursor: pointer; }
  .strip-item:hover { border-color: #98a2b3; }
  .strip-item:focus-visible, .scroll-button:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  .strip-item img, .missing-image { display: grid; place-items: center; width: 100%; height: 105px; object-fit: contain; background: #eef2f6; color: #667085; font-size: 0.75rem; }
  .strip-order { position: absolute; z-index: 1; top: 0.35rem; left: 0.35rem; display: grid; place-items: center; min-width: 1.35rem; height: 1.35rem; padding: 0 0.2rem; border-radius: 999px; background: rgb(255 255 255 / 92%); color: #344054; font-size: 0.7rem; font-weight: 750; box-shadow: 0 1px 4px rgb(16 24 40 / 16%); }
  .strip-copy { display: grid; gap: 0.15rem; padding: 0.5rem 0.55rem; min-width: 0; overflow-wrap: anywhere; }
  .strip-copy strong { font-size: 0.78rem; line-height: 1.3; }
  .strip-copy small { color: #667085; font-size: 0.72rem; line-height: 1.25; }
  .scroll-button { width: 2rem; height: 2rem; padding: 0; border: 1px solid #d0d5dd; border-radius: 999px; background: #fff; color: #344054; cursor: pointer; font: inherit; }
  @media (max-width: 620px) {
    .image-strip-shell { grid-template-columns: minmax(0, 1fr); }
    .scroll-button { display: none; }
    .strip-list-item { flex-basis: min(72vw, 205px); }
  }
</style>
