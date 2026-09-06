<script>
  let { progress } = $props();

  /** @param {number} part @param {number} whole */
  function percent(part, whole) {
    if (!whole) return 0;
    return Math.round((Number(part) / Number(whole)) * 100);
  }
</script>

{#if progress}
  <section class="progress-summary" aria-labelledby="progress-summary-title">
    <div class="progress-summary-heading">
      <div>
        <p class="eyebrow">Progress</p>
        <h2 id="progress-summary-title">Study activity</h2>
      </div>
      <a class="button" href="/study/progress">View detailed progress →</a>
    </div>
    <div class="progress-summary-metrics">
      <span><strong>{progress.memory.due}</strong> Due now</span>
      <span><strong>{percent(progress.coverage.enteredSrs, progress.coverage.eligibleCases)}%</strong> scheduling coverage</span>
      <span><strong>{progress.activity.scheduledCompleted}</strong> scheduled</span>
      <span><strong>{progress.activity.freeCompleted}</strong> Free Study</span>
    </div>
  </section>
{/if}

<style>
  .progress-summary { display:grid; gap:.8rem; padding:1rem 1.2rem; border:1px solid #dfe5ee; border-radius:14px; background:#fff; }
  .progress-summary-heading { display:flex; align-items:center; justify-content:space-between; gap:1rem; }
  .progress-summary h2 { margin:.2rem 0 0; }
  .eyebrow { margin:0; color:#667085; font-size:.76rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .progress-summary-metrics { display:flex; flex-wrap:wrap; gap:.55rem; }
  .progress-summary-metrics span { padding:.45rem .65rem; border-radius:999px; background:#f2f4f7; color:#475467; font-size:.85rem; }
  .progress-summary-metrics strong { color:#101828; }
  @media (max-width:620px) {
    .progress-summary-heading { display:grid; justify-items:start; }
  }
</style>
