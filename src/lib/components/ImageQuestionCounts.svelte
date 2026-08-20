<script>
  let { caseSpecificCount = 0, reusable } = $props();
</script>

<div class="question-counts" aria-label="Image question counts">
  <div class="count-row">
    <strong>Case-specific Image Questions · {caseSpecificCount}</strong>
  </div>
  <div class="count-row reusable-row">
    <strong>Reusable Image Questions · {reusable?.total ?? 0}</strong>
    {#if (reusable?.total ?? 0) > 0}
      <span class="muted">
        {#if (reusable?.used ?? 0) > 0}
          {reusable.used} used in this Case · {reusable.available} available to reuse
        {:else}
          {reusable?.available ?? reusable?.total ?? 0} available to reuse
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
