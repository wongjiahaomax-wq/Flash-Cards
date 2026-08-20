<script>
  /** @typedef {{ total: number, used: number, available: number }} ReusableImageCountSummary */
  /** @typedef {{ questionPromptId?: string, promptMd: string, answerMd: string }} ImageQuestion */
  /** @type {{ caseSpecificCount?: number, caseSpecificQuestions?: ImageQuestion[], reusable?: ReusableImageCountSummary }} */
  let { caseSpecificCount = 0, caseSpecificQuestions = [], reusable } = $props();
  let reusableTotal = $derived(reusable?.total ?? 0);
  let reusableUsed = $derived(reusable?.used ?? 0);
  let reusableAvailable = $derived(reusable?.available ?? reusableTotal);
</script>

<!-- Both rows describe image-specific knowledge; the labels keep Case-specific and reusable ownership distinct. -->
<div class="question-counts" aria-label="Image question counts">
  <div class="count-row">
    <strong>Case-specific Image Questions · {caseSpecificCount}</strong>
    {#if caseSpecificQuestions.length > 0}
      <div class="qa-list">
        {#each caseSpecificQuestions as question, index (question.questionPromptId ?? index)}
          <div class="qa-pair">
            <div><span class="qa-label">Q</span><span>{question.promptMd}</span></div>
            <div><span class="qa-label answer">A</span><span>{question.answerMd}</span></div>
          </div>
        {/each}
      </div>
    {/if}
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
  .qa-list { display: grid; gap: 0.45rem; margin-top: 0.25rem; }
  .qa-pair { display: grid; gap: 0.3rem; padding: 0.5rem; border: 1px solid #e4e7ec; border-radius: 6px; background: #f8fafc; color: #344054; line-height: 1.35; overflow-wrap: anywhere; }
  .qa-pair > div { display: grid; grid-template-columns: 1.35rem minmax(0, 1fr); gap: 0.35rem; align-items: start; }
  .qa-label { display: inline-grid; place-items: center; width: 1.25rem; height: 1.25rem; border-radius: 999px; background: #172033; color: #fff; font-size: 0.68rem; font-weight: 750; }
  .qa-label.answer { background: #e8f5ee; color: #067647; }
</style>
