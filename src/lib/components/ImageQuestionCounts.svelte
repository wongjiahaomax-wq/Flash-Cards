<script>
  /** @typedef {{ total: number, used: number, available: number }} ReusableImageCountSummary */
  /** @type {{ caseSpecificCount?: number, reusable?: ReusableImageCountSummary }} */
  let { caseSpecificCount = 0, reusable } = $props();
  let reusableTotal = $derived(reusable?.total ?? 0);
  let reusableUsed = $derived(reusable?.used ?? 0);
  let reusableAvailable = $derived(reusable?.available ?? reusableTotal);
</script>

<!-- Both rows describe image-specific knowledge; the labels keep Case-specific and reusable ownership distinct. -->
<div class="question-counts" aria-label="Image question counts">
  <div class="count-row">
    <strong>Case-specific Image Questions · {caseSpecificCount}</strong>
  </div>
  <div class="count-row reusable-row">
    <strong>Reusable Image Questions · {reusableTotal}</strong>
    {#if reusableTotal > 0}
      <span class="muted">
        {#if reusableUsed > 0}
          {reusableUsed} used in this Case · {reusableAvailable} available to reuse
        {:else}
          {reusableAvailable} available to reuse
        {/if}
      </span>
    {/if}
  </div>
</div>

<style>
  .question-counts { display: grid; gap: 0.3rem; padding: 0.55rem 0.65rem; border: 1px solid #e4e7ec; border-radius: 7px; background: #fff; color: #344054; font-size: 0.82rem; }
  .count-row { display: grid; gap: 0.1rem; }
  .reusable-row { padding-top: 0.3rem; border-top: 1px solid #f2f4f7; }
  .muted { color: #667085; font-size: 0.78rem; font-weight: 500; }
</style>
