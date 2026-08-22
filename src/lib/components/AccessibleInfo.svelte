<script>
  /** @type {{ label: string, text: string }} */
  let { label, text } = $props();
  let open = $state(false);

  function toggle() {
    open = !open;
  }

  /** @param {KeyboardEvent} event */
  function keydown(event) {
    if (event.key !== 'Escape') return;
    open = false;
    if (event.currentTarget instanceof HTMLElement) event.currentTarget.blur();
  }
</script>

<span class="info-help" class:open>
  <button
    type="button"
    class="info-trigger"
    aria-label={`About ${label}: ${text}`}
    aria-expanded={open}
    onclick={toggle}
    onkeydown={keydown}
  >ⓘ</button>
  <span class="info-popover" role="tooltip">{text}</span>
</span>

<style>
  .info-help { position: relative; display: inline-flex; align-items: center; margin-left: 0.25rem; vertical-align: middle; }
  .info-trigger { display: inline-grid; place-items: center; width: 1.35rem; height: 1.35rem; padding: 0; border: 0; border-radius: 999px; background: transparent; color: #667085; cursor: help; font: inherit; font-size: 0.9rem; line-height: 1; }
  .info-trigger:focus-visible { outline: 3px solid #84adff; outline-offset: 2px; }
  .info-popover { position: absolute; z-index: 20; top: calc(100% + 0.35rem); left: 0; width: min(19rem, calc(100vw - 2rem)); padding: 0.55rem 0.65rem; border: 1px solid #d0d5dd; border-radius: 7px; background: #fff; box-shadow: 0 8px 24px rgb(16 24 40 / 14%); color: #344054; font-size: 0.8rem; font-weight: 500; line-height: 1.4; opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(-0.2rem); transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease; }
  .info-help:hover .info-popover, .info-help:focus-within .info-popover, .info-help.open .info-popover { opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0); }
</style>
